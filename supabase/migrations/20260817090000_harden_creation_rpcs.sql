-- Phase 8B final hardening pass — create_workstream/create_task authorization tightening.
--
-- Both RPCs are SECURITY DEFINER, so ordinary table RLS is NOT consulted for their own internal
-- writes — the function body IS the authorization boundary. Two real gaps found on review of the
-- previously-pushed 20260816090000 migration (left untouched; this is a forward-only replacement
-- via CREATE OR REPLACE, the same convention already used for can_access_company/can_access_project
-- across this phase):
--
-- 1. create_workstream grouped `is_supervisor() OR is_superadmin()` together before trusting
--    `p_lead_user_id`/`p_team_user_ids`/`p_project_id`/`p_company_id` completely as sent — meaning a
--    Supervisor (not just Superadmin) could name ANY organization member as lead/team, or target a
--    Project entirely outside their own scope, or send a company_id that doesn't match the given
--    Project. Corebridge X is Employee-first: Supervisor is Employee + direct-report/team
--    privileges, never organization-wide — this let Supervisor behave like Superadmin.
-- 2. create_task checked `p_allow_unassigned AND no requested assignees` BEFORE the Employee
--    branch — meaning a direct (non-UI) RPC call from an Employee session with
--    `p_allow_unassigned=true` could produce a genuinely unassigned self-added Task, contradicting
--    the locked "an Employee-created Task must always be assigned to that Employee" rule. The UI
--    never sends that combination for an Employee, but the RPC itself must not rely on that.
--
-- Both fixes are pure authorization tightening — no legitimate today-working flow is narrowed:
-- Superadmin (org-wide), Supervisor's real self/direct-report scope, and Supervisor/Superadmin's
-- existing "allow unassigned" bulk-creation flows (Quick Add from Activity, Generate Next
-- Occurrence) are all unaffected; only paths that were never legitimately reachable through the UI
-- are now also rejected at the RPC layer itself.
--
-- A third, unrelated, previously-undiscovered bug was also found and fixed here while
-- rollback-safe-simulating these paths: `enforce_workstream_project_link` (20260815100000)'s
-- project_id-omitted auto-resolve branch used `min(id)` over a `uuid` column — Postgres has no
-- built-in MIN/MAX aggregate for `uuid`, so that branch has been raising
-- `function min(uuid) does not exist` for its entire life, for EVERY caller that omits project_id
-- (in practice, only the legacy Superadmin Company-page "Add Workstream" flow when a Company has
-- related Project(s) to auto-resolve against). This apparently went uncaught because every
-- Project-aware flow built since always supplies project_id explicitly. Fixed by replacing the
-- single MIN-aggregate query with a plain `order by id limit 1`, which needs no MIN/MAX support for
-- any column type. `enforce_workstream_project_link` itself is otherwise unchanged — this is a
-- pure bugfix, not a behavior or authorization change, and 20260815100000 is left untouched per the
-- forward-only rule.

create or replace function public.enforce_workstream_project_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_project_id uuid;
  matching_project_count int;
  project_company_id uuid;
begin
  if new.project_id is null then
    select count(*) into matching_project_count
    from public.projects where company_id = new.company_id;

    if matching_project_count = 0 then
      raise exception 'Company % has no Project yet — create one before adding a Service.', new.company_id;
    elsif matching_project_count > 1 then
      raise exception 'Company % has more than one Project — a Service must specify which Project it belongs to.', new.company_id;
    end if;

    select id into resolved_project_id
    from public.projects where company_id = new.company_id
    order by id limit 1;
    new.project_id := resolved_project_id;
  end if;

  select company_id into project_company_id from public.projects where id = new.project_id;
  if project_company_id is null then
    raise exception 'Project % not found.', new.project_id;
  end if;
  new.company_id := project_company_id;

  return new;
end;
$$;

create or replace function public.create_workstream(
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
  effective_company_id uuid;
  effective_lead_id uuid;
  effective_team_ids uuid[];
  new_ws public.workstreams;
  project_company_id uuid;
begin
  if public.is_superadmin() then
    -- Organization-wide: any active lead/team; the legacy Company-page "Add Workstream" flow
    -- (still Superadmin-only in practice) omits project_id entirely, which stays supported here.
    if not exists (select 1 from public.profiles where id = p_lead_user_id and active) then
      raise exception 'Lead user not found or inactive.';
    end if;
    if exists (
      select 1 from unnest(coalesce(p_team_user_ids, '{}')) as u
      where not exists (select 1 from public.profiles where id = u and active)
    ) then
      raise exception 'One of the selected team members was not found or is inactive.';
    end if;
    effective_lead_id := p_lead_user_id;
    effective_team_ids := coalesce(p_team_user_ids, '{}');

  elsif public.is_supervisor() then
    -- Supervisor = Employee + direct-report/team privileges, never organization-wide. Every real
    -- call site today always supplies project_id (Project workspace "+ Add Service", Generate Next
    -- Occurrence) — requiring it here matches actual usage, it does not narrow anything real.
    if p_project_id is null then
      raise exception 'A project is required to create a service.';
    end if;
    if not public.can_access_project(p_project_id) then
      raise exception 'You don''t have access to that project.';
    end if;
    if not (
      p_lead_user_id = auth.uid()
      or exists (select 1 from public.profiles where id = p_lead_user_id and active and supervisor_id = auth.uid())
    ) then
      raise exception 'You can only lead this yourself or assign one of your own direct reports.';
    end if;
    if exists (
      select 1 from unnest(coalesce(p_team_user_ids, '{}')) as u
      where not exists (
        select 1 from public.profiles where id = u and active and (id = auth.uid() or supervisor_id = auth.uid())
      )
    ) then
      raise exception 'One of the selected team members is outside your team.';
    end if;
    effective_lead_id := p_lead_user_id;
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
    effective_lead_id := auth.uid();
    effective_team_ids := '{}';
  else
    raise exception 'Not authorized to create a service.';
  end if;

  -- Company is always derived from the Project when one is given — never trusted from the
  -- browser-supplied p_company_id, for any role. Only the legacy no-project flow (Superadmin only,
  -- in practice) falls back to p_company_id directly. enforce_workstream_project_link still
  -- independently re-derives/enforces this exact invariant as a defense-in-depth backstop.
  if p_project_id is not null then
    select company_id into project_company_id from public.projects where id = p_project_id;
    if project_company_id is null then
      raise exception 'Project % not found.', p_project_id;
    end if;
    effective_company_id := project_company_id;
  else
    effective_company_id := p_company_id;
  end if;

  select brand_id into company_brand_id from public.companies where id = effective_company_id;
  if not found then
    raise exception 'Company not found.';
  end if;

  insert into public.workstreams (
    name, description, company_id, project_id, service_line_id, brand_id, lead_user_id, status,
    start_date, end_date, recurrence_frequency, recurrence_anchor_date, recurrence_custom_interval_days,
    previous_occurrence_workstream_id, created_by
  ) values (
    p_name, p_description, effective_company_id, p_project_id, p_service_line_id, company_brand_id, effective_lead_id, p_status,
    p_start_date, p_end_date, p_recurrence_frequency, p_recurrence_anchor_date, p_recurrence_custom_interval_days,
    p_previous_occurrence_workstream_id, auth.uid()
  )
  returning * into new_ws;

  if coalesce(array_length(effective_team_ids, 1), 0) > 0 then
    insert into public.workstream_members (workstream_id, user_id)
    select new_ws.id, u from unnest(effective_team_ids) as u;
  end if;

  if coalesce(array_length(p_activity_ids, 1), 0) > 0 then
    insert into public.workstream_activities (workstream_id, activity_id)
    select new_ws.id, a from unnest(p_activity_ids) as a;
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
begin
  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;
  if not public.can_access_workstream(p_workstream_id) then
    raise exception 'You don''t have access to that workstream.';
  end if;

  self_added := public.is_employee();

  -- The Employee branch is checked FIRST and unconditionally — an Employee-created Task is always
  -- assigned to that Employee, full stop, regardless of what p_allow_unassigned/p_assignee_ids the
  -- caller sends. Previously "allow unassigned" was checked before the Employee branch, which would
  -- have let a direct (non-UI) RPC call produce a genuinely unassigned self-added Task.
  if public.is_employee() then
    effective_assignee_ids := array[auth.uid()];
  elsif p_allow_unassigned and coalesce(array_length(p_assignee_ids, 1), 0) = 0 then
    -- Legitimate today: Supervisor/Superadmin bulk-creation flows (Quick Add from Activity,
    -- Generate Next Occurrence) intentionally create some tasks with no fixed assignee yet.
    effective_assignee_ids := '{}';
  elsif public.is_superadmin() then
    select coalesce(array_agg(u), '{}') into effective_assignee_ids
    from unnest(p_assignee_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
    if coalesce(array_length(effective_assignee_ids, 1), 0) = 0 then
      effective_assignee_ids := array[auth.uid()];
    end if;
  else
    -- Supervisor: self, or their own active direct reports only — mirrors assignableStaffFor exactly.
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
