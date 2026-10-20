# Memorina OMS — Phase 8 Security / RLS Audit

Every table's policies checked against the role/permission matrix from
the architecture doc. Five real issues found — all fixed in
`supabase/migrations/008_security_audit_fixes.sql`. Everything else
below passed as originally built.

## Fixed this phase

| # | Issue | Risk | Fix |
|---|---|---|---|
| 1 | Deactivating a user (`profiles.active = false`) didn't actually revoke their role-based access — only the admin check looked at `active`. | Medium — a "removed" employee kept working access as long as their login still worked. | `fn_my_role()` now returns `NULL` for inactive users, which cascades through every policy that depends on it. |
| 2 | `profiles` RLS only allowed reading your own row or admin reading all — so teammates' names showed blank anywhere they were displayed (Reports, timeline "moved by X"). | Low — a display bug, not a data leak, but confusing. | Any signed-in, active user can now read profile rows (small internal team; still no unrelated financial/customer data exposed by this). |
| 3 | `customers` was readable only by admin/order_manager — Shipping (and anyone else) couldn't see a customer's name/phone at all, despite needing it for deliveries. | Medium — a real functionality gap against the spec (Shipping must see customer info). | Customers are now visible to anyone who can already view one of their orders. |
| 4 | **The important one.** `orders.grand_total` / `subtotal` / `total_paid` / `remaining_balance` could be overwritten with an arbitrary value by any admin/order_manager API call that didn't also touch `discount`/`shipping_cost`/`total_paid` in the same request — the old trigger only recalculated conditionally. | **High** — a compromised or careless Order Manager session could falsify an order's total directly. | These four columns are now recomputed from their source data (`order_items`, `payments`) on **every** insert/update, unconditionally. No code path lets a client-supplied number survive. |
| 5 | Two payments submitted for the same order at nearly the same instant could both pass the overpayment check before either committed. | Low (small team, rare in practice) | The order row is now locked (`FOR UPDATE`) for the duration of the check. |

## Confirmed correct (no changes)

- **Task claiming** (`fn_claim_task`) is a single atomic `UPDATE ...
  WHERE assigned_user_id IS NULL`, so two employees can never both
  claim the same order.
- **Stage transitions**: every `current_stage` change — regardless of
  who makes it or how — passes through `fn_validate_stage_transition`,
  checked against `workflow_transitions`. Only `admin` can bypass it.
- **Production employees have no direct write grant on `orders`** —
  every write goes through `fn_claim_task` / `fn_advance_stage`, which
  re-check authorization themselves before touching anything.
- **Expenses are admin-only end to end** (`using (public.fn_is_admin())`
  on every operation) — an Order Manager's direct API call is rejected
  by Postgres itself, not just hidden in the UI.
- **Payments**: admin + order_manager can record/view; only admin can
  edit or delete a recorded payment.
- **Files & Storage**: the `files` metadata table and the actual
  `storage.objects` bytes are both gated by the same
  "can you see this order?" rule, so knowing a file's path isn't
  enough to bypass permissions — duplicated but consistent.
- **Comments and audit_logs are immutable** — no update policy exists
  for either, and only `admin` can delete a comment. No one can delete
  an audit log entry, which is what makes the timeline trustworthy.
- **Notifications**: a user can only ever read/mark-read their own
  rows; every row is written by a `SECURITY DEFINER` function, never
  directly by a client claiming "notify user X".
- **No service role key anywhere in the frontend** — only
  `VITE_SUPABASE_ANON_KEY` is used, confirmed in `src/lib/supabaseClient.ts`.

## Known, accepted trade-offs (not bugs)

- `profiles_select_teammates` (fix #2) opens the whole `profiles` row
  to any signed-in user, not just `full_name`/`role` — Postgres RLS is
  row-level, not column-level. For a ~12-person internal team this is
  a reasonable trade-off. If you'd rather lock this down further later,
  the fix is a dedicated `public.team_directory` view exposing only
  `id, full_name, role` with `security_invoker = true`, and pointing the
  app's `profiles:profiles(full_name)` joins at that view instead.
- Shipping (and other non-Order-Manager employees) still cannot see
  `remaining_balance`/payment history — only Order Manager and Admin
  can, per your explicit decision back in the architecture phase. If
  Shipping ever needs to confirm a cash-on-delivery amount, that would
  be a deliberate, separate decision to revisit — not something this
  audit changed on its own.

## How to apply
Run `supabase/migrations/008_security_audit_fixes.sql` in the SQL
Editor after 001–007. It only redefines functions and adds two new
policies — no data migration needed, safe to run on a live project.
