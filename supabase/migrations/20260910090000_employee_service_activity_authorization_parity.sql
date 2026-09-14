-- ============================================================================================
-- Employee Service/Activity Authorization Parity (MVP Gap Closure)
-- ============================================================================================
-- Boss-approved final rule: an Employee may view legitimate Project Services and Activities and
-- create Tasks under the accepted Task authorization rules, but can NEVER add a Service to a
-- Project, and can NEVER configure (add/remove) a Service's Activities — at any layer.
--
-- The prior MVP Simplification Pass already narrowed the app/mock-provider layer
-- (canCreateWorkstreamInProject / canCreateWorkstream / canConfigureWorkstreamActivities), but
-- explicitly flagged that the hosted database layer still permitted an Employee-as-lead write in
-- three places, confirmed by reading the live hosted definitions before writing this migration:
--
--   1. create_workstream() — its `elsif public.is_employee() then ...` branch let an Employee
--      create a brand-new Workstream (Service) for a Project they can access, as long as they led
--      it themselves.
--   2. create_task()'s `may_extend_activities` check included
--      `(public.is_employee() and ws.lead_user_id = auth.uid())`, letting an Employee-as-lead
--      implicitly enable a not-yet-configured Activity for their Workstream as a side effect of
--      creating a Task tagged with it.
--   3. The `workstream_activities_write` RLS policy on public.workstream_activities included the
--      same Employee-as-lead clause in both USING and WITH CHECK, permitting a direct table write
--      (insert/update/delete) to a Workstream's configured Activities, independent of any RPC.
--
-- This migration removes only the Employee clause from all three. It does NOT touch:
--   - Supervisor or Superadmin authorization in any of the three (unchanged, still exactly as
--     before: Supervisor may lead-or-assign-a-direct-report and must have Project access;
--     Superadmin is unrestricted).
--   - Task creation/assignment logic in create_task() (self-assignment, Superadmin/Supervisor
--     assignee resolution, checklist items, notifications) — completely untouched.
--   - The Project Active-only operational guard in either RPC (untouched, reused verbatim).
--   - workstream_activities_select (read access) — untouched.
--   - Any other RLS policy or RPC.
--
-- An Employee can therefore still create a Task (including one tagged with an Activity already
-- enabled for their Workstream), but can no longer create a Service, nor enable a not-yet-
-- configured Activity for one — by RPC or by direct table write.
-- ============================================================================================

-- 1. create_workstream — Employee branch removed; Employee now always hits the final `else`.
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
  p_recurrence_custom_interval_days integer,
  p_previous_occurrence_workstream_id uuid
)
returns public.workstreams
language plpgsql
security definer
set search_path to ''
as $function$
declare
  company_brand_id uuid;
  effective_company_id uuid;
  effective_lead_id uuid;
  effective_team_ids uuid[];
  new_ws public.workstreams;
  project_company_id uuid;
  project_status text;
begin
  if public.is_superadmin() then
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

  else
    -- Boss-approved final rule (MVP Gap Closure) — an Employee can never create a Service
    -- (Workstream), regardless of who they'd lead it as; only Supervisor/Superadmin may.
    raise exception 'Not authorized to create a service.';
  end if;

  if p_project_id is not null then
    select company_id into project_company_id from public.projects where id = p_project_id;
    if project_company_id is null then
      raise exception 'Project % not found.', p_project_id;
    end if;
    effective_company_id := project_company_id;
  else
    effective_company_id := p_company_id;
  end if;

  -- Boss-Aligned Project Status Restoration — a Project must be Active to receive a new Service;
  -- every other normal state blocks it with its own accurate explanation, same as Trash.
  if p_project_id is not null then
    select status into project_status from public.projects where id = p_project_id;
    if project_status is distinct from 'active' then
      raise exception '%', case project_status
        when 'archived' then 'This client is archived. Reactivate the client to add new work.'
        when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
        when 'completed' then 'This project is completed. Return it to Active to add new work.'
        when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
        when 'trash' then 'This project is in Trash — restore it first.'
        else 'This project must be Active to add new work.'
      end;
    end if;
  end if;

  if not exists (select 1 from public.companies where id = effective_company_id) then
    raise exception 'Company not found.';
  end if;
  select brand_id into company_brand_id from public.companies where id = effective_company_id;
  if company_brand_id is null then
    raise exception 'This client has no Brand set yet — add a Brand to this client before creating a Service.';
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
$function$;

-- 2. create_task — may_extend_activities loses its Employee-as-lead clause; everything else
--    (assignment resolution, checklist items, notification) is byte-for-byte unchanged.
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
  p_expected_minutes integer,
  p_template_id uuid,
  p_checklist_items text[],
  p_start_date date default null::date,
  p_status_reason text default null::text
)
returns public.tasks
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ws public.workstreams;
  new_task public.tasks;
  effective_assignee_ids uuid[];
  self_added boolean;
  i int;
  activity_already_enabled boolean;
  may_extend_activities boolean;
  project_status text;
begin
  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;
  if not public.can_access_workstream(p_workstream_id) then
    raise exception 'You don''t have access to that workstream.';
  end if;

  -- Boss-Aligned Project Status Restoration — a Project must be Active to receive new operational
  -- work; every other normal state (On Hold/Completed/Canceled/Archived) blocks it with its own
  -- accurate explanation, same as Trash.
  if ws.project_id is not null then
    select status into project_status from public.projects where id = ws.project_id;
    if project_status is distinct from 'active' then
      raise exception '%', case project_status
        when 'archived' then 'This client is archived. Reactivate the client to add new work.'
        when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
        when 'completed' then 'This project is completed. Return it to Active to add new work.'
        when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
        when 'trash' then 'This project is in Trash — restore it first.'
        else 'This project must be Active to add new work.'
      end;
    end if;
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
      -- Boss-approved final rule (MVP Gap Closure) — an Employee can never configure a Service's
      -- Activities, including implicitly via Task creation; only Supervisor/Superadmin may.
      may_extend_activities :=
        public.is_superadmin()
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
    title, description, company_id, workstream_id, status, status_reason, priority, due_date, start_date, expected_minutes,
    created_by, self_added, template_id, activity_id
  ) values (
    p_title, p_description, ws.company_id, p_workstream_id, p_status, p_status_reason, p_priority, p_due_date, p_start_date, p_expected_minutes,
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
$function$;

-- 3. workstream_activities_write RLS — Employee-as-lead clause removed from both USING and WITH
--    CHECK; Supervisor/Superadmin clauses and the Project-must-be-Active guard reused verbatim
--    from the current hosted policy (20260908150000_restore_project_status_lifecycle.sql).
--    workstream_activities_select (reads) is untouched.
drop policy "workstream_activities_write" on public.workstream_activities;

create policy "workstream_activities_write" on public.workstream_activities
  for all
  using (
    (
      public.is_superadmin()
      or (public.is_supervisor() and exists (
        select 1 from public.workstreams w
        where w.id = workstream_id
          and public.manages_user(w.lead_user_id)
          and public.can_access_project(w.project_id)
      ))
    )
    and not exists (
      select 1 from public.workstreams w
      join public.projects p on p.id = w.project_id
      where w.id = workstream_activities.workstream_id and p.status is distinct from 'active'
    )
  )
  with check (
    (
      public.is_superadmin()
      or (public.is_supervisor() and exists (
        select 1 from public.workstreams w
        where w.id = workstream_id
          and public.manages_user(w.lead_user_id)
          and public.can_access_project(w.project_id)
      ))
    )
    and not exists (
      select 1 from public.workstreams w
      join public.projects p on p.id = w.project_id
      where w.id = workstream_activities.workstream_id and p.status is distinct from 'active'
    )
  );
