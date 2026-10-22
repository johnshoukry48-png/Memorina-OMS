-- ============================================================
-- Memorina OMS — reset order numbering to start at #1
-- Run once in the Supabase SQL Editor.
-- ============================================================

alter sequence public.order_number_seq restart with 1;

-- ============================================================
-- NOTE: this only affects the NEXT order created — it does not
-- change the order_number of any order that already exists (e.g.
-- test orders like #1000, #1001 from earlier). Those keep their
-- current numbers; the next new order will be #1, then #2, etc.
--
-- If you want to clear out test orders first so #1 is genuinely
-- your first real order, run this (ONLY if you're sure — this
-- permanently deletes every order, its items, payments, files,
-- comments and activity log — customers are NOT deleted):
--
--   delete from public.orders;
--
-- order_items / payments / files / comments / audit_logs for those
-- orders are removed automatically (they're all set up with
-- "on delete cascade" back to the order).
-- ============================================================
