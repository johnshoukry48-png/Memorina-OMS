-- ============================================================
-- Memorina OMS — ROOT-CAUSE FIX for "can't create an order" (403).
--
-- What was wrong: when an order is created, a trigger automatically
-- creates its row in order_financials. That trigger ran with the
-- logged-in user's own permissions, and order_financials has no
-- INSERT policy (on purpose — nobody should insert money rows by
-- hand). So the database rejected the trigger's insert, and the
-- whole order creation failed with 403.
--
-- The fix: these internal bookkeeping functions must run with the
-- function owner's rights (SECURITY DEFINER), exactly like the other
-- internal triggers in this project. No policy is loosened, nobody
-- gains any new access.
--
-- Safe to run more than once.
-- ============================================================

create or replace function public.fn_create_order_financials()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.order_financials (order_id)
  values (new.id)
  on conflict (order_id) do nothing;
  return null;
end;
$$;

create or replace function public.fn_recompute_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
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
returns void
language plpgsql
security definer set search_path = public
as $$
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

-- The two small trigger wrappers that call the functions above:
create or replace function public.fn_order_items_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.fn_recompute_order_totals(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

create or replace function public.fn_payments_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.fn_recompute_order_payment(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

-- Repair: any order that ended up without a financials row (from the
-- failed attempts) gets one now, then every row is recalculated from
-- its real items and payments.
insert into public.order_financials (order_id)
select o.id from public.orders o
where not exists (select 1 from public.order_financials f where f.order_id = o.id);

update public.order_financials set discount = discount;

-- Result: orders vs financials rows should be equal.
select
  (select count(*) from public.orders) as orders_count,
  (select count(*) from public.order_financials) as financials_count;
