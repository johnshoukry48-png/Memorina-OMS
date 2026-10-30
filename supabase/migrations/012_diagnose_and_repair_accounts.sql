-- ============================================================
-- Memorina OMS — Diagnose + repair account/role issues.
--
-- IMPORTANT: run the DIAGNOSIS query first (Part A) and read its
-- result BEFORE running Part B. Part B is safe and only fixes a
-- specific, narrow problem (a login with no matching profile row),
-- it never changes an existing role — but look at Part A's output
-- first so you understand what's actually wrong.
-- ============================================================

-- ------------------------------------------------------------
-- PART A — DIAGNOSIS (read-only, changes nothing).
-- Run this and read the result table.
--
-- What to look for in the result:
--   - Every real login should have exactly one row here.
--   - "profile_exists" must be true for every row. If it's false,
--     that login has NO profile at all — which is exactly what
--     makes fn_is_admin()/fn_my_role() silently return nothing,
--     and every RLS-protected action gets rejected with 403.
--   - "role" must say admin or order_manager for whoever you're
--     testing order creation with. If it's null, that account was
--     never promoted. If it says something unexpected (e.g. you
--     expected "admin" but it shows "designer"), that's the bug.
--   - "active" must be true.
-- ------------------------------------------------------------
select
  u.email,
  u.id as auth_user_id,
  p.id is not null as profile_exists,
  p.full_name,
  p.role,
  p.active
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;

-- ------------------------------------------------------------
-- PART B — REPAIR (safe to run; only touches logins with a
-- genuinely missing profile row — it will NEVER overwrite a role
-- or active flag that already exists).
--
-- This covers the specific case where an auth login exists but
-- fn_handle_new_user's trigger (from migration 001) never fired for
-- it — e.g. if the user was created a way that skipped it — leaving
-- that login with no row in `profiles` at all, and therefore no
-- role, ever, no matter what UPDATE you run against it.
-- ------------------------------------------------------------
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ------------------------------------------------------------
-- PART C — Re-run Part A's query after Part B to confirm every
-- login now has "profile_exists = true". Any login still showing
-- role = null simply hasn't been promoted yet — do that with:
--
--   update public.profiles set role = 'admin' where id = 'auth_user_id-from-the-table-above';
--
-- (use the exact auth_user_id value from the table, not the email,
-- to avoid any ambiguity)
-- ------------------------------------------------------------
