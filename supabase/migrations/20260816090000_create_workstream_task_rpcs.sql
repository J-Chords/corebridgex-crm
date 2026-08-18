-- Phase 8B acceptance hotfix — Service + Task creation RLS.
--
-- ROOT CAUSE (proven via read-only role-simulated testing against the hosted project, documented
-- in full in the phase report; summarized here for anyone reading this migration later):
--
-- `workstreams_insert`/`tasks_insert`'s own WITH CHECK predicates were never wrong. The failure was
-- specifically in the client's `.insert({...}).select("*").single()` pattern (PostgREST's
-- equivalent of `INSERT ... RETURNING *`): Postgres evaluates the table's SELECT policy against
-- the brand-new row as part of RETURNING, and if that fails, Postgres raises the exact same
-- generic "new row violates row-level security policy" error as a WITH CHECK failure — there is no
-- way to distinguish the two from the client-visible error text alone.
--
-- Two distinct (but same-symptom) gaps, both proven by direct role-simulated INSERT...RETURNING
-- reproduction, rolled back, no data left behind:
--   1. `can_access_workstream`'s only passing branch for a non-superadmin self-led Workstream
--      (`exists (select 1 from workstreams w where w.id = target and manages_user(w.lead_user_id))`)
--      queries the SAME table the RETURNING clause is being evaluated for. Postgres's own command-
--      visibility rule (a statement cannot see rows it itself just inserted, via any OTHER scan
--      within that same command) means this nested lookup can never see its own just-inserted row.
--      This affects Employee AND Supervisor identically when self-leading a new Service — proven by
--      simulating both roles; only Superadmin's `is_superadmin()` short-circuit avoids the
--      self-referential branch entirely, which is why Superadmin creation already worked.
--   2. `can_access_task`'s Employee branch requires an existing `task_assignees` row (which cannot
--      exist yet — assignees are only ever inserted in a separate, later step by the current
--      provider) — the literal bootstrap gap this hotfix's brief predicted. Supervisor's own
--      fallback branch ("no assignees yet AND can_access_company") *also* fails for the identical
--      command-visibility reason as (1): it self-referentially queries `tasks` for the row IT is
--      currently returning. Only Superadmin's `is_superadmin()` short-circuit avoids this too.
--
-- FIX: the smallest safe change that stays atomic and never leaves a partially-created record —
-- two new SECURITY DEFINER RPCs performing the whole create (row + immediate join-table writes +,
-- for tasks, notification) in one call, returning the finished row directly as a function result
-- (never through a client-visible RETURNING-through-RLS step, which is exactly what a
-- SECURITY DEFINER function's own internal writes bypass). This mirrors the exact convention
-- already established by `apply_template`/`update_task_status`/`toggle_checklist_item`/
-- `create_task_handoff` — all of which already do the identical "INSERT ... RETURNING ... INTO"
-- pattern successfully today, which is what proves this fix works (that pattern is unaffected by
-- the bug precisely because it runs as the function's owner, not the calling role, so RLS —
-- including the problematic RETURNING-time SELECT check — never applies to it at all).
--
-- Both RPCs re-implement the exact authorization their bypassed INSERT policy would otherwise have
-- enforced (SECURITY DEFINER means the table's own RLS is not consulted for this function's writes,
-- so the function body IS the authorization boundary now, not a redundant restatement of it) —
-- `workstreams_insert`/`tasks_insert` themselves are left completely unchanged as a defense-in-depth
-- backstop for any future direct-insert caller, not because they were ever wrong.
--
-- Existing BEFORE INSERT triggers (`enforce_workstream_project_link`, `enforce_workstream_service_
-- requirement`, `enforce_workstream_activity_service_match`, `enforce_task_invariants`,
-- `enforce_task_assignee_scope`) are table-level and keep firing exactly as before regardless of
-- which role/function performs the INSERT — none of them are duplicated here.

-- ---------------------------------------------------------------------------
-- create_workstream — replaces the client's direct `workstreams` insert + workstream_members +
-- workstream_activities sequence for BOTH the Project-aware Employee "+ Add Service" flow and the
-- legacy Supervisor/Superadmin Company-page flow (project_id omitted there, exactly as today).
-- ---------------------------------------------------------------------------
create function public.create_workstream(
  p_name text,
  p_description text,
  p_company_id uuid,
  p_project_id uuid,
  p_service_line_id uuid,
  p_lead_user_id uuid,
  p_team_user_ids uuid[],
  p_activity_ids uuid[],
  p_status text,
  p_start_date date,
  p_end_date date,
  p_recurrence_frequency text,
  p_recurrence_anchor_date date,
  p_recurrence_custom_interval_days int,
  p_previous_occurrence_workstream_id uuid
)
returns public.workstreams
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_brand_id uuid;
  new_ws public.workstreams;
  effective_team_ids uuid[];
begin
  if public.is_supervisor() or public.is_superadmin() then
    effective_team_ids := coalesce(p_team_user_ids, '{}');
  elsif public.is_employee() then
    if p_project_id is null then
      raise exception 'A project is required to create a service.';
    end if;
    if not public.can_access_project(p_project_id) then
      raise exception 'You don''t have access to that project.';
    end if;
    if p_lead_user_id is distinct from auth.uid() then
      raise exception 'You can only create a service you lead yourself.';
    end if;
    -- Mirrors the pre-existing rule exactly: an Employee-created Service never gets arbitrary
    -- team/staff assignment, regardless of what the client sends.
    effective_team_ids := '{}';
  else
    raise exception 'Not authorized to create a service.';
  end if;

  select brand_id into company_brand_id from public.companies where id = p_company_id;
  if not found then
    raise exception 'Company % not found.', p_company_id;
  end if;

  insert into public.workstreams (
    name, description, company_id, project_id, service_line_id, brand_id, lead_user_id, status,
    start_date, end_date, recurrence_frequency, recurrence_anchor_date, recurrence_custom_interval_days,
    previous_occurrence_workstream_id, created_by
  ) values (
    p_name, p_description, p_company_id, p_project_id, p_service_line_id, company_brand_id, p_lead_user_id, p_status,
    p_start_date, p_end_date, p_recurrence_frequency, p_recurrence_anchor_date, p_recurrence_custom_interval_days,
    p_previous_occurrence_workstream_id, auth.uid()
  )
  returning * into new_ws;
  -- enforce_workstream_project_link + enforce_workstream_service_requirement already fired above,
  -- exactly as they would for any other caller — new_ws reflects their post-trigger result.

  if coalesce(array_length(effective_team_ids, 1), 0) > 0 then
    insert into public.workstream_members (workstream_id, user_id)
    select new_ws.id, u from unnest(effective_team_ids) as u;
  end if;

  if coalesce(array_length(p_activity_ids, 1), 0) > 0 then
    insert into public.workstream_activities (workstream_id, activity_id)
    select new_ws.id, a from unnest(p_activity_ids) as a;
    -- enforce_workstream_activity_service_match fires per row, exactly as before.
  end if;

  return new_ws;
end;
$$;

revoke execute on function public.create_workstream(
  text, text, uuid, uuid, uuid, uuid, uuid[], uuid[], text, date, date, text, date, int, uuid
) from public, anon;
grant execute on function public.create_workstream(
  text, text, uuid, uuid, uuid, uuid, uuid[], uuid[], text, date, date, text, date, int, uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_task — replaces the client's direct `tasks` insert + task_assignees + checklist_items +
-- notify_task_created sequence. Assignee resolution mirrors resolveAssigneeIds/assignableStaffFor
-- exactly (self-only for Employee; own team for Supervisor; any active user for Superadmin;
-- silent fallback to self when nothing requested/valid, never a hard error) — task_assignees'
-- own enforce_task_assignee_scope trigger still fires per row as an unchanged defense-in-depth
-- backstop, it is not being relied on as the only check.
-- ---------------------------------------------------------------------------
create function public.create_task(
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
begin
  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;
  if not public.can_access_workstream(p_workstream_id) then
    raise exception 'You don''t have access to that workstream.';
  end if;

  self_added := public.is_employee();

  if p_allow_unassigned and coalesce(array_length(p_assignee_ids, 1), 0) = 0 then
    effective_assignee_ids := '{}';
  elsif public.is_employee() then
    effective_assignee_ids := array[auth.uid()];
  elsif public.is_superadmin() then
    select coalesce(array_agg(u), '{}') into effective_assignee_ids
    from unnest(p_assignee_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
    if coalesce(array_length(effective_assignee_ids, 1), 0) = 0 then
      effective_assignee_ids := array[auth.uid()];
    end if;
  else
    -- Supervisor: self, or their own direct reports only — mirrors assignableStaffFor exactly.
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
  -- enforce_task_invariants fires here (forces company_id from the workstream again, validates
  -- activity_id is enabled) — already redundant with ws.company_id above, kept for defense in depth.

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

-- notify_task_created is no longer called directly by any client — create_task calls it
-- internally (a SECURITY DEFINER function's nested calls use its own owner's grants, not the
-- calling role's, so this does not affect create_task's ability to call it). Narrowing exposure
-- now that nothing outside the database needs to invoke it directly.
revoke execute on function public.notify_task_created(uuid, uuid[], boolean) from authenticated;
