-- Phase 3 (CD-208) — post-migration authorization hardening.
--
-- A final hosted authorization pass after the five Phase-3 migrations found three real gaps left
-- over from the pre-Phase-3 authorization model, all stemming from the same root cause: several
-- SECURITY DEFINER functions and RLS policies still used can_access_project (read/visibility) or
-- the pre-Phase-3 manages_user(lead_user_id)-based rule as their MUTATION boundary, instead of the
-- new, narrower can_manage_project (Admin, or the Supervisor who is literally the Project's
-- owner_id). This migration closes those three gaps additively — it does not touch any of the five
-- already-applied Phase-3 migrations, Partner Brand, the Template/Activity snapshot schema, System
-- A/B, Task/Time Entry semantics, or Blocked. It is purely an authorization-boundary tightening.
--
-- 1. create_project — the Phase-3 Supervisor (Team Lead) creation path still accepted
--    p_member_user_ids and inserted rows into project_members via this SECURITY DEFINER function,
--    which bypasses the Admin-only project_members RLS. Broader Project staffing is explicitly
--    Phase 4's territory — a Team Lead creating a Project in Phase 3 must not be able to seed
--    arbitrary Project members as a side effect. Admin behavior (may still supply members) is
--    unchanged; a Supervisor caller supplying any p_member_user_ids now gets a clear exception
--    instead of having them silently accepted or silently dropped. create_client_project delegates
--    straight into this function and needs no separate change — the guard covers it automatically.
--
-- 2. create_workstream — the Supervisor branch authorized Service creation using
--    can_access_project(p_project_id), a READ/visibility predicate broader than mutation authority
--    (it's true for any Project a Supervisor's team owns or belongs to, not just one they own).
--    Replaced with can_manage_project(p_project_id), so a non-owner Supervisor is denied even when
--    they manage the Project's owner, manage a member, or can otherwise read the Project. No other
--    branch or validation in this function changes.
--
-- 3. workstreams_insert RLS — the direct-table INSERT policy still allowed any Supervisor
--    (regardless of Project ownership) and an Employee-as-lead branch. Replaced with the Phase-3
--    owner boundary: Superadmin unconditional; Supervisor only when project_id is set and
--    can_manage_project(project_id) is true. Employee direct INSERT is now denied outright.
--
-- 4. workstream_activities_write RLS — the direct-table write policy authorized Supervisor writes
--    via manages_user(w.lead_user_id) + can_access_project(w.project_id), the same broader
--    read-shaped predicate as (2). Replaced with can_manage_project(w.project_id), requiring the
--    Workstream to have a Project at all. The existing Project-must-be-Active lifecycle guard is
--    reused verbatim, unchanged, for both Superadmin and Supervisor.

-- ---------------------------------------------------------------------------
-- 1. create_workstream — Supervisor branch's authorization check narrowed from can_access_project
--    (read) to can_manage_project (write/owner). Every other line is byte-for-byte unchanged from
--    the currently-applied Phase-3 definition (20260924120000).
-- ---------------------------------------------------------------------------
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
  effective_brand_id uuid;
  effective_company_id uuid;
  effective_lead_id uuid;
  effective_team_ids uuid[];
  new_ws public.workstreams;
  project_company_id uuid;
  project_partner_brand_id uuid;
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
    -- Phase 3 hardening (CD-208): can_access_project is a READ/visibility predicate (true for any
    -- Project a Supervisor's team owns or belongs to) and is broader than mutation authority.
    -- Service creation is a Project mutation, so it must use the same owner-only boundary as every
    -- other Project-management action.
    if not public.can_manage_project(p_project_id) then
      raise exception 'You don''t have permission to add a Service to that project.';
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
    raise exception 'Not authorized to create a service.';
  end if;

  if p_project_id is not null then
    select company_id, partner_brand_id into project_company_id, project_partner_brand_id
    from public.projects where id = p_project_id;
    if project_company_id is null then
      raise exception 'Project % not found.', p_project_id;
    end if;
    effective_company_id := project_company_id;
  else
    effective_company_id := p_company_id;
  end if;

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

  if p_project_id is not null and p_service_line_id is not null then
    if exists (
      select 1 from public.workstreams w
      where w.project_id = p_project_id
        and w.service_line_id = p_service_line_id
        and w.status <> 'cancelled'
    ) then
      raise exception 'This Service is already active on this Project.';
    end if;
  end if;

  if not exists (select 1 from public.companies where id = effective_company_id) then
    raise exception 'Company not found.';
  end if;

  effective_brand_id := coalesce(
    project_partner_brand_id,
    (select brand_id from public.companies where id = effective_company_id)
  );

  insert into public.workstreams (
    name, description, company_id, project_id, service_line_id, brand_id, lead_user_id, status,
    start_date, end_date, recurrence_frequency, recurrence_anchor_date, recurrence_custom_interval_days,
    previous_occurrence_workstream_id, created_by
  ) values (
    p_name, p_description, effective_company_id, p_project_id, p_service_line_id, effective_brand_id, effective_lead_id, p_status,
    p_start_date, p_end_date, p_recurrence_frequency, p_recurrence_anchor_date, p_recurrence_custom_interval_days,
    p_previous_occurrence_workstream_id, auth.uid()
  )
  returning * into new_ws;

  if coalesce(array_length(effective_team_ids, 1), 0) > 0 then
    insert into public.workstream_members (workstream_id, user_id)
    select new_ws.id, u from unnest(effective_team_ids) as u;
  end if;

  if coalesce(array_length(p_activity_ids, 1), 0) > 0 then
    insert into public.workstream_activities (workstream_id, activity_id, name, description, default_task_titles, position)
    select new_ws.id, a.id, a.name, a.description, a.default_task_titles, a.position
    from public.activities a
    where a.id = any(p_activity_ids);
  end if;

  return new_ws;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. create_project — Supervisor caller may no longer seed Project members at creation time.
--    Every other line is byte-for-byte unchanged from the currently-applied Phase-3 definition
--    (20260924130000). create_client_project is untouched — it forwards p_member_user_ids straight
--    into this function, so this same guard already covers the Team-Lead "new client" flow too.
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
  p_template_id uuid default null, -- deprecated, technical-compatibility only; legacy Project Templates are retired
  p_partner_brand_id uuid default null,
  p_templates jsonb default '[]'
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
  if public.is_supervisor() then
    effective_owner_id := auth.uid();
  elsif public.is_superadmin() then
    effective_owner_id := coalesce(p_owner_id, auth.uid());
  else
    raise exception 'Only an admin or a team lead may create a project.';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Title can''t be empty.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found.';
  end if;
  if not exists (select 1 from public.profiles where id = effective_owner_id and active) then
    raise exception 'Owner not found or inactive.';
  end if;
  if p_project_group_id is not null and not exists (select 1 from public.project_groups where id = p_project_group_id) then
    raise exception 'Project Group not found.';
  end if;
  if p_partner_brand_id is not null and not exists (select 1 from public.brands where id = p_partner_brand_id) then
    raise exception 'Brand not found.';
  end if;
  if p_template_id is not null then
    raise exception 'Legacy Project Templates are no longer supported.';
  end if;

  insert into public.projects (
    company_id, name, owner_id, status, contract_start_date, contract_months, contract_end_date,
    completion_date, start_date, end_date, description, project_group_id, tags, created_by,
    partner_brand_id
  ) values (
    p_company_id, trim(p_name), effective_owner_id, 'active', p_contract_start_date,
    coalesce(p_contract_months, 12), p_contract_end_date, p_completion_date, p_start_date, p_end_date,
    p_description, p_project_group_id, coalesce(p_tags, '{}'), auth.uid(),
    p_partner_brand_id
  )
  returning * into new_project;

  if coalesce(array_length(p_member_user_ids, 1), 0) > 0 then
    -- Phase 3 hardening (CD-208): broader Project staffing is Phase 4's territory. A Team Lead's
    -- Phase-3 creation path must not become a way to assign arbitrary Project members — fail loudly
    -- rather than silently accept or silently drop them, so the caller finds out immediately.
    if not public.is_superadmin() then
      raise exception 'Only an admin may assign Project members at creation time.';
    end if;
    insert into public.project_members (project_id, user_id)
    select new_project.id, u from unnest(p_member_user_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
  end if;

  if jsonb_array_length(coalesce(p_templates, '[]'::jsonb)) > 0 then
    perform public.apply_project_templates(new_project.id, p_templates);
  end if;

  return new_project;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. workstreams_insert RLS — was: is_supervisor() OR is_superadmin() OR (is_employee() AND
--    can_access_project(project_id) AND lead_user_id = auth.uid()) (20260815100000). Replaced with
--    the Phase-3 owner boundary: Superadmin unconditional; Supervisor only for a Project they
--    literally own. Employee direct INSERT is now denied outright (Employee Service creation was
--    already fully retired at the RPC layer by 20260910090000 — this closes the same gap at the
--    direct-table-write layer, which authenticated still had privileges for).
-- ---------------------------------------------------------------------------
drop policy "workstreams_insert" on public.workstreams;

create policy "workstreams_insert" on public.workstreams
  for insert with check (
    public.is_superadmin()
    or (public.is_supervisor() and project_id is not null and public.can_manage_project(project_id))
  );

-- ---------------------------------------------------------------------------
-- 4. workstream_activities_write RLS — was: is_superadmin() OR (is_supervisor() AND
--    manages_user(w.lead_user_id) AND can_access_project(w.project_id)), gated by the existing
--    Project-must-be-Active guard (20260910090000). manages_user+can_access_project is a
--    read-shaped predicate (true for any Project a Supervisor's team owns/belongs to, regardless of
--    who owns it) — replaced with can_manage_project(w.project_id), requiring the Workstream to
--    have a Project the Supervisor literally owns. The Active-lifecycle guard is reused verbatim,
--    unchanged, for both Superadmin and Supervisor.
-- ---------------------------------------------------------------------------
drop policy "workstream_activities_write" on public.workstream_activities;

create policy "workstream_activities_write" on public.workstream_activities
  for all
  using (
    (
      public.is_superadmin()
      or (public.is_supervisor() and exists (
        select 1 from public.workstreams w
        where w.id = workstream_id
          and w.project_id is not null
          and public.can_manage_project(w.project_id)
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
          and w.project_id is not null
          and public.can_manage_project(w.project_id)
      ))
    )
    and not exists (
      select 1 from public.workstreams w
      join public.projects p on p.id = w.project_id
      where w.id = workstream_activities.workstream_id and p.status is distinct from 'active'
    )
  );
