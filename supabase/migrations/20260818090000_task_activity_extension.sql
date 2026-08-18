-- Phase 8C — contextual "+ Add another Activity to this Service" during global Task creation.
--
-- 1. workstream_activities_write hardening (Section 34 audit finding): this policy has grouped
--    `is_supervisor() OR is_superadmin()` unconditionally since it was first written
--    (20260814090001), then again when Employee creation was added (20260814120001) — meaning any
--    Supervisor could reconfigure ANY Workstream's Activities organization-wide, never scoped to
--    their own team's Services. Corebridge X is Employee-first: Supervisor is Employee +
--    direct-report/team privileges, never organization-wide. Hardened to require the Workstream's
--    own lead be self-or-a-legitimate-direct-report AND the Project be in Supervisor's own scope —
--    mirroring the exact rule this migration's own create_task extension below enforces, and the
--    exact rule the Phase 8B hardening pass already applied to create_workstream/create_task's own
--    internal checks. Employee's existing "lead self only" branch and Superadmin's org-wide access
--    are unchanged.
--
-- 2. create_task extended: when a Task's p_activity_id is not yet enabled for its Workstream, and
--    the caller is authorized to extend that Service's Activity configuration (same scope as the
--    hardened workstream_activities_write above — re-derived here since create_task is SECURITY
--    DEFINER and does not consult table RLS for its own writes), the Activity is enabled and the
--    Task is created in the SAME function call. Since a Postgres function's writes all run inside
--    the caller's single statement/transaction, an exception anywhere in the rest of the function
--    (or a client-side cancel that never calls this RPC at all) leaves zero trace — there is no
--    "enable Activity, then separately try to create the Task" two-call sequence to partially fail.
--    `enforce_workstream_activity_service_match` (unchanged, already live) still fires on the new
--    workstream_activities row exactly as it would for any other caller, rejecting an Activity that
--    doesn't belong to this Workstream's own service line — no duplicate validation added here.
--    Never auto-attaches an Activity for an unauthorized caller, and never touches any Workstream's
--    Activities merely because a Task happens to reference one that's already enabled.

drop policy "workstream_activities_write" on public.workstream_activities;
create policy "workstream_activities_write" on public.workstream_activities
  for all
  using (
    public.is_superadmin()
    or (public.is_employee() and exists (
      select 1 from public.workstreams w where w.id = workstream_id and w.lead_user_id = auth.uid()
    ))
    or (public.is_supervisor() and exists (
      select 1 from public.workstreams w
      where w.id = workstream_id
        and public.manages_user(w.lead_user_id)
        and public.can_access_project(w.project_id)
    ))
  )
  with check (
    public.is_superadmin()
    or (public.is_employee() and exists (
      select 1 from public.workstreams w where w.id = workstream_id and w.lead_user_id = auth.uid()
    ))
    or (public.is_supervisor() and exists (
      select 1 from public.workstreams w
      where w.id = workstream_id
        and public.manages_user(w.lead_user_id)
        and public.can_access_project(w.project_id)
    ))
  );

create or replace function public.create_task(
  p_title text,
  p_description text,
  p_workstream_id uuid,
  p_activity_id uuid,
  p_assignee_ids uuid[],
  p_allow_unassigned boolean,
  p_status text,
  p_priority text,
  p_due_date date,
  p_expected_minutes int,
  p_template_id uuid,
  p_checklist_items text[]
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws public.workstreams;
  new_task public.tasks;
  effective_assignee_ids uuid[];
  self_added boolean;
  i int;
  activity_already_enabled boolean;
  may_extend_activities boolean;
begin
  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;
  if not public.can_access_workstream(p_workstream_id) then
    raise exception 'You don''t have access to that workstream.';
  end if;

  -- Contextual Activity extension: only when a specific Activity was requested and it isn't
  -- already part of this Workstream's configured set. A Workstream with zero configured Activities
  -- at all (legacy/no-catalog service) is untouched by this branch — enforce_task_invariants
  -- already lets any catalog Activity through for that case, exactly as before.
  if p_activity_id is not null then
    select exists (
      select 1 from public.workstream_activities where workstream_id = p_workstream_id and activity_id = p_activity_id
    ) into activity_already_enabled;

    if not activity_already_enabled then
      may_extend_activities :=
        public.is_superadmin()
        or (public.is_employee() and ws.lead_user_id = auth.uid())
        or (public.is_supervisor() and public.manages_user(ws.lead_user_id) and public.can_access_project(ws.project_id));

      if not may_extend_activities then
        raise exception 'That activity is not yet enabled for this service, and you don''t have permission to add it.';
      end if;

      insert into public.workstream_activities (workstream_id, activity_id) values (p_workstream_id, p_activity_id);
      -- enforce_workstream_activity_service_match fires here, rejecting an Activity that doesn't
      -- belong to this Workstream's own service line — same as any other caller's insert.
    end if;
  end if;

  self_added := public.is_employee();

  if public.is_employee() then
    effective_assignee_ids := array[auth.uid()];
  elsif p_allow_unassigned and coalesce(array_length(p_assignee_ids, 1), 0) = 0 then
    effective_assignee_ids := '{}';
  elsif public.is_superadmin() then
    select coalesce(array_agg(u), '{}') into effective_assignee_ids
    from unnest(p_assignee_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
    if coalesce(array_length(effective_assignee_ids, 1), 0) = 0 then
      effective_assignee_ids := array[auth.uid()];
    end if;
  else
    select coalesce(array_agg(u), '{}') into effective_assignee_ids
    from unnest(p_assignee_ids) as u
    where exists (
      select 1 from public.profiles p
      where p.id = u and p.active and (p.id = auth.uid() or p.supervisor_id = auth.uid())
    );
    if coalesce(array_length(effective_assignee_ids, 1), 0) = 0 then
      effective_assignee_ids := array[auth.uid()];
    end if;
  end if;

  insert into public.tasks (
    title, description, company_id, workstream_id, status, priority, due_date, expected_minutes,
    created_by, self_added, template_id, activity_id
  ) values (
    p_title, p_description, ws.company_id, p_workstream_id, p_status, p_priority, p_due_date, p_expected_minutes,
    auth.uid(), self_added, p_template_id, p_activity_id
  )
  returning * into new_task;

  if coalesce(array_length(effective_assignee_ids, 1), 0) > 0 then
    insert into public.task_assignees (task_id, user_id)
    select new_task.id, u from unnest(effective_assignee_ids) as u;
  end if;

  if p_checklist_items is not null and array_length(p_checklist_items, 1) > 0 then
    for i in 1..array_length(p_checklist_items, 1) loop
      insert into public.checklist_items (task_id, description, position) values (new_task.id, p_checklist_items[i], i - 1);
    end loop;
  end if;

  perform public.notify_task_created(new_task.id, effective_assignee_ids, self_added);

  return new_task;
end;
$$;

revoke execute on function public.create_task(
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[]
) from public, anon;
grant execute on function public.create_task(
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[]
) to authenticated, service_role;
