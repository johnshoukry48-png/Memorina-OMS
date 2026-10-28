-- ============================================================
-- Memorina OMS — Undo the over-permissive patch, restore proper
-- RLS, and add defensive policies in case something was actually
-- missing before.
-- Run this once, in the Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- PART A — Remove the dangerous policies (any authenticated user
-- could insert/update financial data and order items on ANY order).
-- ------------------------------------------------------------
drop policy if exists "order_financials_insert" on public.order_financials;
drop policy if exists "order_items_insert" on public.order_items;
drop policy if exists "order_items_update" on public.order_items;
-- Note: "order_financials_update" is NOT dropped here — a correct
-- version of it (admin/order_manager only) already exists from
-- migration 010 and gets re-asserted below, which replaces it safely.

-- ------------------------------------------------------------
-- PART B — Re-assert the correct policies (admin + order_manager
-- only), in case anything was actually missing or got overwritten.
-- ------------------------------------------------------------
drop policy if exists "order_financials_update" on public.order_financials;
create policy "order_financials_update"
on public.order_financials for update
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager')
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

drop policy if exists "order_items_write_admin_om" on public.order_items;
create policy "order_items_write_admin_om"
on public.order_items for insert
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

drop policy if exists "order_items_update_admin_om" on public.order_items;
create policy "order_items_update_admin_om"
on public.order_items for update
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager')
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

drop policy if exists "order_items_delete_admin_om" on public.order_items;
create policy "order_items_delete_admin_om"
on public.order_items for delete
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

-- ------------------------------------------------------------
-- VERIFICATION — run this and check: every row below should show
-- "admin/OM only" in the condition, never "true".
-- ------------------------------------------------------------
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('order_financials', 'order_items')
order by tablename, cmd;
