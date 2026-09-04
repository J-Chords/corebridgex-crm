-- Service Level Phase B, Sections 10-13 — converts `service_lines` from a bare, migration-only
-- reference table into a real Admin-managed global Service catalog: description, active/inactive,
-- and a truthful Created By. Forward-only extension of `service_lines` (20260813130858_reference_
-- data.sql) — that table's own ids/rows/relationships to workstreams/templates/departments are
-- completely untouched.
--
-- created_by is nullable specifically for the 8 pre-existing seeded rows, which predate this column
-- and have no true creator to record — left null rather than fabricated; the UI shows a truthful
-- "legacy — creator not recorded" state for those. created_at/updated_at default to now() for those
-- same legacy rows purely because no earlier timestamp exists to backfill from — they reflect when
-- tracking began, not each Service's true original creation date. Every new Service created through
-- `admin_create_service_line` from here on gets a real created_by/created_at.

alter table public.service_lines
  add column description text null,
  add column is_active boolean not null default true,
  add column created_by uuid null references public.profiles (id),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

-- Defense-in-depth RLS to match the RPCs below (which run SECURITY DEFINER and don't strictly need
-- these to function, but every other admin-managed table in this app carries matching policies too).
-- Read stays ungated (`service_lines_select_all`, unchanged) — filtering to active-only for ordinary
-- pickers is a query-shape concern (`listServiceLines`), not a visibility rule.
create policy "service_lines_insert_admin" on public.service_lines
  for insert with check (public.is_superadmin());

create policy "service_lines_update_admin" on public.service_lines
  for update using (public.is_superadmin()) with check (public.is_superadmin());

create policy "service_lines_delete_admin" on public.service_lines
  for delete using (public.is_superadmin());

grant insert, update, delete on public.service_lines to authenticated;

create or replace function public.admin_create_service_line(p_name text, p_description text)
returns public.service_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_row public.service_lines;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can create a Service.';
  end if;

  v_name := btrim(p_name);
  if v_name = '' then
    raise exception 'Service name is required.';
  end if;
  if exists (select 1 from public.service_lines where lower(name) = lower(v_name)) then
    raise exception 'A Service named "%" already exists.', v_name;
  end if;

  insert into public.service_lines (name, description, is_active, created_by)
  values (v_name, nullif(btrim(coalesce(p_description, '')), ''), true, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.admin_update_service_line(p_id uuid, p_name text, p_description text)
returns public.service_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_row public.service_lines;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can edit a Service.';
  end if;

  v_name := btrim(p_name);
  if v_name = '' then
    raise exception 'Service name is required.';
  end if;
  if exists (select 1 from public.service_lines where lower(name) = lower(v_name) and id <> p_id) then
    raise exception 'A Service named "%" already exists.', v_name;
  end if;

  update public.service_lines
  set name = v_name,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Service not found.';
  end if;

  return v_row;
end;
$$;

create or replace function public.admin_set_service_line_active(p_id uuid, p_is_active boolean)
returns public.service_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.service_lines;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can activate or deactivate a Service.';
  end if;

  update public.service_lines
  set is_active = p_is_active,
      updated_at = now()
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Service not found.';
  end if;

  return v_row;
end;
$$;

-- Hard-deletes only when truly unused anywhere (Postgres itself proves this — every referencing FK
-- across workstreams/templates/departments/service_team_leads/service_employees/company_service_lines
-- is default RESTRICT, so the DELETE simply fails with foreign_key_violation the moment any historical
-- usage exists). Deliberately does NOT silently fall back to deactivating — the admin asked to delete;
-- if that's unsafe, they're told exactly why and can choose to deactivate instead.
create or replace function public.admin_delete_service_line(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can delete a Service.';
  end if;

  begin
    delete from public.service_lines where id = p_id;
  exception when foreign_key_violation then
    raise exception 'This Service has historical usage (Projects, Templates, Activities, or staffing) and can''t be deleted — deactivate it instead.';
  end;

  if not found then
    raise exception 'Service not found.';
  end if;
end;
$$;

-- Admin catalog analogue of create_activity_for_workstream (20260828090000, now Superadmin-only) —
-- lets an Admin add a new global Activity to a Service Line for a given Brand without needing an
-- existing Workstream in that (brand, service line) pair to hang it off of. Same find-or-create
-- Department + case-insensitive-dedup Activity logic, reused rather than duplicated.
create or replace function public.admin_create_activity_for_service_line(
  p_service_line_id uuid,
  p_brand_id uuid,
  p_name text
)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_department_id uuid;
  v_service_line_name text;
  v_activity public.activities;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can create a new Activity.';
  end if;

  if not exists (select 1 from public.service_lines where id = p_service_line_id) then
    raise exception 'Service not found.';
  end if;
  if not exists (select 1 from public.brands where id = p_brand_id) then
    raise exception 'Brand not found.';
  end if;

  v_name := btrim(p_name);
  if v_name = '' then
    raise exception 'Activity name is required.';
  end if;

  select id into v_department_id
  from public.departments
  where brand_id = p_brand_id and service_line_id = p_service_line_id
  limit 1;

  if v_department_id is null then
    select name into v_service_line_name from public.service_lines where id = p_service_line_id;
    insert into public.departments (brand_id, name, service_line_id, position)
    values (p_brand_id, coalesce(v_service_line_name, 'General'), p_service_line_id, 0)
    returning id into v_department_id;
  end if;

  select * into v_activity
  from public.activities
  where department_id = v_department_id and lower(btrim(name)) = lower(v_name)
  limit 1;

  if not found then
    insert into public.activities (department_id, name, position)
    select v_department_id, v_name, coalesce(max(position), -1) + 1
    from public.activities where department_id = v_department_id
    returning * into v_activity;
  end if;

  return v_activity;
end;
$$;

revoke all on function public.admin_create_service_line(text, text) from public, anon;
revoke all on function public.admin_update_service_line(uuid, text, text) from public, anon;
revoke all on function public.admin_set_service_line_active(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_service_line(uuid) from public, anon;
revoke all on function public.admin_create_activity_for_service_line(uuid, uuid, text) from public, anon;
grant execute on function public.admin_create_service_line(text, text) to authenticated, service_role;
grant execute on function public.admin_update_service_line(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_set_service_line_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_service_line(uuid) to authenticated, service_role;
grant execute on function public.admin_create_activity_for_service_line(uuid, uuid, text) to authenticated, service_role;
