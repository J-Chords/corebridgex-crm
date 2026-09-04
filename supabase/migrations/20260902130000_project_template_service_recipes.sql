-- Project Level — Template architecture correction. The prior migration
-- (20260902121000_project_templates.sql, already hosted, never edited here) built
-- project_template_services/project_template_activities keyed on a bare service_line_id, and
-- materialization created empty Workstreams with no default Tasks/checklists/recurrence — a
-- second, competing template system alongside the pre-existing `templates`/`template_tasks`/
-- `template_checklist_items` recipe architecture (Phase 7D). This migration corrects that: a
-- Project Template is now a lightweight BUNDLE of existing `templates` (Service recipes) — it
-- never re-defines recurrence, default Tasks, or default checklists.
--
-- Verified live before writing this migration: project_templates/project_template_services/
-- project_template_activities all had zero rows hosted — the two junction tables are dropped and
-- recreated below rather than ALTERed-with-backfill; `project_templates` itself (name/description/
-- active/created_by, its CRUD RPCs, and its RLS) is UNCHANGED and retained as-is per the corrected
-- design's own instruction to keep that shell.

drop table if exists public.project_template_activities;
drop table if exists public.project_template_services;

-- Each entry is "this Project Template includes this existing Service Template/recipe" — never a
-- second definition of a Service. service_line_id is ALWAYS derived from the referenced
-- templates.service_line_id (see the trigger below) — it is never accepted as independent client
-- input, so the two can never disagree. unique(project_template_id, service_line_id) keeps a
-- Project Template from including two different recipes for the same Service Line (a Project
-- should get at most one Workstream per Service Line from one bundle).
create table public.project_template_services (
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  service_template_id uuid not null references public.templates(id) on delete restrict,
  service_line_id uuid not null references public.service_lines(id),
  primary key (project_template_id, service_template_id),
  unique (project_template_id, service_line_id)
);

create or replace function public.derive_project_template_service_line()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tmpl_service_line_id uuid;
begin
  select service_line_id into tmpl_service_line_id from public.templates where id = new.service_template_id;
  if tmpl_service_line_id is null then
    raise exception 'The selected Service Template has no Service Line configured and cannot be added to a Project Template.';
  end if;
  new.service_line_id := tmpl_service_line_id;
  return new;
end;
$function$;

create trigger project_template_services_derive_service_line
  before insert or update on public.project_template_services
  for each row execute function public.derive_project_template_service_line();

-- References an existing Activity for a specific bundled Service Template selection — never a
-- second Activity catalog. Validated (below) to belong to that Service Template's own Service
-- Line, exactly what Part 4/correction Section 4 requires.
create table public.project_template_activities (
  project_template_id uuid not null,
  service_template_id uuid not null,
  activity_id uuid not null references public.activities(id) on delete cascade,
  primary key (project_template_id, service_template_id, activity_id),
  foreign key (project_template_id, service_template_id)
    references public.project_template_services(project_template_id, service_template_id) on delete cascade
);

create or replace function public.validate_project_template_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  expected_service_line_id uuid;
  activity_service_line_id uuid;
begin
  select service_line_id into expected_service_line_id
    from public.project_template_services
    where project_template_id = new.project_template_id and service_template_id = new.service_template_id;
  if expected_service_line_id is null then
    raise exception 'This Project Template does not include that Service Template.';
  end if;
  select d.service_line_id into activity_service_line_id
    from public.activities a
    join public.departments d on d.id = a.department_id
    where a.id = new.activity_id;
  if activity_service_line_id is null or activity_service_line_id is distinct from expected_service_line_id then
    raise exception 'That Activity does not belong to the selected Service Template''s Service Line.';
  end if;
  return new;
end;
$function$;

create trigger project_template_activities_validate
  before insert on public.project_template_activities
  for each row execute function public.validate_project_template_activity();

alter table public.project_template_services enable row level security;
alter table public.project_template_activities enable row level security;

create policy "project_template_services_select" on public.project_template_services
  for select using (public.is_current_user_active());
create policy "project_template_services_write_admin" on public.project_template_services
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "project_template_activities_select" on public.project_template_activities
  for select using (public.is_current_user_active());
create policy "project_template_activities_write_admin" on public.project_template_activities
  for all using (public.is_superadmin()) with check (public.is_superadmin());

grant select on public.project_template_services, public.project_template_activities to authenticated;
grant insert, update, delete on public.project_template_services, public.project_template_activities to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Template management RPCs — repurposed for the new keys. Same Admin-only guarantees as before.
-- ---------------------------------------------------------------------------
drop function if exists public.set_project_template_services(uuid, uuid[]);

create or replace function public.set_project_template_services(p_template_id uuid, p_service_template_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can manage Project Templates.';
  end if;
  if not exists (select 1 from public.project_templates where id = p_template_id) then
    raise exception 'Project Template not found.';
  end if;
  delete from public.project_template_activities where project_template_id = p_template_id;
  delete from public.project_template_services where project_template_id = p_template_id;
  insert into public.project_template_services (project_template_id, service_template_id, service_line_id)
  select distinct p_template_id, tid, (select service_line_id from public.templates where id = tid)
  from unnest(p_service_template_ids) as tid
  where exists (select 1 from public.templates t where t.id = tid);
end;
$function$;

drop function if exists public.set_project_template_activities(uuid, uuid, uuid[]);

create or replace function public.set_project_template_activities(p_template_id uuid, p_service_template_id uuid, p_activity_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can manage Project Templates.';
  end if;
  if not exists (
    select 1 from public.project_template_services
    where project_template_id = p_template_id and service_template_id = p_service_template_id
  ) then
    raise exception 'This Project Template does not include that Service Template — add it first.';
  end if;
  delete from public.project_template_activities
  where project_template_id = p_template_id and service_template_id = p_service_template_id;
  -- Row-level trigger (validate_project_template_activity) rejects any activity that doesn't
  -- belong to this Service Template's own Service Line — never silently dropped, never accepted.
  insert into public.project_template_activities (project_template_id, service_template_id, activity_id)
  select distinct p_template_id, p_service_template_id, aid
  from unnest(p_activity_ids) as aid;
end;
$function$;

-- ---------------------------------------------------------------------------
-- ONE canonical "materialize a Service Template's default Tasks/checklists onto an
-- already-created Workstream" step — extracted out of apply_template so every path
-- (Company-only legacy flow, Project-aware flow) shares the exact same logic.
-- ---------------------------------------------------------------------------
create or replace function public.materialize_template_tasks(p_template_id uuid, p_workstream_id uuid, p_start_date date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tt record;
  new_task_id uuid;
  ci record;
begin
  for tt in select * from public.template_tasks where template_id = p_template_id order by position loop
    insert into public.tasks (
      title, description, workstream_id, status, priority, due_date, expected_minutes, created_by, self_added, template_id
    )
    values (
      tt.title, tt.description, p_workstream_id, 'todo', 'medium',
      case when tt.due_days_after_start is not null then p_start_date + tt.due_days_after_start else null end,
      tt.expected_minutes, auth.uid(), false, tt.id
    )
    returning id into new_task_id;

    for ci in select * from public.template_checklist_items where template_task_id = tt.id order by position loop
      insert into public.checklist_items (task_id, description, position) values (new_task_id, ci.description, ci.position);
    end loop;
  end loop;
end;
$function$;

revoke all on function public.materialize_template_tasks(uuid, uuid, date) from public, anon;
grant execute on function public.materialize_template_tasks(uuid, uuid, date) to authenticated, service_role;

-- apply_template — SAME signature as before (Company-only legacy flow, fully unchanged for every
-- existing caller): still creates its own Workstream the same way it always has, but now delegates
-- Task/checklist materialization to the shared helper instead of an inline copy of the same loop.
create or replace function public.apply_template(target_template_id uuid, p_company_id uuid, p_name text, p_lead_user_id uuid, p_team_user_ids uuid[], p_start_date date)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_workstream_id uuid;
  tmpl record;
  company_brand_id uuid;
begin
  if not (public.is_supervisor() or public.is_superadmin()) then
    raise exception 'Only a supervisor or superadmin can apply a template.';
  end if;

  select * into tmpl from public.templates where id = target_template_id;
  if not found then
    raise exception 'Template % not found.', target_template_id;
  end if;

  select brand_id into company_brand_id from public.companies where id = p_company_id;
  if not found then
    raise exception 'Company % not found.', p_company_id;
  end if;

  insert into public.workstreams (
    name, description, company_id, service_line_id, brand_id, lead_user_id, status,
    start_date, recurrence_frequency, recurrence_anchor_date, recurrence_custom_interval_days, created_by
  )
  values (
    p_name, tmpl.description, p_company_id, tmpl.service_line_id, company_brand_id, p_lead_user_id, 'active',
    p_start_date,
    tmpl.recurrence_frequency,
    case when tmpl.recurrence_frequency is not null then p_start_date else null end,
    tmpl.recurrence_custom_interval_days,
    auth.uid()
  )
  returning id into new_workstream_id;

  insert into public.workstream_members (workstream_id, user_id)
  select new_workstream_id, u from unnest(p_team_user_ids) as u;

  perform public.materialize_template_tasks(target_template_id, new_workstream_id, p_start_date);

  return new_workstream_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- apply_service_template_to_project — the NEW Project-aware canonical path. Reuses
-- create_workstream directly (its existing Superadmin/Supervisor/Employee role branches, its
-- existing project->company derivation, its existing Activity attachment — none of that is
-- duplicated here), then reuses the SAME materialize_template_tasks helper apply_template uses.
-- Idempotent: if the Project already has an active Workstream on this Service Template's Service
-- Line, no second Workstream/Tasks are created — only missing selected Activities are merged in.
-- ---------------------------------------------------------------------------
create or replace function public.apply_service_template_to_project(
  p_template_id uuid,
  p_project_id uuid,
  p_lead_user_id uuid,
  p_team_user_ids uuid[],
  p_start_date date,
  p_activity_ids uuid[]
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tmpl record;
  existing_workstream_id uuid;
  new_ws public.workstreams;
  merged_count int;
begin
  select * into tmpl from public.templates where id = p_template_id;
  if not found then
    raise exception 'Service Template % not found.', p_template_id;
  end if;
  if tmpl.service_line_id is null then
    raise exception 'This Service Template has no Service Line configured and cannot be applied to a Project.';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project % not found.', p_project_id;
  end if;

  select id into existing_workstream_id
  from public.workstreams
  where project_id = p_project_id and service_line_id = tmpl.service_line_id
  limit 1;

  if existing_workstream_id is not null then
    -- Already present — never a duplicate Workstream/Tasks/checklists. Merge only the missing
    -- selected Activities; everything else about the existing Service (assignments, dates, Tasks,
    -- time, Comments, Documents) is left exactly as it is.
    insert into public.workstream_activities (workstream_id, activity_id)
    select existing_workstream_id, aid from unnest(coalesce(p_activity_ids, '{}')) as aid
    on conflict do nothing;
    get diagnostics merged_count = row_count;
    return jsonb_build_object(
      'status', 'merged',
      'workstreamId', existing_workstream_id,
      'serviceLineId', tmpl.service_line_id,
      'activitiesMerged', merged_count
    );
  end if;

  new_ws := public.create_workstream(
    tmpl.name, tmpl.description, null, p_project_id, tmpl.service_line_id, p_lead_user_id,
    coalesce(p_team_user_ids, '{}'), coalesce(p_activity_ids, '{}'), 'active', p_start_date, null,
    tmpl.recurrence_frequency,
    case when tmpl.recurrence_frequency is not null then p_start_date else null end,
    tmpl.recurrence_custom_interval_days,
    null
  );

  perform public.materialize_template_tasks(p_template_id, new_ws.id, p_start_date);

  return jsonb_build_object('status', 'created', 'workstreamId', new_ws.id, 'serviceLineId', tmpl.service_line_id);
end;
$function$;

revoke all on function public.apply_service_template_to_project(uuid, uuid, uuid, uuid[], date, uuid[]) from public, anon;
grant execute on function public.apply_service_template_to_project(uuid, uuid, uuid, uuid[], date, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_project_template — applies a whole named bundle to an existing Project. Authorization is
-- deliberately NOT re-implemented here: apply_service_template_to_project -> create_workstream
-- already enforces exactly "Superadmin always; Supervisor/Employee only with real Project access
-- and only as their own/their report's legitimate Workstream Lead" per Service — this function
-- adds no new permission surface, it only loops. The resolved lead for every materialized Service
-- is always the Project's own real owner_id (never fabricated, never caller-supplied), matching
-- create_project's own materialization convention exactly.
-- ---------------------------------------------------------------------------
create or replace function public.apply_project_template(p_project_template_id uuid, p_project_id uuid, p_start_date date default current_date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  project_owner_id uuid;
  pts record;
  activity_ids uuid[];
  step jsonb;
  results jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.project_templates where id = p_project_template_id and active) then
    raise exception 'Project Template not found or inactive.';
  end if;
  select owner_id into project_owner_id from public.projects where id = p_project_id;
  if project_owner_id is null then
    raise exception 'Project % not found.', p_project_id;
  end if;

  for pts in
    select service_template_id from public.project_template_services where project_template_id = p_project_template_id
  loop
    select array_agg(activity_id) into activity_ids
    from public.project_template_activities
    where project_template_id = p_project_template_id and service_template_id = pts.service_template_id;

    step := public.apply_service_template_to_project(
      pts.service_template_id, p_project_id, project_owner_id, '{}', p_start_date, coalesce(activity_ids, '{}')
    );
    results := results || jsonb_build_array(step);
  end loop;

  return results;
end;
$function$;

revoke all on function public.apply_project_template(uuid, uuid, date) from public, anon;
grant execute on function public.apply_project_template(uuid, uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_project — SAME 14-arg signature (no drop needed, no client caller is affected), body
-- corrected so Template materialization goes through the SAME canonical path as every other flow
-- (real recurrence, real default Tasks/checklists, real selected Activities) instead of a bare
-- create_workstream call with none of that.
-- ---------------------------------------------------------------------------
create or replace function public.create_project(
  p_company_id uuid,
  p_name text,
  p_owner_id uuid default null,
  p_contract_start_date date default null,
  p_contract_months integer default 12,
  p_contract_end_date date default null,
  p_completion_date date default null,
  p_start_date date default null,
  p_end_date date default null,
  p_description text default null,
  p_project_group_id uuid default null,
  p_tags text[] default '{}',
  p_member_user_ids uuid[] default '{}',
  p_template_id uuid default null
)
 returns projects
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_project public.projects;
  effective_owner_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin may create a project.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Title can''t be empty.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found.';
  end if;

  effective_owner_id := coalesce(p_owner_id, auth.uid());
  if not exists (select 1 from public.profiles where id = effective_owner_id and active) then
    raise exception 'Owner not found or inactive.';
  end if;
  if p_project_group_id is not null and not exists (select 1 from public.project_groups where id = p_project_group_id) then
    raise exception 'Project Group not found.';
  end if;
  if p_template_id is not null and not exists (select 1 from public.project_templates where id = p_template_id and active) then
    raise exception 'Project Template not found or inactive.';
  end if;

  insert into public.projects (
    company_id, name, owner_id, status, contract_start_date, contract_months, contract_end_date,
    completion_date, start_date, end_date, description, project_group_id, tags, created_by
  ) values (
    p_company_id, trim(p_name), effective_owner_id, 'active', p_contract_start_date,
    coalesce(p_contract_months, 12), p_contract_end_date, p_completion_date, p_start_date, p_end_date,
    p_description, p_project_group_id, coalesce(p_tags, '{}'), auth.uid()
  )
  returning * into new_project;

  if coalesce(array_length(p_member_user_ids, 1), 0) > 0 then
    insert into public.project_members (project_id, user_id)
    select new_project.id, u from unnest(p_member_user_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
  end if;

  if p_template_id is not null then
    -- ONE canonical bundle-apply path — the exact same function "Project -> Services -> Apply
    -- Template" uses on an existing Project. apply_project_template re-derives the lead from the
    -- Project's own owner_id (the row just inserted above), so nothing is duplicated here.
    perform public.apply_project_template(p_template_id, new_project.id, coalesce(p_start_date, current_date));
  end if;

  return new_project;
end;
$function$;
