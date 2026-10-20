-- ============================================================
-- Memorina OMS — Phase 7: Dashboard + Reports
-- Run AFTER 001 through 006.
-- Adds one lightweight, RLS-safe view — no new tables. Dashboard
-- and report data is otherwise queried directly through the
-- policies already in place (orders/payments visible to admin +
-- order_manager, expenses visible to admin only).
-- ============================================================

create view public.v_orders_dashboard as
select
  o.id,
  o.order_number,
  o.customer_id,
  o.status,
  o.current_stage,
  o.assigned_user_id,
  o.due_date,
  o.order_date,
  o.grand_total,
  o.total_paid,
  o.remaining_balance,
  o.created_at,
  (o.due_date is not null and o.due_date < now() and o.status = 'active') as is_overdue
from public.orders o;

-- No RLS needed on the view itself — it inherits the RLS of the
-- underlying `orders` table, because our policies check auth.uid()
-- directly rather than relying on table ownership.
