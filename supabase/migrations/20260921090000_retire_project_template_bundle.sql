-- COREBRIDGE X — Phase 0A: retire the legacy "Project Template" bundle architecture.
--
-- Context: a prior pass (see docs/decisions.md's "Services/Activity Configuration correction")
-- already removed this bundle layer from the visible app — the `/dashboard/projects/templates`
-- admin page, the Project Services-tab "Apply Template" dialog, and the New Project Template
-- picker are all gone. The underlying database objects were deliberately left dormant at that
-- time, not destroyed. A targeted dependency audit (read-only) has since confirmed: zero inbound
-- FK from any real Project/Workstream/Activity/Task/Checklist table into any object dropped below
-- (the only inbound FK found anywhere in the schema, tasks.template_id -> template_tasks(id) ON
-- DELETE SET NULL, points at the SEPARATE, still-live Service-recipe system and is untouched by
-- this migration); `create_project`/`create_client_project`'s `p_template_id` parameter is
-- optional and every current UI caller already omits it. This migration completes that retirement
-- at the schema level. It does NOT touch `service_lines`, `workstreams`, `workstream_members`,
-- `activities`, `departments`, `tasks`, `checklist_items`, `projects`, `companies`, or the live
-- Service-recipe system (`templates`, `template_tasks`, `template_checklist_items`,
-- `apply_template`, `materialize_template_tasks`, `apply_service_template_to_project`) — all of
-- those are explicitly preserved, unchanged.
--
-- No historical Project/Workstream/Task/Checklist row is deleted or altered by this migration —
-- every row ever materialized from a Project Template bundle is an independent copy (Workstreams,
-- Checklist items) or governed by a separate, untouched ON DELETE SET NULL FK (Tasks, via the
-- Service-recipe system only) — see the dependency audit's FK graph for the full evidence trail.

-- ---------------------------------------------------------------------------
-- A. Repair the one external dependency first — admin_delete_activity's own delete-guard queries
-- project_template_activities directly (added defensively because that table is ON DELETE CASCADE
-- off activities). Recreated here WITHOUT that clause, in the same migration that drops the table,
-- so this function is never left querying a relation that no longer exists. Its other three
-- historical-usage guards (workstream_activities/tasks/project_issues) are unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_activity(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can delete an Activity.';
  end if;

  if not exists (select 1 from public.activities where id = p_id) then
    raise exception 'Activity not found.';
  end if;

  if exists (select 1 from public.workstream_activities where activity_id = p_id)
    or exists (select 1 from public.tasks where activity_id = p_id)
    or exists (select 1 from public.project_issues where activity_id = p_id)
  then
    raise exception 'This Activity has historical usage and cannot be deleted — deactivate it instead.';
  end if;

  delete from public.activities where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- B. Drop the System-A-only RPCs (dormant, zero UI callers). apply_service_template_to_project,
-- materialize_template_tasks, and apply_template are explicitly NOT touched — they belong to the
-- separate, still-live Service-recipe system.
-- ---------------------------------------------------------------------------
drop function if exists public.apply_project_template(uuid, uuid, date);
drop function if exists public.set_project_template_activities(uuid, uuid, uuid[]);
drop function if exists public.set_project_template_services(uuid, uuid[]);
drop function if exists public.update_project_template(uuid, text, text, boolean);
drop function if exists public.create_project_template(text, text);

-- ---------------------------------------------------------------------------
-- C. Drop the System-A triggers, then their trigger functions (table drops below would cascade the
-- triggers themselves, but not the standalone trigger functions).
-- ---------------------------------------------------------------------------
drop trigger if exists project_template_activities_validate on public.project_template_activities;
drop trigger if exists project_template_services_derive_service_line on public.project_template_services;
drop function if exists public.validate_project_template_activity();
drop function if exists public.derive_project_template_service_line();

-- ---------------------------------------------------------------------------
-- D. Drop the System-A tables, child to parent. Their RLS policies and grants are removed
-- automatically as part of the table drop — nothing else references any of these three tables.
-- ---------------------------------------------------------------------------
drop table if exists public.project_template_activities;
drop table if exists public.project_template_services;
drop table if exists public.project_templates;

-- ---------------------------------------------------------------------------
-- E. create_project — staged compatibility. SAME 14-arg signature (no external-caller break): the
-- app no longer sends p_template_id at all, but the parameter stays, still optional/nullable, for
-- any unknown external/service-role caller. Body no longer queries project_templates (now dropped).
-- A null value (the only value any current caller sends) behaves exactly as before. A non-null
-- legacy value is never silently ignored — it now raises a clear, specific exception instead of
-- either erroring on a missing relation or materializing nothing silently.
-- create_client_project needs no change — it only forwards p_template_id straight through to this
-- function, and never queries project_templates itself.
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
  p_template_id uuid default null -- deprecated, technical-compatibility only; legacy Project Templates are retired
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
  if p_template_id is not null then
    raise exception 'Legacy Project Templates are no longer supported.';
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

  return new_project;
end;
$function$;
