-- ============================================================
-- Memorina OMS — Phase 4: Files + Comments + Timeline
-- Run AFTER 001, 002, 003.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Files (metadata table — the actual bytes live in Supabase
--    Storage, bucket "order-files", at path
--    {order_id}/{category}/{timestamp}_{filename})
-- ------------------------------------------------------------
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  category      text not null check (category in ('CUSTOMER_REFERENCE','DESIGN','PRINTING','SHIPPING','OTHER')),
  storage_path  text not null,
  file_name     text not null,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

create index idx_files_order_id on public.files(order_id);

-- ------------------------------------------------------------
-- 2. Comments (internal discussion thread per order)
-- ------------------------------------------------------------
create table public.comments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  user_id             uuid not null references public.profiles(id),
  message             text not null,
  attachment_file_id  uuid references public.files(id),
  created_at          timestamptz not null default now()
);

create index idx_comments_order_id on public.comments(order_id);

-- ------------------------------------------------------------
-- 3. Audit / activity log — the backbone of the order timeline.
--    Written only by triggers below (SECURITY DEFINER), never
--    directly by the client.
-- ------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete cascade,
  user_id     uuid references public.profiles(id),
  action      text not null,
  from_value  text,
  to_value    text,
  created_at  timestamptz not null default now()
);

create index idx_audit_logs_order_id on public.audit_logs(order_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at);

create or replace function public.fn_log_audit(p_order_id uuid, p_action text, p_from text, p_to text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.audit_logs (order_id, user_id, action, from_value, to_value)
  values (p_order_id, auth.uid(), p_action, p_from, p_to);
end;
$$;

-- order created
create or replace function public.fn_trg_log_order_created()
returns trigger language plpgsql as $$
begin
  perform public.fn_log_audit(new.id, 'order_created', null, new.order_number::text);
  return null;
end;
$$;

create trigger trg_orders_log_created
after insert on public.orders
for each row execute function public.fn_trg_log_order_created();

-- stage changed (any cause: claim/advance/admin edit)
create or replace function public.fn_trg_log_stage_change()
returns trigger language plpgsql as $$
begin
  if new.current_stage is distinct from old.current_stage then
    perform public.fn_log_audit(new.id, 'stage_changed', old.current_stage, new.current_stage);
  end if;
  return null;
end;
$$;

create trigger trg_orders_log_stage
after update on public.orders
for each row execute function public.fn_trg_log_stage_change();

-- task claimed
create or replace function public.fn_trg_log_claim()
returns trigger language plpgsql as $$
begin
  perform public.fn_log_audit(new.order_id, 'task_claimed', null, new.role_at_assignment::text);
  return null;
end;
$$;

create trigger trg_order_assignments_log_claim
after insert on public.order_assignments
for each row execute function public.fn_trg_log_claim();

-- file uploaded
create or replace function public.fn_trg_log_file()
returns trigger language plpgsql as $$
begin
  perform public.fn_log_audit(new.order_id, 'file_uploaded', null, new.category);
  return null;
end;
$$;

create trigger trg_files_log_upload
after insert on public.files
for each row execute function public.fn_trg_log_file();

-- ------------------------------------------------------------
-- 4. RLS — files, comments, audit_logs all follow the same
--    "can you see this order?" rule already used for order_items.
-- ------------------------------------------------------------
alter table public.files enable row level security;
alter table public.comments enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.fn_can_view_order(p_order_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        public.fn_is_admin()
        or public.fn_my_role() = 'order_manager'
        or o.current_stage = public.fn_my_stage()
        or o.assigned_user_id = auth.uid()
      )
  );
$$;

-- Files
create policy "files_select_via_order"
on public.files for select
using (public.fn_can_view_order(order_id));

create policy "files_insert_by_role"
on public.files for insert
with check (
  public.fn_can_view_order(order_id)
  and (
    public.fn_is_admin()
    or public.fn_my_role() = 'order_manager'
    or (category = 'DESIGN' and public.fn_my_role() = 'designer')
    or (category = 'PRINTING' and public.fn_my_role() = 'printing')
    or (category = 'SHIPPING' and public.fn_my_role() = 'shipping')
  )
);

create policy "files_delete_admin_om"
on public.files for delete
using (public.fn_is_admin() or public.fn_my_role() = 'order_manager');

-- Comments
create policy "comments_select_via_order"
on public.comments for select
using (public.fn_can_view_order(order_id));

create policy "comments_insert_via_order"
on public.comments for insert
with check (public.fn_can_view_order(order_id) and user_id = auth.uid());

create policy "comments_delete_admin"
on public.comments for delete
using (public.fn_is_admin());

-- Audit logs
create policy "audit_logs_select_via_order"
on public.audit_logs for select
using (order_id is not null and public.fn_can_view_order(order_id));

-- No insert/update/delete policies for anyone — only the
-- SECURITY DEFINER fn_log_audit() (called from triggers) writes here.

-- ------------------------------------------------------------
-- 5. Storage bucket + policies.
--    Files are private — never publicly readable. Access is
--    generated via short-lived signed URLs from the client, and
--    the client can only request one if these policies allow it.
--    Path convention: {order_id}/{category}/{timestamp}_{filename}
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;

create policy "order_files_storage_select"
on storage.objects for select
using (
  bucket_id = 'order-files'
  and public.fn_can_view_order(((storage.foldername(name))[1])::uuid)
);

create policy "order_files_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'order-files'
  and public.fn_can_view_order(((storage.foldername(name))[1])::uuid)
  and (
    public.fn_is_admin()
    or public.fn_my_role() = 'order_manager'
    or (public.fn_my_role() = 'designer' and (storage.foldername(name))[2] = 'DESIGN')
    or (public.fn_my_role() = 'printing' and (storage.foldername(name))[2] = 'PRINTING')
    or (public.fn_my_role() = 'shipping' and (storage.foldername(name))[2] = 'SHIPPING')
  )
);

create policy "order_files_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'order-files'
  and (public.fn_is_admin() or public.fn_my_role() = 'order_manager')
);
