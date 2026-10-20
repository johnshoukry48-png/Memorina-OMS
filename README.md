# Memorina OMS

Internal order management + workflow + team communication system for
Memorina. React + Vite + TypeScript frontend, Supabase (Postgres,
Auth, Storage, Realtime) backend, deployed on Vercel — 100% free tier.

All 10 build phases are complete. This README covers first-time setup;
**`docs/DEPLOYMENT.md` covers taking it live**, and
**`docs/SECURITY_AUDIT.md`** documents the Phase 8 RLS review.

## What's in each phase
1. Auth + roles (`profiles`, RLS, first-admin flow)
2. Customers, Orders, Order Items — server-computed totals
3. Workflow engine + task claiming
4. Files, comments, timeline
5. Payments + Expenses (with your Admin-only financial split)
6. In-app notifications, live via Realtime
7. Admin dashboard + date-filtered reports
8. Security / RLS audit — see `docs/SECURITY_AUDIT.md`
9. Responsive/mobile pass — bottom tab nav on phones
10. Deployment — see `docs/DEPLOYMENT.md`, plus this phase added the
    password-reset screens the spec called for but hadn't been built
    yet (`نسيت كلمة المرور؟` on the login page)

## First-time local setup

### 1. Create the Supabase project and run every migration, in order
In the Supabase SQL Editor, run each file in `supabase/migrations/`
**in numeric order, 001 through 008** — each one depends on the last.

If you have existing orders numbered up to e.g. `#1058`, continue the
sequence (do this once, before your first real order in the new system):
```sql
alter sequence public.order_number_seq restart with 1059;
```

### 2. Environment variables
Copy `.env.example` to `.env.local` and fill in your Supabase Project
URL and **anon/public** key (Project Settings → API). Never use the
`service_role` key here.

### 3. Install & run
```bash
npm install
npm run dev
```

### 4. Become the first admin
1. Add yourself as a user: Supabase Dashboard → **Authentication →
   Users → Add user**.
2. Log into the app with that email/password — you'll see "waiting
   for admin" (your role starts as `NULL`, by design).
3. Back in the SQL Editor:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
4. Refresh — you're in as admin. Add the rest of your ~10–12 person
   team the same way, setting each person's `role` via SQL for now
   (a proper "manage users" screen is a natural next feature beyond
   these 10 phases, if you'd like it built).

## Roles
`admin`, `order_manager`, `designer`, `printing`, `assembly`,
`packaging`, `shipping` — see the architecture doc from Phase 0 for
the full permission matrix; every rule in it is enforced by RLS in
`supabase/migrations/`, not just the UI.

## Project structure
```
memorina-oms/
├── src/
│   ├── components/     shared UI (StatusBadge, OrderFiles, OrderTimeline...)
│   ├── pages/           routes (Login, Dashboard, Orders, OrderDetail...)
│   ├── layouts/          AppLayout (desktop sidebar / mobile bottom nav)
│   ├── hooks/             useAuth
│   ├── lib/                supabaseClient.ts
│   ├── services/            one file per domain (ordersService, paymentsService...)
│   └── types/                 database.ts
├── supabase/migrations/  001 → 008, run once each, in order
├── docs/
│   ├── SECURITY_AUDIT.md
│   └── DEPLOYMENT.md
├── vercel.json
└── .env.example
```

## Where to go from here
The 10 phases cover everything in the original spec. Natural next
steps if you want to keep building: an in-app "manage users" screen
(no more manual SQL for adding teammates), demo/seed data for
testing, and the optional integrations the spec deliberately left out
of the MVP (WhatsApp, paid notification services) — all still
possible to add later without redesigning anything already built.
