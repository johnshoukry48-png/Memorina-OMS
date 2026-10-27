-- ============================================================
-- Memorina OMS — Feature batch (due dates, order editing, file
-- links, per-item checklist, direct assignment, collected stage,
-- standalone expenses, and the money-visibility security fix).
-- Run AFTER 001 through 009.
--
-- SAFE TO RUN MORE THAN ONCE: every step below checks whether it
-- already happened before doing anything, so re-running this file
-- after a partial failure (or just to be sure) will not error and
-- will not duplicate or lose data. If you hit an error on your
-- first attempt, just run the whole file again from the top.
-- ============================================================

-- ------------------------------------------------------------
-- PART A — Money columns move off `orders` into their own table.
--
-- WHY: Postgres RLS controls which ROWS you can see, not which
-- COLUMNS. Every employee who could see an order row (because it
-- was at their stage) could also already see its grand_total,
-- total_paid, remaining_balance, etc — there was no way to hide
-- just the money columns while keeping the row visible, as long as
-- they lived on the same `orders` table. Moving them to their own
-- table lets that table carry its own strict RLS (admin + order
-- manager + shipping only) while `orders` itself stays visible to
-- whoever already could see it — nothing else about order
-- visibility changes.
-- ------------------------------------------------------------
create table if not exists public.order_financials (
  order_id          uuid primary key references public.orders(id) on delete cascade,
  discount          numeric(12,2) not null default 0 check (discount >= 0),
  shipping_cost     numeric(12,2) not null default 0 check (shipping_cost >= 0),
  subtotal          numeric(12,2) not null default 0,
  grand_total       numeric(12,2) not null default 0,
  total_paid        numeric(12,2) not null default 0,
  remaining_balance numeric(12,2) not null default 0
);

-- Copy existing money data over, but only for orders that don't
-- already have a financials row AND only while `orders` still has
-- the old columns (both true on a fresh run; both false — so this
-- just does nothing — if this part already completed before).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'grand_total'
  ) then
    insert into public.order_financials (order_id, discount, shipping_cost, subtotal, grand_total, total_paid, remaining_balance)
    select o.id, o.discount, o.shipping_cost, o.subtotal, o.grand_total, o.total_paid, o.remaining_balance
    from public.orders o
    where not exists (select 1 from public.order_financials f where f.order_id = o.id);
  end if;
end $$;

-- Re-point the two views that read these columns at order_financials
-- BEFORE dropping the columns below — otherwise Postgres refuses the
-- drop because the old view bodies still reference them.
create or replace view public.v_orders_dashboard as
select
  o.id,
  o.order_number,
  o.customer_id,
  o.status,
  o.current_stage,
  o.assigned_user_id,
  o.due_date,
  o.order_date,
  f.grand_total,
  f.total_paid,
  f.remaining_balance,
  o.created_at,
  (o.due_date is not null and o.due_date < now() and o.status = 'active') as is_overdue
from public.orders o
left join public.order_financials f on f.order_id = o.id;

create or replace view public.order_financials_admin as
select
  o.id as order_id,
  o.order_number,
  f.grand_total,
  f.total_paid,
  f.remaining_balance,
  coalesce(sum(e.amount), 0) as total_expenses,
  f.grand_total - coalesce(sum(e.amount), 0) as net_result
from public.orders o
join public.order_financials f on f.order_id = o.id
left join public.expenses e on e.order_id = o.id
group by o.id, o.order_number, f.grand_total, f.total_paid, f.remaining_balance;

alter table public.orders drop column if exists discount;
alter table public.orders drop column if exists shipping_cost;
alter table public.orders drop column if exists subtotal;
alter table public.orders drop column if exists grand_total;
alter table public.orders drop column if exists total_paid;
alter table public.orders drop column if exists remaining_balance;

-- auto-create a zeroed financials row whenever an order is created
create or replace function public.fn_create_order_financials()
returns trigger language plpgsql as $$
begin
  insert into public.order_financials (order_id)
  values (new.id)
  on conflict (order_id) do nothing;
  return null;
end;
$$;

drop trigger if exists trg_orders_create_financials on public.orders;
create trigger trg_orders_create_financials
after insert on public.orders
for each row execute function public.fn_create_order_financials();

alter table public.order_financials enable row level security;

drop policy if exists "order_financials_select" on public.order_financials;
create policy "order_financials_select"
on public.order_financials for select
using (
  public.fn_is_admin()
  or public.fn_my_role() = 'order_manager'
  or public.fn_my_role() = 'shipping'
);

-- Admin/order_manager can set discount/shipping_cost when building an
-- order. subtotal/grand_total/total_paid/remaining_balance are
-- recomputed from source data on every write regardless of what's
-- sent (same pattern as the Phase 8 audit fix), so this broad grant
-- can't be used to falsify a total.
drop policy if exists "order_financials_update" on public.order_financials;
create policy "order_financials_update"
on public.order_financials for update
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager')
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

-- recompute logic now targets order_financials instead of orders
create or replace function public.fn_recompute_order_totals(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_subtotal numeric(12,2);
begin
  select coalesce(sum(total_price), 0) into v_subtotal
  from public.order_items where order_id = p_order_id;

  update public.order_financials
  set subtotal = v_subtotal,
      grand_total = v_subtotal - discount + shipping_cost,
      remaining_balance = (v_subtotal - discount + shipping_cost) - total_paid
  where order_id = p_order_id;
end;
$$;

create or replace function public.fn_recompute_order_payment(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_total_paid numeric(12,2);
begin
  select coalesce(sum(amount), 0) into v_total_paid
  from public.payments where order_id = p_order_id;

  update public.order_financials
  set total_paid = v_total_paid,
      remaining_balance = grand_total - v_total_paid
  where order_id = p_order_id;
end;
$$;

-- hardened recompute: ALWAYS derives subtotal/total_paid/grand_total/
-- remaining_balance from source data on every write to this table,
-- regardless of what the client sent — same invariant as before,
-- just living here now.
create or replace function public.fn_financials_recalc()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_subtotal numeric(12,2);
  v_total_paid numeric(12,2);
begin
  select coalesce(sum(total_price), 0) into v_subtotal
  from public.order_items where order_id = new.order_id;

  select coalesce(sum(amount), 0) into v_total_paid
  from public.payments where order_id = new.order_id;

  new.subtotal := v_subtotal;
  new.total_paid := v_total_paid;
  new.grand_total := v_subtotal - new.discount + new.shipping_cost;
  new.remaining_balance := new.grand_total - v_total_paid;
  return new;
end;
$$;

drop trigger if exists trg_orders_money_recalc on public.orders;
drop trigger if exists trg_order_financials_recalc on public.order_financials;
create trigger trg_order_financials_recalc
before insert or update on public.order_financials
for each row execute function public.fn_financials_recalc();

-- overpayment guard now checks order_financials
create or replace function public.fn_validate_payment_overpay()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_grand_total numeric(12,2);
  v_current_paid numeric(12,2);
begin
  perform 1 from public.order_financials where order_id = new.order_id for update;

  select grand_total into v_grand_total from public.order_financials where order_id = new.order_id;
  select coalesce(sum(amount), 0) into v_current_paid from public.payments where order_id = new.order_id;

  if (v_current_paid + new.amount) > v_grand_total and not public.fn_is_admin() then
    raise exception 'المبلغ المدفوع يتجاوز إجمالي الطلب — هذا يتطلب صلاحية المدير';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- PART B — Due date defaults to 10 days out, still editable.
-- ------------------------------------------------------------
create or replace function public.fn_default_due_date()
returns trigger language plpgsql as $$
begin
  if new.due_date is null then
    new.due_date := new.order_date + interval '10 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_default_due_date on public.orders;
create trigger trg_orders_default_due_date
before insert on public.orders
for each row execute function public.fn_default_due_date();

-- ------------------------------------------------------------
-- PART C — File links (a URL instead of an uploaded file).
-- ------------------------------------------------------------
alter table public.files alter column storage_path drop not null;
alter table public.files add column if not exists link_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'files_storage_or_link') then
    alter table public.files add constraint files_storage_or_link
      check (storage_path is not null or link_url is not null);
  end if;
end $$;

-- ------------------------------------------------------------
-- PART D — "Collected" stage, after "Delivered".
-- ------------------------------------------------------------
insert into public.workflow_stages (code, label_ar, sort_order)
values ('COLLECTED', 'تم التحصيل', 8)
on conflict (code) do nothing;

update public.workflow_stages set sort_order = 9 where code = 'CANCELLED';

insert into public.workflow_transitions (from_stage, to_stage)
values ('DELIVERED', 'COLLECTED')
on conflict (from_stage, to_stage) do nothing;

-- ------------------------------------------------------------
-- PART E — Per-item progress checklist (designer/printing/etc tick
-- off each item individually at their stage).
-- ------------------------------------------------------------
create table if not exists public.item_progress (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items(id) on delete cascade,
  stage          text not null references public.workflow_stages(code),
  completed      boolean not null default false,
  completed_by   uuid references public.profiles(id),
  completed_at   timestamptz,
  unique (order_item_id, stage)
);

create index if not exists idx_item_progress_order_item_id on public.item_progress(order_item_id);

alter table public.item_progress enable row level security;

drop policy if exists "item_progress_select_via_order" on public.item_progress;
create policy "item_progress_select_via_order"
on public.item_progress for select
using (
  exists (
    select 1 from public.order_items oi
    where oi.id = item_progress.order_item_id
      and public.fn_can_view_order(oi.order_id)
  )
);

-- Toggling a checkbox is authorized the same way advancing a stage is:
-- admin/order_manager any time, or the assigned employee while the
-- order sits at their own stage.
create or replace function public.fn_toggle_item_progress(p_order_item_id uuid, p_stage text, p_completed boolean)
returns public.item_progress
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_row public.item_progress;
begin
  select order_id into v_order_id from public.order_items where id = p_order_item_id;

  if not (
    public.fn_is_admin()
    or public.fn_my_role() = 'order_manager'
    or exists (
      select 1 from public.orders o
      where o.id = v_order_id
        and o.assigned_user_id = auth.uid()
        and o.current_stage = p_stage
        and o.current_stage = public.fn_my_stage()
    )
  ) then
    raise exception 'لا يمكنك تعديل هذا العنصر في هذه المرحلة';
  end if;

  insert into public.item_progress (order_item_id, stage, completed, completed_by, completed_at)
  values (p_order_item_id, p_stage, p_completed, auth.uid(), case when p_completed then now() else null end)
  on conflict (order_item_id, stage)
  do update set completed = p_completed,
                completed_by = auth.uid(),
                completed_at = case when p_completed then now() else null end
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.fn_toggle_item_progress(uuid, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- PART F — fn_advance_stage: optional direct assignment to a
-- specific person, instead of always leaving it for the department
-- queue to self-claim. Also records elapsed time per assignment
-- (order_assignments.claimed_at/released_at already captured this —
-- this part just lets admin/order_manager set it directly too).
-- ------------------------------------------------------------
create or replace function public.fn_advance_stage(p_order_id uuid, p_to_stage text, p_assign_to_user_id uuid default null)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_role user_role;
  v_order public.orders;
  v_target_role user_role;
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
    -- a production employee can never hand the order to someone else
    p_assign_to_user_id := null;
  end if;

  if p_assign_to_user_id is not null then
    select pr.role into v_target_role
    from public.profiles pr
    where pr.id = p_assign_to_user_id and pr.active = true;

    if v_target_role is null or not exists (
      select 1 from public.role_stage_map where stage = p_to_stage and role = v_target_role
    ) then
      raise exception 'الشخص المحدد لا يعمل في هذه المرحلة';
    end if;
  end if;

  update public.orders
  set current_stage = p_to_stage,
      assigned_user_id = case
                           when p_to_stage in ('DELIVERED','COLLECTED','CANCELLED') then assigned_user_id
                           else p_assign_to_user_id
                         end,
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

  if p_assign_to_user_id is not null and p_to_stage not in ('DELIVERED','COLLECTED','CANCELLED') then
    insert into public.order_assignments (order_id, user_id, role_at_assignment, claimed_at)
    values (p_order_id, p_assign_to_user_id, v_target_role, now());
  end if;

  return v_order;
end;
$$;

grant execute on function public.fn_advance_stage(uuid, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- PART G — standalone expenses are already supported by the
-- `expenses` table from migration 005 (order_id is nullable there).
-- No schema change needed — just stop writing per-order expenses
-- from the UI (frontend change) and use order_id = null going
-- forward for general business expenses. Existing per-order rows,
-- if any, are left as-is (harmless, just no longer shown per-order).
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- VERIFICATION — run this after the migration to confirm it
-- landed correctly. Expect: has_order_financials_table = true,
-- orders_still_has_money_columns = false, financials_row_count
-- roughly equal to your total order count.
-- ------------------------------------------------------------
select
  exists (select 1 from information_schema.tables where table_schema='public' and table_name='order_financials') as has_order_financials_table,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='grand_total') as orders_still_has_money_columns,
  (select count(*) from public.order_financials) as financials_row_count,
  (select count(*) from public.orders) as orders_row_count;
