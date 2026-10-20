-- ============================================================
-- Memorina OMS — Phase 8: Security / RLS audit fixes
-- Run AFTER 001 through 007.
-- See docs/SECURITY_AUDIT.md for the full write-up of what was
-- checked. This migration fixes the handful of real gaps found.
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1 — Deactivating a user (profiles.active = false) did not
-- actually cut off their role-based access. fn_is_admin() already
-- checked active=true, but fn_my_role() did not — so a deactivated
-- designer, for example, could still claim/advance tasks as long as
-- their Supabase Auth login still worked. Every policy that calls
-- fn_my_role()/fn_my_stage() now automatically enforces "must still
-- be active" with this one change.
-- ------------------------------------------------------------
create or replace function public.fn_my_role()
returns user_role
language sql security definer set search_path = public stable
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

-- ------------------------------------------------------------
-- FIX 2 — Team members' names weren't visible to each other.
-- profiles RLS only allowed "your own row" or "admin sees all", so
-- any screen showing another user's name (Reports → orders by
-- employee, the order timeline's "moved by <name>", assignee labels)
-- silently returned blank names for anyone who wasn't admin.
-- This is a small internal team — reasonable for everyone
-- signed in to see each other's name/role, still not phone numbers
-- or anything beyond that... but RLS is row-level, not column-level,
-- so this policy does open the whole row. Given this system's size
-- (~12 people) that's an acceptable trade-off; flagged in the audit
-- doc if you'd rather restrict it with a dedicated public-profile view.
-- ------------------------------------------------------------
create policy "profiles_select_teammates"
on public.profiles for select
using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- FIX 3 — Shipping (and any other role) couldn't see customer name
-- or phone at all — only order_manager/admin could read `customers`.
-- Spec requires Shipping to see customer shipping info. Customers
-- are now visible to anyone who can already view one of their orders
-- (reuses fn_can_view_order — same rule as files/comments/audit_logs).
-- ------------------------------------------------------------
create policy "customers_select_via_order"
on public.customers for select
using (
  exists (
    select 1 from public.orders o
    where o.customer_id = customers.id
      and public.fn_can_view_order(o.id)
  )
);

-- ------------------------------------------------------------
-- FIX 4 — The real one: orders.subtotal / grand_total / total_paid /
-- remaining_balance could be overwritten with an arbitrary value by
-- anyone holding the general admin/order_manager UPDATE grant on
-- `orders`, AS LONG AS they didn't also change discount/shipping_cost/
-- total_paid in the same request (the old trigger only recalculated
-- when one of those three changed — a direct
-- `update orders set grand_total = 999999 where id = ...` slipped
-- through untouched). Money fields are now recomputed from their
-- authoritative sources on every single insert/update, full stop —
-- there is no code path left where a client-supplied number for any
-- of these four columns survives.
-- ------------------------------------------------------------
create or replace function public.fn_order_money_fields_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_subtotal numeric(12,2);
  v_total_paid numeric(12,2);
begin
  select coalesce(sum(total_price), 0) into v_subtotal
  from public.order_items where order_id = new.id;

  select coalesce(sum(amount), 0) into v_total_paid
  from public.payments where order_id = new.id;

  new.subtotal := v_subtotal;
  new.total_paid := v_total_paid;
  new.grand_total := v_subtotal - new.discount + new.shipping_cost;
  new.remaining_balance := new.grand_total - v_total_paid;

  return new;
end;
$$;

drop trigger if exists trg_orders_money_recalc on public.orders;
create trigger trg_orders_money_recalc
before insert or update on public.orders
for each row execute function public.fn_order_money_fields_changed();

-- ------------------------------------------------------------
-- FIX 5 — Closed a narrow race window in the overpayment guard:
-- two payments submitted for the same order at almost the same
-- instant could both pass the "does this overpay?" check before
-- either commits. Locking the order row for the duration of the
-- check makes the second request wait for the first to finish, so
-- it sees the up-to-date total_paid. Low real-world risk for a
-- small team, but free to close.
-- ------------------------------------------------------------
create or replace function public.fn_validate_payment_overpay()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_grand_total numeric(12,2);
  v_current_paid numeric(12,2);
begin
  perform 1 from public.orders where id = new.order_id for update;

  select grand_total into v_grand_total from public.orders where id = new.order_id;
  select coalesce(sum(amount), 0) into v_current_paid from public.payments where order_id = new.order_id;

  if (v_current_paid + new.amount) > v_grand_total and not public.fn_is_admin() then
    raise exception 'المبلغ المدفوع يتجاوز إجمالي الطلب — هذا يتطلب صلاحية المدير';
  end if;

  return new;
end;
$$;
