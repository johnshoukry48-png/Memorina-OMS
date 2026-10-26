# Memorina OMS

Internal order management + workflow + team communication system for
Memorina. React + Vite + TypeScript frontend, Supabase (Postgres,
Auth, Storage, Realtime) backend, deployed on Vercel — 100% free tier.

**`docs/DEPLOYMENT.md`** covers taking it live. **`docs/SECURITY_AUDIT.md`**
documents the Phase 8 RLS review. This file covers setup and the full
feature list.

## Run every migration, in order
In the Supabase SQL Editor, run each file in `supabase/migrations/`
**in numeric order, 001 through 010**.

Migration 010 is a big one — see "What's new" below. It's safe to run
on your live project; it moves data, it doesn't delete any.

If you have existing orders you want to keep numbered as they are,
or want to restart numbering at 1 (see migration 009), do that after
010.

## First-time local setup
See earlier sections of this README in your project history, or:
1. Copy `.env.example` to `.env.local`, fill in your Supabase URL + anon key.
2. `npm install && npm run dev`.
3. Add yourself in Supabase Auth, then promote yourself to `admin` via SQL (see `supabase/migrations/001_auth_roles.sql` for the exact command).

## What's new (migration 010 + this update)
- **New order form**: can create a brand-new customer inline (name,
  phone, address) instead of requiring you to add them separately first.
- **Due date**: defaults to 10 days from the order date automatically if
  left blank — always editable, before or after creation.
- **Payments**: the amount field pre-fills with the current remaining
  balance (handy when someone pays the rest before delivery); admin can
  edit or delete a payment to fix a mistake.
- **Edit an order**: "تعديل الطلب" on the order page (admin/order manager)
  — change due date, priority, shipping address, notes, discount,
  shipping cost, and add/edit/remove items after creation.
- **File links**: attach a URL (Drive, WeTransfer, etc.) instead of only
  uploading a file.
- **Per-order expenses removed** from the order page — expenses now live
  entirely on the new standalone **المصروفات** page (admin only).
- **Expenses page**: month-by-month view (previous/next month
  navigation), category + amount + payment method per expense, CSV
  export for backup. Data is never deleted automatically — "closing"
  a month just means you've moved on to viewing the next one; last
  month's numbers and your exported CSV stay as your record.
- **New workflow stage**: "تم التحصيل" (Collected) after "تم التسليم"
  (Delivered) — a final admin/order-manager confirmation step once
  money is collected (useful for COD).
- **Reports**: "الإيرادات" (Revenue, broken down by payment method) is
  now admin-only; "الأرباح" (Profit = revenue − expenses) is clearly
  labeled; the date range defaults to the current month.
- **Financial visibility, properly enforced**: order money (totals,
  paid, remaining) moved to its own `order_financials` table with its
  own strict RLS — visible to **admin, order manager, and shipping**
  only. This isn't just a hidden UI panel: a designer, printing, or
  packaging account querying the database directly gets nothing back
  for these fields, because the data isn't even on the table they can
  read. See `docs/SECURITY_AUDIT.md` for the technical reasoning.
  *(If you actually want Order Manager excluded from this too, say so
  — one more RLS change.)*
- **Per-item checklist**: each order's items now have a checkbox for
  "done at the current stage" — the designer ticks off item by item,
  then printing does the same at their stage, and so on.
- **Direct assignment**: when moving an order to the next stage,
  admin/order manager can either leave it in the department's open
  queue (as before) or assign it straight to a specific person.
- **Time tracking**: each order now shows how long it sat with each
  person at each stage (claim → release).
- **Notification sound**: a short, clear chime plays when a new
  notification arrives (synthesized in the browser, no audio file).

## Roles
`admin`, `order_manager`, `designer`, `printing`, `assembly`,
`packaging`, `shipping`.
