-- ============================================================
-- Memorina OMS — Phase 1: Auth + Roles
-- Safe to run once on a fresh Supabase project (SQL Editor).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Roles
-- ------------------------------------------------------------
create type user_role as enum (
  'admin',
  'order_manager',
  'designer',
  'printing',
  'assembly',
  'packaging',
  'shipping'
);

-- ------------------------------------------------------------
-- 2. Profiles (extends auth.users — never store passwords here,
--    Supabase Auth already handles that)
-- ------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  role        user_role,        -- NULL until an admin assigns a role
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_profiles_role on public.profiles(role);

-- keep updated_at fresh
create or replace function public.fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.fn_set_updated_at();

-- ------------------------------------------------------------
-- 3. Auto-create a profile row whenever someone signs up.
--    New users start with role = NULL ("pending") and cannot
--    do anything until an admin assigns a role (see RLS below
--    and the "first admin" note at the end of this file).
-- ------------------------------------------------------------
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.fn_handle_new_user();

-- ------------------------------------------------------------
-- 4. Helper: is the current user an admin?
--    SECURITY DEFINER + fixed search_path avoids infinite RLS
--    recursion (this function bypasses RLS internally, but is
--    only ever used to answer a yes/no admin check).
-- ------------------------------------------------------------
create or replace function public.fn_is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

-- Everyone can read their own profile (needed to know their own role)
create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

-- Admins can read every profile (needed for user management + assigning tasks)
create policy "profiles_select_admin"
on public.profiles for select
using (public.fn_is_admin());

-- Users can update their own name/phone, but NEVER their own role or active flag.
-- Enforced by comparing OLD vs NEW in a trigger, because RLS alone can't
-- restrict which *columns* change on a normal UPDATE.
create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.fn_prevent_self_role_change()
returns trigger language plpgsql as $$
begin
  if not public.fn_is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'Only an admin can change role or active status';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_role_change
before update on public.profiles
for each row execute function public.fn_prevent_self_role_change();

-- Admins can update anyone (role assignment, deactivation, etc.)
create policy "profiles_update_admin"
on public.profiles for update
using (public.fn_is_admin())
with check (public.fn_is_admin());

-- No one can INSERT/DELETE profiles directly — rows are created only by
-- the fn_handle_new_user trigger (SECURITY DEFINER, bypasses RLS) and
-- deletion cascades from auth.users. No insert/delete policies = both denied.

-- ------------------------------------------------------------
-- 6. Workflow stage reference data (used from Phase 3 onward,
--    created now since it's static lookup data other phases
--    will foreign-key against).
-- ------------------------------------------------------------
create table public.workflow_stages (
  code        text primary key,
  label_ar    text not null,
  sort_order  int not null
);

insert into public.workflow_stages (code, label_ar, sort_order) values
  ('NEW',        'جديد',        1),
  ('DESIGN',     'التصميم',     2),
  ('PRINTING',   'الطباعة',     3),
  ('ASSEMBLY',   'التجميع',     4),
  ('PACKAGING',  'التغليف',     5),
  ('SHIPPING',   'الشحن',       6),
  ('DELIVERED',  'تم التسليم',  7),
  ('CANCELLED',  'ملغي',        8);

create table public.workflow_transitions (
  from_stage text not null references public.workflow_stages(code),
  to_stage   text not null references public.workflow_stages(code),
  primary key (from_stage, to_stage)
);

insert into public.workflow_transitions (from_stage, to_stage) values
  ('NEW','DESIGN'), ('DESIGN','PRINTING'), ('PRINTING','ASSEMBLY'),
  ('ASSEMBLY','PACKAGING'), ('PACKAGING','SHIPPING'), ('SHIPPING','DELIVERED'),
  ('NEW','CANCELLED'), ('DESIGN','CANCELLED'), ('PRINTING','CANCELLED'),
  ('ASSEMBLY','CANCELLED'), ('PACKAGING','CANCELLED'), ('SHIPPING','CANCELLED');

-- workflow_stages/transitions are reference data: readable by any
-- signed-in user, writable by no one via the API (managed here in SQL).
alter table public.workflow_stages enable row level security;
alter table public.workflow_transitions enable row level security;

create policy "workflow_stages_read_all"
on public.workflow_stages for select
using (auth.role() = 'authenticated');

create policy "workflow_transitions_read_all"
on public.workflow_transitions for select
using (auth.role() = 'authenticated');

-- ============================================================
-- FIRST ADMIN — do this once, manually, after your own signup:
--
--   1. Sign up normally through the app (creates an auth.users
--      row + a profiles row with role = NULL).
--   2. In the Supabase SQL Editor, run:
--
--        update public.profiles
--        set role = 'admin'
--        where id = (select id from auth.users where email = 'you@example.com');
--
--   This is the ONLY step done by hand. Every admin after the
--   first one is created normally, in-app, by an existing admin.
-- ============================================================
