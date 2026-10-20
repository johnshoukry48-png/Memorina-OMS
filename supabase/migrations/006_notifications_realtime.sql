-- ============================================================
-- Memorina OMS — Phase 6: Notifications + Realtime
-- Run AFTER 001 through 005.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Notifications
-- ------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  order_id    uuid references public.orders(id) on delete cascade,
  type        text not null,
  message_ar  text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user_id on public.notifications(user_id, read_at);
create index idx_notifications_order_id on public.notifications(order_id);

alter table public.notifications enable row level security;

-- Everyone can read + mark-as-read only their own notifications.
create policy "notifications_select_own"
on public.notifications for select
using (user_id = auth.uid());

create policy "notifications_update_own_read"
on public.notifications for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- No insert/delete policy for anyone — only the SECURITY DEFINER
-- functions below (and the scheduled overdue check) write rows here.

create or replace function public.fn_notify(p_user_id uuid, p_order_id uuid, p_type text, p_message_ar text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, order_id, type, message_ar)
  values (p_user_id, p_order_id, p_type, p_message_ar);
end;
$$;

-- ------------------------------------------------------------
-- 2. "Your stage has a task ready" — fires whenever an order lands
--    on a production stage unclaimed. Notifies every active employee
--    whose role matches that stage.
-- ------------------------------------------------------------
create or replace function public.fn_trg_notify_stage_ready()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role user_role;
  v_msg text;
  v_user record;
begin
  if new.current_stage is distinct from old.current_stage
     and new.assigned_user_id is null
     and new.current_stage in ('DESIGN','PRINTING','ASSEMBLY','PACKAGING','SHIPPING')
  then
    select stage_role.role into v_role
    from (select role from public.role_stage_map where stage = new.current_stage) stage_role;

    v_msg := 'الطلب #' || new.order_number || ' جاهز لك في مرحلة ' ||
             (select label_ar from public.workflow_stages where code = new.current_stage);

    for v_user in
      select id from public.profiles where role = v_role and active = true
    loop
      perform public.fn_notify(v_user.id, new.id, 'stage_ready', v_msg);
    end loop;
  end if;
  return null;
end;
$$;

create trigger trg_orders_notify_stage_ready
after update on public.orders
for each row execute function public.fn_trg_notify_stage_ready();

-- ------------------------------------------------------------
-- 3. "Order overdue" — a scheduled daily check (not the frontend).
--    Notifies admin, order_manager, and whoever it's assigned to.
--    Requires the pg_cron extension (Database → Extensions in the
--    Supabase dashboard — free to enable).
-- ------------------------------------------------------------
create or replace function public.fn_check_overdue_orders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order record;
  v_msg text;
  v_recipient record;
begin
  for v_order in
    select * from public.orders
    where status = 'active'
      and due_date is not null
      and due_date < now()
      -- avoid re-notifying the same order more than once every 24h
      and not exists (
        select 1 from public.notifications n
        where n.order_id = orders.id
          and n.type = 'overdue'
          and n.created_at > now() - interval '24 hours'
      )
  loop
    v_msg := 'الطلب #' || v_order.order_number || ' متأخر عن موعد التسليم';

    for v_recipient in
      select id from public.profiles
      where active = true and (role in ('admin','order_manager') or id = v_order.assigned_user_id)
    loop
      perform public.fn_notify(v_recipient.id, v_order.id, 'overdue', v_msg);
    end loop;
  end loop;
end;
$$;

-- Uncomment after enabling the pg_cron extension:
-- select cron.schedule('memorina-overdue-check', '0 8 * * *', 'select public.fn_check_overdue_orders();');

-- ------------------------------------------------------------
-- 4. Realtime — let the frontend subscribe to new/updated
--    notifications without polling.
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.notifications;
