-- ============================================================
-- Memorina OMS — Phase 2: Customers + Orders + Order Items
-- Run this in the Supabase SQL Editor AFTER 001_auth_roles.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Customers
-- ------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null,
  secondary_phone text,
  address         text,
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_customers_phone on public.customers(phone);
create index idx_customers_name on public.customers(name);

create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.fn_set_updated_at();

-- ------------------------------------------------------------
-- 2. Orders
--    order_number is NEVER supplied by the client — it's assigned
--    by a trigger from a sequence, continuing your existing
--    numbering (see the ALTER SEQUENCE note at the bottom).
-- ------------------------------------------------------------
create type order_priority as enum ('low', 'normal', 'high', 'urgent');
create type order_overall_status as enum ('active', 'completed', 'cancelled');

create sequence public.order_number_seq start 1000;

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      integer unique,
  customer_id       uuid not null references public.customers(id),
  status            order_overall_status not null default 'active',
  current_stage     text not null default 'NEW' references public.workflow_stages(code),
  assigned_user_id  uuid references public.profiles(id),
  priority          order_priority not null default 'normal',
  order_date        timestamptz not null default now(),
  due_date          timestamptz,
  shipping_address  text,
  shipping_company  text,
  tracking_number   text,

  -- money: always server-computed, never trusted from the client
  discount          numeric(12,2) not null default 0 check (discount >= 0),
  shipping_cost     numeric(12,2) not null default 0 check (shipping_cost >= 0),
  subtotal          numeric(12,2) not null default 0,   -- sum of order_items.total_price
  grand_total       numeric(12,2) not null default 0,   -- subtotal - discount + shipping_cost
  total_paid        numeric(12,2) not null default 0,   -- maintained from payments in Phase 5
  remaining_balance numeric(12,2) not null default 0,   -- grand_total - total_paid

  notes             text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index idx_orders_order_number on public.orders(order_number);
create index idx_orders_customer_id on public.orders(customer_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_current_stage on public.orders(current_stage);
create index idx_orders_assigned_user_id on public.orders(assigned_user_id);
create index idx_orders_due_date on public.orders(due_date);
create index idx_orders_created_at on public.orders(created_at);

create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.fn_set_updated_at();

-- assign order_number automatically
create or replace function public.fn_assign_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := nextval('public.order_number_seq');
  end if;
  return new;
end;
$$;

create trigger trg_orders_assign_number
before insert on public.orders
for each row execute function public.fn_assign_order_number();

-- ------------------------------------------------------------
-- 3. Order items
-- ------------------------------------------------------------
create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  name              text not null,
  description       text,
  quantity          integer not null check (quantity > 0),
  size              text,
  unit_price        numeric(12,2) not null check (unit_price >= 0),
  total_price       numeric(12,2) generated always as (quantity * unit_price) stored,
  production_notes  text,
  design_notes      text,
  created_at        timestamptz not null default now()
);

create index idx_order_items_order_id on public.order_items(order_id);

-- ------------------------------------------------------------
-- 4. Recompute order money fields whenever items or discount /
--    shipping_cost / total_paid change. This is the ONLY place
--    subtotal / grand_total / remaining_balance are written —
--    the client never sends these values directly.
-- ------------------------------------------------------------
create or replace function public.fn_recompute_order_totals(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_subtotal numeric(12,2);
begin
  select coalesce(sum(total_price), 0) into v_subtotal
  from public.order_items where order_id = p_order_id;

  update public.orders
  set subtotal = v_subtotal,
      grand_total = v_subtotal - discount + shipping_cost,
      remaining_balance = (v_subtotal - discount + shipping_cost) - total_paid
  where id = p_order_id;
end;
$$;

create or replace function public.fn_order_items_changed()
returns trigger language plpgsql as $$
begin
  perform public.fn_recompute_order_totals(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

create trigger trg_order_items_recalc
after insert or update or delete on public.order_items
for each row execute function public.fn_order_items_changed();

-- if discount / shipping_cost / total_paid change directly on the order
create or replace function public.fn_order_money_fields_changed()
returns trigger language plpgsql as $$
begin
  if new.discount is distinct from old.discount
     or new.shipping_cost is distinct from old.shipping_cost
     or new.total_paid is distinct from old.total_paid then
    new.grand_total := new.subtotal - new.discount + new.shipping_cost;
    new.remaining_balance := new.grand_total - new.total_paid;
  end if;
  return new;
end;
$$;

create trigger trg_orders_money_recalc
before update on public.orders
for each row execute function public.fn_order_money_fields_changed();

-- ------------------------------------------------------------
-- 5. Which workflow stage does each role work at?
--    Used by RLS so employees only see orders at their own stage
--    (or ones already assigned to them). Task claiming and stage
--    transitions arrive in Phase 3 — for now this only governs
--    what's visible, not what can be changed.
-- ------------------------------------------------------------
create table public.role_stage_map (
  role  user_role primary key,
  stage text not null references public.workflow_stages(code)
);

insert into public.role_stage_map (role, stage) values
  ('designer', 'DESIGN'),
  ('printing', 'PRINTING'),
  ('assembly', 'ASSEMBLY'),
  ('packaging', 'PACKAGING'),
  ('shipping', 'SHIPPING');

create or replace function public.fn_my_role()
returns user_role
language sql security definer set search_path = public stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.fn_my_stage()
returns text
language sql security definer set search_path = public stable
as $$
  select stage from public.role_stage_map where role = public.fn_my_role();
$$;

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.role_stage_map enable row level security;

create policy "role_stage_map_read_all"
on public.role_stage_map for select
using (auth.role() = 'authenticated');

-- Customers: admin + order_manager only, for now (spec: they "manage customers")
create policy "customers_all_admin_om"
on public.customers for all
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager')
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

-- Orders: admin + order_manager see/manage everything.
create policy "orders_all_admin_om"
on public.orders for all
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager')
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

-- Orders: production employees can VIEW orders at their own stage,
-- or orders already assigned to them. They cannot yet write (Phase 3
-- adds the task-claim / stage-advance functions with their own policies).
create policy "orders_select_employee_stage"
on public.orders for select
using (
  current_stage = public.fn_my_stage()
  or assigned_user_id = auth.uid()
);

-- Order items: visible to anyone who can see the parent order.
create policy "order_items_select_via_order"
on public.order_items for select
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (
        public.fn_is_admin()
        or public.fn_my_role() = 'order_manager'
        or o.current_stage = public.fn_my_stage()
        or o.assigned_user_id = auth.uid()
      )
  )
);

-- Order items: only admin + order_manager write them (in this phase).
create policy "order_items_write_admin_om"
on public.order_items for insert
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

create policy "order_items_update_admin_om"
on public.order_items for update
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager')
with check (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

create policy "order_items_delete_admin_om"
on public.order_items for delete
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

-- ============================================================
-- IMPORTANT — continuing your existing order numbers:
-- If your last real order was #1058, run this once so the next
-- created order becomes #1059 (adjust the number to match yours):
--
--   alter sequence public.order_number_seq restart with 1059;
--
-- Do this BEFORE creating your first real order in the new system.
-- ============================================================
