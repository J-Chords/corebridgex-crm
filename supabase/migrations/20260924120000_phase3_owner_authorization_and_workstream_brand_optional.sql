-- Phase 3B.A (CD-208) — the ownerId-based Project-management authorization boundary, and relaxing
-- workstreams.brand_id so canonical Template application never requires a Brand.
--
-- Product Owner decision (locked): Project-management authorization for Phase 3 is
--   isSuperadmin(viewer) OR (isSupervisor(viewer) AND project.owner_id = viewer.id)
-- Read visibility (can_access_project — Team Lead sees a Project their reports own/belong to) is
-- explicitly UNCHANGED and stays broader than management — this migration adds a new, narrower
-- predicate alongside it, it does not touch can_access_project itself.

create or replace function public.can_manage_project(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    public.is_superadmin()
    or (
      public.is_supervisor()
      and exists (
        select 1 from public.projects p
        where p.id = target_project_id and p.owner_id = auth.uid()
      )
    );
$$;

comment on function public.can_manage_project(uuid) is
  'Phase 3 (CD-208) Project-management (write) boundary — deliberately narrower than can_access_project (read). Admin always; a Supervisor only when they are literally this Project''s owner_id. Direct-report visibility, project_members rows, projectRole, global Template staffing (service_team_leads/service_employees), and workstream.lead_user_id ("Project Template Lead") all grant no Project-management authority here — see docs/authorization.md.';

revoke all on function public.can_manage_project(uuid) from public, anon;
grant execute on function public.can_manage_project(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- workstreams.brand_id becomes optional — CD-208 section 16 locks "do not require Company.brand_id
-- in order to select/apply canonical Templates." Canonical Template Activities no longer depend on
-- Brand at all (see the companion Phase 3A brand-decoupling migration), so create_workstream's own
-- hard "this client has no Brand set yet" block is removed below. workstreams.brand_id is kept
-- (not dropped) as a still-useful denormalized reference for whatever legacy/Category-B Brand
-- filtering remains elsewhere in the app, sourced now from the owning Project's own
-- partner_brand_id first (falling back to the Company's brand_id, then null) rather than requiring
-- the Company to have one.
-- ---------------------------------------------------------------------------
alter table public.workstreams
  alter column brand_id drop not null;

comment on column public.workstreams.brand_id is
  'Denormalized reference only (Phase 3, CD-208) — sourced from the owning Project''s partner_brand_id at creation time, falling back to the Company''s brand_id, then null. No longer required: canonical Template Activities are Brand-independent, so a Project/Company with no Brand set can still receive Templates.';

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

  -- Phase 3 (CD-208): no longer required. Brand-independent canonical Template application means a
  -- Company/Project with no Brand set can still receive Templates — this now resolves to null
  -- rather than raising, falling back through Project Partner Brand, then Company Brand.
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

  -- Phase 3 (CD-208): true snapshot — freeze each selected Activity's current name/description/
  -- default_task_titles/position into workstream_activities at the moment it's applied, instead of
  -- only storing the join key. See the Phase 3A snapshot-schema migration.
  if coalesce(array_length(p_activity_ids, 1), 0) > 0 then
    insert into public.workstream_activities (workstream_id, activity_id, name, description, default_task_titles, position)
    select new_ws.id, a.id, a.name, a.description, a.default_task_titles, a.position
    from public.activities a
    where a.id = any(p_activity_ids);
  end if;

  return new_ws;
end;
$function$;
