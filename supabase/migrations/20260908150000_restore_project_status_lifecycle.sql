-- Boss-Aligned Project Status Restoration.
--
-- Read-only hosted audit performed before writing this file: all 4 hosted Projects are
-- status='active' with completion_date IS NULL and status_changed_at IS NULL (never transitioned) —
-- zero ambiguity, so this migration is purely additive/restorative, never a destructive rewrite.
-- Every function body below was read fresh from the ACTUAL CURRENT HOSTED definition via
-- pg_get_functiondef immediately before writing this file (confirmed identical to
-- 20260908140000_project_lifecycle_authoritative_hardening.sql, the prior pass — nothing else has
-- touched these objects since).
--
-- What changed conceptually: the prior pass over-simplified the normal Project lifecycle to just
-- Active<->Archived and repurposed `completion_date` to also mean "Archived On". The Product Owner
-- has now restored the full boss-required business-state set (Active/On Hold/Completed/Canceled/
-- Archived, Trash still separate) and requires `completion_date` (a genuine successful completion)
-- and the Archive date to be two distinct, never-conflated fields. Since no dedicated Archive-date
-- column existed, this migration adds one (`archived_at`) — the narrow new field the Product Owner
-- pre-approved after this exact audit.

-- ============================================================================================
-- 1. New column — the dedicated, persisted Archive date. Nullable, no default; existing rows are
--    unaffected (all 4 hosted Projects are Active with no archive history to backfill).
-- ============================================================================================
alter table public.projects add column archived_at timestamptz;

-- ============================================================================================
-- 2. set_project_status — restore the full normal target set (active/on-hold/completed/cancelled/
--    archived), restore the on-hold/cancelled reason requirement, and separate the two dates:
--    completion_date is set ONCE (first time only, never overwritten by any later transition) on a
--    move to 'completed'; archived_at is stamped to the LATEST value on every move to 'archived'
--    (so a later re-Archive updates it) and is never touched by any other transition (so Reactivate
--    preserves it). trash_project/restore_project remain separate, unchanged — they already never
--    reference either date column, so Trash/Restore already correctly preserve both.
-- ============================================================================================
create or replace function public.set_project_status(target_project_id uuid, new_status text, p_reason text default null)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.projects;
  updated public.projects;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can change a project''s status.';
  end if;
  if new_status not in ('active', 'on-hold', 'completed', 'cancelled', 'archived') then
    raise exception 'Invalid status for this action: %', new_status;
  end if;
  select * into existing from public.projects where id = target_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  if existing.status = 'trash' then
    raise exception 'This project is in Trash — restore it first.';
  end if;
  if new_status in ('on-hold', 'cancelled') and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required when moving a project to % .', new_status;
  end if;

  update public.projects
  set status = new_status,
      status_reason = case when new_status in ('on-hold', 'cancelled') then trim(p_reason) else null end,
      status_changed_at = now(),
      status_changed_by = auth.uid(),
      completion_date = case
        when new_status = 'completed' and existing.completion_date is null then current_date
        else existing.completion_date
      end,
      archived_at = case
        when new_status = 'archived' then now()
        else existing.archived_at
      end,
      updated_at = now()
  where id = target_project_id
  returning * into updated;
  return updated;
end;
$$;

-- ============================================================================================
-- 3. create_task — widen the Archived-only rejection to "Project must be Active", with an accurate
--    per-status explanation. Current hosted signature (confirmed via pg_get_functiondef) carries
--    p_start_date/p_status_reason from a later Task Phase 1 migration — reused verbatim. Nothing
--    else in this function is modified.
-- ============================================================================================
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
  p_checklist_items text[],
  p_start_date date default null,
  p_status_reason text default null
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
$$;

-- ============================================================================================
-- 4. create_workstream — same widening: Archived-only -> "must be Active", with the same
--    per-status explanation. Current hosted body (confirmed identical to
--    20260908140000_project_lifecycle_authoritative_hardening.sql) reused verbatim otherwise.
-- ============================================================================================
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
set search_path = ''
as $$
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
    effective_lead_id := auth.uid();
    effective_team_ids := '{}';
  else
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
$$;

-- ============================================================================================
-- 5. workstream_activities_write — widen the Archived-only rejection to "Project must be Active".
--    Current hosted policy (confirmed identical to 20260908140000_project_lifecycle_authoritative_
--    hardening.sql) reused verbatim otherwise; the separate workstream_activities_select policy
--    (reads) is untouched by this migration.
-- ============================================================================================
drop policy "workstream_activities_write" on public.workstream_activities;

create policy "workstream_activities_write" on public.workstream_activities
  for all
  using (
    (
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
    and not exists (
      select 1 from public.workstreams w
      join public.projects p on p.id = w.project_id
      where w.id = workstream_activities.workstream_id and p.status is distinct from 'active'
    )
  )
  with check (
    (
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
    and not exists (
      select 1 from public.workstreams w
      join public.projects p on p.id = w.project_id
      where w.id = workstream_activities.workstream_id and p.status is distinct from 'active'
    )
  );
