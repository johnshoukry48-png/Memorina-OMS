-- ============================================================
-- Memorina OMS — Direct assignment: notify the person, and make
-- the activity log say who it was assigned TO.
-- Safe to run more than once. Run after 013.
-- ============================================================

-- 1) Activity log: if the person who now holds the task is not the
--    person who made the change, it was assigned by someone else.
create or replace function public.fn_trg_log_claim()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.user_id = auth.uid() then
    perform public.fn_log_audit(new.order_id, 'task_claimed', null, new.role_at_assignment::text);
  else
    perform public.fn_log_audit(
      new.order_id, 'task_assigned', null,
      (select full_name from public.profiles where id = new.user_id)
    );
  end if;
  return null;
end;
$$;

-- 2) fn_advance_stage: same as before, plus an in-app notification to
--    the person the order was assigned to directly.
create or replace function public.fn_advance_stage(p_order_id uuid, p_to_stage text, p_assign_to_user_id uuid default null)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_role user_role;
  v_order public.orders;
  v_target_role user_role;
begin
  v_role := public.fn_my_role();

  if not (public.fn_is_admin() or v_role = 'order_manager') then
    if not exists (
      select 1 from public.orders
      where id = p_order_id
        and assigned_user_id = auth.uid()
        and current_stage = public.fn_my_stage()
    ) then
      raise exception 'لا يمكنك نقل هذا الطلب — إنه ليس بحوزتك حاليًا';
    end if;
    p_assign_to_user_id := null;
  end if;

  if p_assign_to_user_id is not null then
    select pr.role into v_target_role
    from public.profiles pr
    where pr.id = p_assign_to_user_id and pr.active = true;

    if v_target_role is null or not exists (
      select 1 from public.role_stage_map where stage = p_to_stage and role = v_target_role
    ) then
      raise exception 'الشخص المحدد لا يعمل في هذه المرحلة';
    end if;
  end if;

  update public.orders
  set current_stage = p_to_stage,
      assigned_user_id = case
                           when p_to_stage in ('DELIVERED','COLLECTED','CANCELLED') then assigned_user_id
                           else p_assign_to_user_id
                         end,
      status = case
                 when p_to_stage = 'DELIVERED' then 'completed'::order_overall_status
                 when p_to_stage = 'CANCELLED' then 'cancelled'::order_overall_status
                 else status
               end,
      completed_at = case when p_to_stage = 'DELIVERED' then now() else completed_at end
  where id = p_order_id
  returning * into v_order;

  update public.order_assignments
  set released_at = now()
  where order_id = p_order_id and user_id = auth.uid() and released_at is null;

  if p_assign_to_user_id is not null and p_to_stage not in ('DELIVERED','COLLECTED','CANCELLED') then
    insert into public.order_assignments (order_id, user_id, role_at_assignment, claimed_at)
    values (p_order_id, p_assign_to_user_id, v_target_role, now());

    perform public.fn_notify(
      p_assign_to_user_id, p_order_id, 'assigned',
      'تم تعيين الطلب #' || v_order.order_number || ' لك في مرحلة ' ||
      (select label_ar from public.workflow_stages where code = p_to_stage)
    );
  end if;

  return v_order;
end;
$$;

grant execute on function public.fn_advance_stage(uuid, text, uuid) to authenticated;
