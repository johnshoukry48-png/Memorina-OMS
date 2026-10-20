-- ============================================================
-- Memorina OMS — Phase 3: Workflow + Task Assignment
-- Run AFTER 001_auth_roles.sql and 002_customers_orders.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Order assignments — history of who claimed which order,
--    at which stage, and when they handed it off.
-- ------------------------------------------------------------
create table public.order_assignments (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  user_id           uuid not null references public.profiles(id),
  role_at_assignment user_role not null,
  claimed_at        timestamptz not null default now(),
  released_at       timestamptz
);

create index idx_order_assignments_order_id on public.order_assignments(order_id);
create index idx_order_assignments_user_id on public.order_assignments(user_id);

alter table public.order_assignments enable row level security;

create policy "order_assignments_select_admin_om"
on public.order_assignments for select
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

create policy "order_assignments_select_own"
on public.order_assignments for select
using (user_id = auth.uid());

-- No insert/update/delete policies for anyone: rows are only ever
-- written by the SECURITY DEFINER functions below, which bypass RLS
-- internally after doing their own authorization checks.

-- ------------------------------------------------------------
-- 2. Enforce the workflow state machine on EVERY update to
--    orders.current_stage — no matter who makes the change or
--    how (direct table update or an RPC function). Admins are
--    the one exception, since they occasionally need to correct
--    a mistake (e.g. an order wrongly marked CANCELLED).
-- ------------------------------------------------------------
create or replace function public.fn_validate_stage_transition()
returns trigger language plpgsql as $$
begin
  if new.current_stage is distinct from old.current_stage then
    if not public.fn_is_admin() then
      if not exists (
        select 1 from public.workflow_transitions
        where from_stage = old.current_stage and to_stage = new.current_stage
      ) then
        raise exception 'انتقال غير مسموح به من % إلى %', old.current_stage, new.current_stage;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_orders_validate_stage
before update on public.orders
for each row execute function public.fn_validate_stage_transition();

-- ------------------------------------------------------------
-- 3. Claim a task — atomic, race-safe: two employees clicking
--    "claim" on the same order at the same instant can never both
--    succeed. Only the caller's own mapped stage is eligible.
-- ------------------------------------------------------------
create or replace function public.fn_claim_task(p_order_id uuid)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_stage text;
  v_order public.orders;
begin
  v_stage := public.fn_my_stage();
  if v_stage is null then
    raise exception 'دورك الوظيفي لا يملك مهامًا في سير العمل';
  end if;

  update public.orders
  set assigned_user_id = auth.uid()
  where id = p_order_id
    and current_stage = v_stage
    and assigned_user_id is null
  returning * into v_order;

  if v_order.id is null then
    raise exception 'تم استلام هذه المهمة من قبل موظف آخر، أو أنها ليست في مرحلتك الحالية';
  end if;

  insert into public.order_assignments (order_id, user_id, role_at_assignment, claimed_at)
  values (p_order_id, auth.uid(), public.fn_my_role(), now());

  return v_order;
end;
$$;

grant execute on function public.fn_claim_task(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Advance an order to its next stage.
--    - admin / order_manager: can move any order (still validated
--      by the transition trigger above, admin only is exempt).
--    - production employee: only an order currently assigned to
--      them, at their own stage.
--    Moving to a new (non-terminal) stage clears assigned_user_id
--    so the next department's queue picks it up as "available".
-- ------------------------------------------------------------
create or replace function public.fn_advance_stage(p_order_id uuid, p_to_stage text)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_role user_role;
  v_order public.orders;
begin
  v_role := public.fn_my_role();

  if not (public.fn_is_admin() or v_role = 'order_manager') then
    if not exists (
      select 1 from public.orders
      where id = p_order_id
        and assigned_user_id = auth.uid()
        and current_stage = public.fn_my_stage()
    ) then
      raise exception 'لا يمكنك نقل هذا الطلب — إنه ليس بحوزتك حاليًا';
    end if;
  end if;

  update public.orders
  set current_stage = p_to_stage,
      assigned_user_id = case when p_to_stage in ('DELIVERED','CANCELLED') then assigned_user_id else null end,
      status = case
                 when p_to_stage = 'DELIVERED' then 'completed'::order_overall_status
                 when p_to_stage = 'CANCELLED' then 'cancelled'::order_overall_status
                 else status
               end,
      completed_at = case when p_to_stage = 'DELIVERED' then now() else completed_at end
  where id = p_order_id
  returning * into v_order;

  update public.order_assignments
  set released_at = now()
  where order_id = p_order_id and user_id = auth.uid() and released_at is null;

  return v_order;
end;
$$;

grant execute on function public.fn_advance_stage(uuid, text) to authenticated;
