-- ============================================================
-- OPTIONAL SELF-TEST — run this AFTER 013, as its own separate run.
--
-- It pretends to be your admin account, creates a test order with
-- one item, checks that the money row was created and the total was
-- computed, and then deliberately raises an error at the end so
-- NOTHING is saved. The "error" you'll see is the result:
--   - message starting with  SELFTEST PASSED  = everything works.
--   - anything else = copy that message and send it to me.
--
-- (It needs at least one customer to exist. It uses up one order
-- number from the counter, which is harmless.)
-- ============================================================
do $$
declare
  v_admin uuid := 'b47bd5e8-cfda-4d36-b025-e28060a0c696';
  v_cust uuid;
  v_order uuid;
  v_ok int;
begin
  select id into v_cust from public.customers limit 1;
  if v_cust is null then
    raise exception 'SELFTEST: no customers exist yet — add one customer first, then run again';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  insert into public.orders (customer_id) values (v_cust) returning id into v_order;
  insert into public.order_items (order_id, name, quantity, unit_price) values (v_order, 'selftest', 2, 50);

  select count(*) into v_ok from public.order_financials where order_id = v_order and grand_total = 100;

  if v_ok = 1 then
    raise exception 'SELFTEST PASSED ✅ — admin can create an order, its money row was created automatically, and the total (100) was computed correctly. Nothing was saved.';
  else
    raise exception 'SELFTEST FAILED ❌ — order was created but its money row/total is wrong (matching rows: %)', v_ok;
  end if;
end $$;
