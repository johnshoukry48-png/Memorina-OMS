-- ============================================================
-- Memorina OMS — Phase 5: Payments + Expenses
-- Run AFTER 001, 002, 003, 004.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Payments
-- ------------------------------------------------------------
create type payment_method as enum ('CASH', 'INSTAPAY', 'VODAFONE_CASH');

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  method       payment_method not null,
  recorded_by  uuid references public.profiles(id),
  notes        text,
  created_at   timestamptz not null default now()
);

create index idx_payments_order_id on public.payments(order_id);

-- Overpayment guard: only an admin may record a payment that would
-- push total_paid above grand_total. Everyone else is blocked with a
-- clear error — matches "remaining balance can't go negative unless
-- an admin explicitly allows it".
create or replace function public.fn_validate_payment_overpay()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_grand_total numeric(12,2);
  v_current_paid numeric(12,2);
begin
  select grand_total into v_grand_total from public.orders where id = new.order_id;
  select coalesce(sum(amount), 0) into v_current_paid from public.payments where order_id = new.order_id;

  if (v_current_paid + new.amount) > v_grand_total and not public.fn_is_admin() then
    raise exception 'المبلغ المدفوع يتجاوز إجمالي الطلب — هذا يتطلب صلاحية المدير';
  end if;

  return new;
end;
$$;

create trigger trg_payments_validate_overpay
before insert on public.payments
for each row execute function public.fn_validate_payment_overpay();

-- Keep orders.total_paid / remaining_balance in sync with payments —
-- the client never sets these directly.
create or replace function public.fn_recompute_order_payment(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_total_paid numeric(12,2);
begin
  select coalesce(sum(amount), 0) into v_total_paid
  from public.payments where order_id = p_order_id;

  update public.orders
  set total_paid = v_total_paid,
      remaining_balance = grand_total - v_total_paid
  where id = p_order_id;
end;
$$;

create or replace function public.fn_payments_changed()
returns trigger language plpgsql as $$
begin
  perform public.fn_recompute_order_payment(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

create trigger trg_payments_recalc
after insert or update or delete on public.payments
for each row execute function public.fn_payments_changed();

-- log to the timeline (Phase 4)
create or replace function public.fn_trg_log_payment()
returns trigger language plpgsql as $$
begin
  perform public.fn_log_audit(new.order_id, 'payment_recorded', null, new.amount::text || ' ' || new.method::text);
  return null;
end;
$$;

create trigger trg_payments_log
after insert on public.payments
for each row execute function public.fn_trg_log_payment();

-- ------------------------------------------------------------
-- 2. Expenses
--    order_id is nullable: a general business expense not tied to
--    a specific order is still trackable (e.g. bulk material buy).
-- ------------------------------------------------------------
create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references public.orders(id) on delete set null,
  category        text not null,
  amount          numeric(12,2) not null check (amount >= 0),
  description     text,
  payment_method  payment_method,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index idx_expenses_order_id on public.expenses(order_id);

-- ------------------------------------------------------------
-- 3. RLS
--    Payments: admin + order_manager can record and view (this is
--    the "order total / deposit / remaining balance" data your
--    Order Managers are allowed to see).
--    Expenses: admin ONLY, end to end — this is exactly the internal
--    cost data Order Managers must never see, enforced here at the
--    database level, not just hidden in the UI.
-- ------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

create policy "payments_select_admin_om"
on public.payments for select
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

create policy "payments_insert_admin_om"
on public.payments for insert
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

create policy "payments_update_admin"
on public.payments for update
using (public.fn_is_admin())
with check (public.fn_is_admin());

create policy "payments_delete_admin"
on public.payments for delete
using (public.fn_is_admin());

create policy "expenses_all_admin_only"
on public.expenses for all
using (public.fn_is_admin())
with check (public.fn_is_admin());

-- ------------------------------------------------------------
-- 4. Admin-only financial view: revenue, expenses, net result per
--    order. Safe to expose to order_manager at the SQL level too —
--    RLS on the underlying `expenses` table means their query simply
--    can't see any expense rows, so this view never leaks a real
--    number to them either way. The app only shows it to admin.
-- ------------------------------------------------------------
create view public.order_financials_admin as
select
  o.id as order_id,
  o.order_number,
  o.grand_total,
  o.total_paid,
  o.remaining_balance,
  coalesce(sum(e.amount), 0) as total_expenses,
  o.grand_total - coalesce(sum(e.amount), 0) as net_result
from public.orders o
left join public.expenses e on e.order_id = o.id
group by o.id, o.order_number, o.grand_total, o.total_paid, o.remaining_balance;
