-- Phase 3B (CD-208) — Team Lead Project creation, atomic multi-Template application, and a secure
-- field-level Project update path. Everything here is additive/redefinitional; nothing from the
-- retired System A (project_templates/project_template_services/project_template_activities,
-- p_template_id's real meaning) is revived or repurposed — a brand-new p_templates jsonb parameter
-- is introduced instead, per CD-208's explicit instruction not to overload p_template_id.

-- ---------------------------------------------------------------------------
-- apply_project_templates — atomic multi-Template application, used both by "Add Template" on an
-- existing Project and internally by create_project/create_client_project below (called from
-- within their own transaction, so a Project's initial Templates are exactly as atomic as adding
-- them later). Each element of p_templates: {"serviceLineId": "<uuid>", "activityIds": ["<uuid>",
-- ...] (optional — omitted/null means "every currently-active Activity for this Service Line"),
-- "leadUserId": "<uuid>" (optional — defaults to the caller)}. Reuses create_workstream's own
-- authorization/validation/snapshot logic per element rather than duplicating it — a plpgsql
-- function body is one transaction, so if any element fails, every element already applied in this
-- same call (and, when called from create_project, the new Project row itself) rolls back
-- together. No Template staffing (global Team Leads/Members) is ever copied — create_workstream
-- never reads service_team_leads/service_employees, so neither does this.
-- ---------------------------------------------------------------------------
create or replace function public.apply_project_templates(
  p_project_id uuid,
  p_templates jsonb
)
returns setof public.workstreams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template jsonb;
  v_service_line_id uuid;
  v_activity_ids uuid[];
  v_lead_user_id uuid;
  v_ws public.workstreams;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to add a Template to this project.';
  end if;

  for v_template in select * from jsonb_array_elements(coalesce(p_templates, '[]'::jsonb))
  loop
    v_service_line_id := (v_template->>'serviceLineId')::uuid;
    if v_service_line_id is null then
      raise exception 'Each Template application requires a serviceLineId.';
    end if;
    if not exists (select 1 from public.service_lines where id = v_service_line_id and is_active) then
      raise exception 'Template is not active or not found.';
    end if;

    v_lead_user_id := coalesce(nullif(v_template->>'leadUserId', '')::uuid, auth.uid());

    if v_template ? 'activityIds' and jsonb_typeof(v_template->'activityIds') = 'array' then
      select coalesce(array_agg(value::uuid), '{}') into v_activity_ids
      from jsonb_array_elements_text(v_template->'activityIds');
    else
      -- No explicit selection: canonical Template application copies the CURRENT ACTIVE Activity
      -- structure in full (CD-208 section 9) — never gated by Partner Brand (the companion
      -- brand-decoupling migration makes the canonical Department for this Service Line
      -- Brand-independent).
      select coalesce(array_agg(a.id), '{}') into v_activity_ids
      from public.activities a
      join public.departments d on d.id = a.department_id
      where d.service_line_id = v_service_line_id and d.brand_id is null and a.is_active;
    end if;

    v_ws := public.create_workstream(
      (select name from public.service_lines where id = v_service_line_id),
      null,
      null,
      p_project_id,
      v_service_line_id,
      v_lead_user_id,
      '{}'::uuid[],
      v_activity_ids,
      'active',
      null, null, null, null, null, null
    );
    return next v_ws;
  end loop;
  return;
end;
$$;

revoke all on function public.apply_project_templates(uuid, jsonb) from public, anon;
grant execute on function public.apply_project_templates(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_project — extended (additive parameters only, existing 14-arg positional/named callers
-- keep working unchanged) with p_partner_brand_id (Project-specific Partner Brand, CD-208 section
-- 14) and p_templates (canonical Template application at creation time, atomic with the Project
-- row itself — see apply_project_templates above). Authorization widened from Superadmin-only to
-- Superadmin-or-Supervisor: a Supervisor caller is FORCED to become owner_id (their own auth.uid()
-- — any client-supplied p_owner_id is silently ignored for a Supervisor caller, never trusted, per
-- CD-208's explicit "Team Lead must not be allowed to select another Owner during creation").
-- Admin behavior is fully unchanged (may still choose any owner). p_template_id's already-retired
-- (CD-205) behavior is untouched.
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
    -- Phase 3 (CD-208): Team Lead creation. Owner is always the creating Team Lead themselves —
    -- never client-supplied, never chosen. This is the Phase-3 bridge to the future Phase-4
    -- staffing architecture, not a new Primary-Team-Lead model.
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
-- create_client_project — same additive treatment (p_partner_brand_id defaults to the newly-created
-- Company's own p_brand_id when the caller doesn't specify one distinctly, p_templates forwarded
-- straight through to create_project, which applies them atomically after the Project row exists).
-- Authorization: forwards to create_project's own check (Superadmin or Supervisor); this function's
-- OWN superadmin-only guard is relaxed to match, so a Supervisor creating a brand-new Company +
-- Project (the "New Client" flow) works exactly like the existing-Company path.
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
  p_template_id uuid default null,
  p_partner_brand_id uuid default null,
  p_templates jsonb default '[]'
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company public.companies;
  new_project public.projects;
  new_contact_id uuid;
begin
  if not (public.is_superadmin() or public.is_supervisor()) then
    raise exception 'Only an admin or a team lead may create a project.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Title can''t be empty.';
  end if;
  if p_brand_id is not null and not exists (select 1 from public.brands where id = p_brand_id) then
    raise exception 'Brand not found.';
  end if;

  insert into public.companies (name, status, brand_id, contract_start_date, renewal_date)
  values (trim(p_name), 'prospect', p_brand_id, p_contract_start_date, p_renewal_date)
  returning * into new_company;

  if p_contact_name is not null and length(trim(p_contact_name)) > 0 then
    insert into public.client_contacts (company_id, name, email, phone, is_primary)
    values (new_company.id, trim(p_contact_name), p_contact_email, p_contact_phone, true)
    returning id into new_contact_id;
    update public.companies set primary_contact_id = new_contact_id where id = new_company.id;
  end if;

  new_project := public.create_project(
    new_company.id, p_name, p_owner_id, p_contract_start_date, 12, p_renewal_date,
    p_completion_date, p_start_date, p_end_date, p_description, p_project_group_id,
    p_tags, p_member_user_ids, p_template_id,
    coalesce(p_partner_brand_id, p_brand_id), p_templates
  );

  return new_project;
end;
$$;

revoke all on function public.create_project(uuid, text, uuid, date, integer, date, date, date, date, text, uuid, text[], uuid[], uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_project(uuid, text, uuid, date, integer, date, date, date, date, text, uuid, text[], uuid[], uuid, uuid, jsonb) to authenticated, service_role;
revoke all on function public.create_client_project(text, uuid, date, date, text, text, text, uuid, date, date, date, text, uuid, text[], uuid[], uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_client_project(text, uuid, date, date, text, text, text, uuid, date, date, date, text, uuid, text[], uuid[], uuid, uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- update_project_record — the new secure, field-level Project update path (CD-208 section 27). The
-- existing direct Supabase `.update()` on `projects` remains Superadmin-only at the RLS layer
-- (projects_update policy, unchanged — see the companion RLS note below) and is NOT opened up to
-- Supervisor; instead a Supervisor-owner's edit goes through this RPC, which enforces field-level
-- protection server-side regardless of what the client sends: Project/Client Name, Partner Brand,
-- and Owner are silently ignored (kept at their current value) for a Supervisor caller, no matter
-- what the client passes for p_name/p_partner_brand_id/p_owner_id — the backend is the actual
-- boundary, not a disabled input. An Admin caller may change every field, matching current
-- behavior. member sync intentionally excluded from this RPC (CD-208 section 29 — Team Lead must
-- not gain new Member-staffing rights in Phase 3; Admin's existing member-sync path is untouched
-- and stays on the direct client-side updateProject/syncProjectMembers flow, Superadmin-only per
-- existing RLS).
-- ---------------------------------------------------------------------------
create or replace function public.update_project_record(
  p_project_id uuid,
  p_name text,
  p_owner_id uuid,
  p_contract_start_date date,
  p_contract_months integer,
  p_contract_end_date date,
  p_description text,
  p_project_group_id uuid,
  p_tags text[],
  p_partner_brand_id uuid
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_row public.projects;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to edit this project.';
  end if;

  v_is_admin := public.is_superadmin();

  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found.';
  end if;
  if p_project_group_id is not null and not exists (select 1 from public.project_groups where id = p_project_group_id) then
    raise exception 'Project Group not found.';
  end if;

  update public.projects p set
    name = case when v_is_admin then trim(coalesce(nullif(p_name, ''), p.name)) else p.name end,
    owner_id = case when v_is_admin then coalesce(p_owner_id, p.owner_id) else p.owner_id end,
    partner_brand_id = case when v_is_admin then p_partner_brand_id else p.partner_brand_id end,
    contract_start_date = p_contract_start_date,
    contract_months = coalesce(p_contract_months, p.contract_months),
    contract_end_date = p_contract_end_date,
    description = p_description,
    project_group_id = p_project_group_id,
    tags = coalesce(p_tags, p.tags),
    updated_at = now()
  where p.id = p_project_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_project_record(uuid, text, uuid, date, integer, date, text, uuid, text[], uuid) from public, anon;
grant execute on function public.update_project_record(uuid, text, uuid, date, integer, date, text, uuid, text[], uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_project_group — narrow RPC so a Supervisor can create a Project Group without opening the
-- direct-table RLS write policy to non-Admins (CD-208 section 30). The existing direct-table insert
-- (Admin-only via project_groups_write_admin RLS) remains exactly as-is for Admin; a Supervisor
-- caller now goes through this function instead, which is Admin-or-Supervisor gated and does its
-- own case-insensitive duplicate check (mirroring the mock provider's existing behavior) since the
-- table's plain `unique` constraint on `name` is case-sensitive.
-- ---------------------------------------------------------------------------
create or replace function public.create_project_group(p_name text)
returns public.project_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_row public.project_groups;
begin
  if not (public.is_superadmin() or public.is_supervisor()) then
    raise exception 'Only an admin or a team lead may create a Project Group.';
  end if;

  v_name := btrim(p_name);
  if v_name = '' then
    raise exception 'Project Group name can''t be empty.';
  end if;
  if exists (select 1 from public.project_groups where lower(name) = lower(v_name)) then
    raise exception 'A Project Group named "%" already exists.', v_name;
  end if;

  insert into public.project_groups (name) values (v_name) returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.create_project_group(text) from public, anon;
grant execute on function public.create_project_group(text) to authenticated, service_role;
