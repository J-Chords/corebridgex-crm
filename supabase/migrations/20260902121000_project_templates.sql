-- Project Level Part 4 — Project Template: a reusable preset that REFERENCES existing Service
-- Line/Activity catalog rows and configures a Project from those references. Never copies/
-- duplicates a Service or Activity definition. Admin-only to write; materialization (Part 4/22/25)
-- reuses the existing canonical create_workstream RPC exactly — never a raw bypass insert, never a
-- fabricated Workstream Lead (the Project's own real owner_id is used).

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_template_services (
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  service_line_id uuid not null references public.service_lines(id) on delete cascade,
  primary key (project_template_id, service_line_id)
);

create table public.project_template_activities (
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  service_line_id uuid not null references public.service_lines(id),
  activity_id uuid not null references public.activities(id) on delete cascade,
  primary key (project_template_id, service_line_id, activity_id),
  -- An activity can only be attached under a Service the same template actually includes.
  foreign key (project_template_id, service_line_id) references public.project_template_services(project_template_id, service_line_id) on delete cascade
);

alter table public.project_templates enable row level security;
alter table public.project_template_services enable row level security;
alter table public.project_template_activities enable row level security;

-- Readable by any active user (needed to populate the optional Template picker on Create Project,
-- same "select-from-a-catalog" shape as service_lines itself); write is Admin-only.
create policy "project_templates_select" on public.project_templates
  for select using (public.is_current_user_active());
create policy "project_templates_write_admin" on public.project_templates
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "project_template_services_select" on public.project_template_services
  for select using (public.is_current_user_active());
create policy "project_template_services_write_admin" on public.project_template_services
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "project_template_activities_select" on public.project_template_activities
  for select using (public.is_current_user_active());
create policy "project_template_activities_write_admin" on public.project_template_activities
  for all using (public.is_superadmin()) with check (public.is_superadmin());

grant select on public.project_templates, public.project_template_services, public.project_template_activities to authenticated;
grant insert, update, delete on public.project_templates, public.project_template_services, public.project_template_activities to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Template management RPCs — Admin-only (re-verified independently, never trusting the client).
-- ---------------------------------------------------------------------------
create or replace function public.create_project_template(p_name text, p_description text)
 returns project_templates
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_template public.project_templates;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can manage Project Templates.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Template name can''t be empty.';
  end if;
  insert into public.project_templates (name, description, created_by)
  values (trim(p_name), p_description, auth.uid())
  returning * into new_template;
  return new_template;
end;
$function$;

create or replace function public.update_project_template(p_template_id uuid, p_name text, p_description text, p_active boolean)
 returns project_templates
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  updated public.project_templates;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can manage Project Templates.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Template name can''t be empty.';
  end if;
  update public.project_templates
  set name = trim(p_name), description = p_description, active = p_active, updated_at = now()
  where id = p_template_id
  returning * into updated;
  if not found then
    raise exception 'Project Template not found.';
  end if;
  return updated;
end;
$function$;

-- Replace-set — the Admin submits the template's full desired Service/Activity configuration each
-- time, same convention as Admin Foundation's Service-staffing RPCs. Activities not belonging to
-- one of the submitted service_line_ids are rejected outright (never silently dropped), so a
-- template can never end up with an orphaned Activity attached to a Service it doesn't include.
create or replace function public.set_project_template_services(p_template_id uuid, p_service_line_ids uuid[])
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
  insert into public.project_template_services (project_template_id, service_line_id)
  select distinct p_template_id, sid from unnest(p_service_line_ids) as sid;
end;
$function$;

create or replace function public.set_project_template_activities(p_template_id uuid, p_service_line_id uuid, p_activity_ids uuid[])
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
    where project_template_id = p_template_id and service_line_id = p_service_line_id
  ) then
    raise exception 'This Template does not include that Service — add the Service first.';
  end if;
  delete from public.project_template_activities
  where project_template_id = p_template_id and service_line_id = p_service_line_id;
  insert into public.project_template_activities (project_template_id, service_line_id, activity_id)
  select distinct p_template_id, p_service_line_id, aid
  from unnest(p_activity_ids) as aid
  where exists (select 1 from public.activities a where a.id = aid);
end;
$function$;

revoke all on function public.create_project_template(text, text) from public, anon;
grant execute on function public.create_project_template(text, text) to authenticated, service_role;
revoke all on function public.update_project_template(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_project_template(uuid, text, text, boolean) to authenticated, service_role;
revoke all on function public.set_project_template_services(uuid, uuid[]) from public, anon;
grant execute on function public.set_project_template_services(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.set_project_template_activities(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_project_template_activities(uuid, uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_project — extended with an optional p_template_id. When given, materializes the
-- template's Services (+ their Activities) onto the new Project using the CURRENT canonical
-- create_workstream RPC (never a raw bypass insert) — the Project's own real owner becomes each
-- materialized Service's lead (never a fabricated one), team stays empty (never invented), status
-- 'active', no dates/recurrence (safe defaults already allowed by the existing Workstream schema).
-- Old 11-arg signature dropped explicitly (a different signature is a new overload, not a replace).
-- ---------------------------------------------------------------------------
drop function if exists public.create_project(uuid, text, uuid, date, integer, date, date, text, uuid, text[], uuid[]);

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
  ts record;
  template_activity_ids uuid[];
  service_line_name text;
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
    for ts in select service_line_id from public.project_template_services where project_template_id = p_template_id loop
      select array_agg(activity_id) into template_activity_ids
      from public.project_template_activities
      where project_template_id = p_template_id and service_line_id = ts.service_line_id;
      select name into service_line_name from public.service_lines where id = ts.service_line_id;
      perform public.create_workstream(
        service_line_name, null, null, new_project.id, ts.service_line_id, effective_owner_id,
        '{}', coalesce(template_activity_ids, '{}'), 'active', null, null, null, null, null, null
      );
    end loop;
  end if;

  return new_project;
end;
$function$;
