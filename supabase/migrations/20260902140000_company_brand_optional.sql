-- Product decision (locked) — Brand becomes OPTIONAL for a Company. Audited first (per this
-- migration's own author): Brand is never read by any RLS policy or permission helper anywhere in
-- this schema — it is purely descriptive/display + Activity-Catalog-scoping data. Only
-- `companies.brand_id` is loosened here; `workstreams.brand_id`/`departments.brand_id`/
-- `client_reports.brand_id` all stay NOT NULL — those represent real delivered work or catalog
-- structure that must always resolve to a real partner brand.
alter table public.companies alter column brand_id drop not null;

-- Hardening — create_workstream/apply_template previously only checked "does a companies row
-- exist" (select brand_id into ...; if not found), which was blind to "row exists but brand_id is
-- null" because that used to be structurally impossible. Corrected to the same safer two-step
-- pattern the Client Report RPCs already use elsewhere in this schema: check company existence,
-- THEN check the resolved brand_id is non-null, with an honest, specific message for each — never
-- a raw NOT NULL constraint violation surfacing from the later `insert into workstreams`.
create or replace function public.create_workstream(p_name text, p_description text, p_company_id uuid, p_project_id uuid, p_service_line_id uuid, p_lead_user_id uuid, p_team_user_ids uuid[], p_activity_ids uuid[], p_status text, p_start_date date, p_end_date date, p_recurrence_frequency text, p_recurrence_anchor_date date, p_recurrence_custom_interval_days integer, p_previous_occurrence_workstream_id uuid)
 RETURNS workstreams
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  company_brand_id uuid;
  effective_company_id uuid;
  effective_lead_id uuid;
  effective_team_ids uuid[];
  new_ws public.workstreams;
  project_company_id uuid;
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

  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company % not found.', p_company_id;
  end if;
  select brand_id into company_brand_id from public.companies where id = p_company_id;
  if company_brand_id is null then
    raise exception 'This client has no Brand set yet — add a Brand to this client before applying a Template.';
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
-- create_client_project — the ONE atomic "new client + new Project" entry point (Section 18).
-- A single plpgsql function body is one transaction: if anything after the companies insert
-- raises, the whole function aborts and that insert rolls back with it — no orphan Company, no
-- parallel provider/transaction architecture needed. Delegates the actual Project row (and any
-- Template materialization) entirely to the EXISTING create_project — never a second copy of that
-- logic. Company gets the same safe status default ('prospect') the existing Admin Company-create
-- form already uses; Brand/contact/contract fields are all genuinely optional.
-- ---------------------------------------------------------------------------
create or replace function public.create_client_project(
  p_name text,
  p_brand_id uuid default null,
  p_contract_start_date date default null,
  p_renewal_date date default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_owner_id uuid default null,
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
  new_company_id uuid;
  new_contact_id uuid;
  new_project public.projects;
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin may create a project.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Title can''t be empty.';
  end if;
  if p_brand_id is not null and not exists (select 1 from public.brands where id = p_brand_id) then
    raise exception 'Brand not found.';
  end if;

  insert into public.companies (name, status, brand_id, contract_start_date, renewal_date)
  values (trim(p_name), 'prospect', p_brand_id, p_contract_start_date, p_renewal_date)
  returning id into new_company_id;

  if length(trim(coalesce(p_contact_name, ''))) > 0 then
    insert into public.client_contacts (company_id, name, email, phone, is_primary)
    values (
      new_company_id, trim(p_contact_name),
      nullif(trim(coalesce(p_contact_email, '')), ''),
      nullif(trim(coalesce(p_contact_phone, '')), ''),
      true
    )
    returning id into new_contact_id;
    update public.companies set primary_contact_id = new_contact_id where id = new_company_id;
  end if;

  new_project := public.create_project(
    new_company_id, p_name, p_owner_id, p_contract_start_date, 12, p_renewal_date, p_completion_date,
    p_start_date, p_end_date, p_description, p_project_group_id, p_tags,
    p_member_user_ids, p_template_id
  );

  return new_project;
end;
$function$;

revoke all on function public.create_client_project(text, uuid, date, date, text, text, text, uuid, date, date, date, text, uuid, text[], uuid[], uuid) from public, anon;
grant execute on function public.create_client_project(text, uuid, date, date, text, text, text, uuid, date, date, date, text, uuid, text[], uuid[], uuid) to authenticated, service_role;
