-- Activity Level, Sections 8, 14-15 — Admin-only global Activity lifecycle: edit (name/description/
-- Suggested Tasks), active/inactive, and safe delete. Mirrors the exact pattern already established
-- for `service_lines` in 20260904110000_service_catalog.sql. Per Section 15, deliberately does NOT
-- grant `authenticated` any direct INSERT/UPDATE/DELETE on `activities`/`departments` — these two
-- tables keep their existing select-only grant/RLS; every write continues to route exclusively
-- through a SECURITY DEFINER RPC (matching how `activities`/`departments` already worked before this
-- migration, unlike the `service_lines` precedent's own defense-in-depth RLS).

create or replace function public.admin_update_activity(
  p_id uuid,
  p_name text,
  p_description text,
  p_default_task_titles text[]
)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_department_id uuid;
  v_row public.activities;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can edit an Activity.';
  end if;

  select department_id into v_department_id from public.activities where id = p_id;
  if v_department_id is null then
    raise exception 'Activity not found.';
  end if;

  v_name := btrim(p_name);
  if v_name = '' then
    raise exception 'Activity name is required.';
  end if;
  if exists (
    select 1 from public.activities
    where department_id = v_department_id and lower(btrim(name)) = lower(v_name) and id <> p_id
  ) then
    raise exception 'An Activity named "%" already exists for this Service.', v_name;
  end if;

  update public.activities
  set name = v_name,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      default_task_titles = coalesce(p_default_task_titles, '{}'),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.admin_set_activity_active(p_id uuid, p_is_active boolean)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.activities;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can activate or deactivate an Activity.';
  end if;

  update public.activities
  set is_active = p_is_active,
      updated_at = now()
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Activity not found.';
  end if;

  return v_row;
end;
$$;

-- Explicitly proves zero references across every table that can point at an Activity before
-- deleting, rather than relying on FK failure alone — two of the four referencing tables
-- (workstream_activities, project_template_activities) are ON DELETE CASCADE and would otherwise
-- silently destroy that history instead of blocking the delete.
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
    or exists (select 1 from public.project_template_activities where activity_id = p_id)
  then
    raise exception 'This Activity has historical usage and cannot be deleted — deactivate it instead.';
  end if;

  delete from public.activities where id = p_id;
end;
$$;

-- Race-safety update (Section 17) — both existing find-or-create RPCs previously did a plain
-- "select ... limit 1; if not found then insert" with no protection against two concurrent callers
-- racing to create the same-named Activity in the same Department. Now that
-- activities_department_name_unique_idx exists, that race would surface as a raw unique-violation
-- error instead of the intended "reuse the existing one" behavior — closed here with
-- ON CONFLICT DO NOTHING + a FOUND-guarded re-select of whichever row actually won.
create or replace function public.create_activity_for_workstream(
  p_workstream_id uuid,
  p_name text
)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws public.workstreams;
  v_name text;
  v_department_id uuid;
  v_service_line_name text;
  v_activity public.activities;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if not public.is_superadmin() then
    raise exception 'Only an admin can create a new Activity — pick an existing one instead.';
  end if;

  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;

  if ws.service_line_id is null then
    raise exception 'This service has no service line — an activity can''t be created for it.';
  end if;

  v_name := btrim(p_name);
  if v_name = '' then
    raise exception 'Activity name is required.';
  end if;

  select id into v_department_id
  from public.departments
  where brand_id = ws.brand_id and service_line_id = ws.service_line_id
  limit 1;

  if v_department_id is null then
    select name into v_service_line_name from public.service_lines where id = ws.service_line_id;
    insert into public.departments (brand_id, name, service_line_id, position)
    values (ws.brand_id, coalesce(v_service_line_name, 'General'), ws.service_line_id, 0)
    on conflict (brand_id, service_line_id) where service_line_id is not null do nothing
    returning id into v_department_id;
    if not found then
      select id into v_department_id
      from public.departments
      where brand_id = ws.brand_id and service_line_id = ws.service_line_id
      limit 1;
    end if;
  end if;

  select * into v_activity
  from public.activities
  where department_id = v_department_id and lower(btrim(name)) = lower(v_name)
  limit 1;

  if not found then
    insert into public.activities (department_id, name, position)
    select v_department_id, v_name, coalesce(max(position), -1) + 1
    from public.activities where department_id = v_department_id
    on conflict (department_id, lower(btrim(name))) do nothing
    returning * into v_activity;
    if not found then
      select * into v_activity
      from public.activities
      where department_id = v_department_id and lower(btrim(name)) = lower(v_name);
    end if;
  end if;

  insert into public.workstream_activities (workstream_id, activity_id)
  values (p_workstream_id, v_activity.id)
  on conflict do nothing;

  return v_activity;
end;
$$;

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
    on conflict (brand_id, service_line_id) where service_line_id is not null do nothing
    returning id into v_department_id;
    if not found then
      select id into v_department_id
      from public.departments
      where brand_id = p_brand_id and service_line_id = p_service_line_id
      limit 1;
    end if;
  end if;

  select * into v_activity
  from public.activities
  where department_id = v_department_id and lower(btrim(name)) = lower(v_name)
  limit 1;

  if not found then
    insert into public.activities (department_id, name, position)
    select v_department_id, v_name, coalesce(max(position), -1) + 1
    from public.activities where department_id = v_department_id
    on conflict (department_id, lower(btrim(name))) do nothing
    returning * into v_activity;
    if not found then
      select * into v_activity
      from public.activities
      where department_id = v_department_id and lower(btrim(name)) = lower(v_name);
    end if;
  end if;

  return v_activity;
end;
$$;

revoke all on function public.admin_update_activity(uuid, text, text, text[]) from public, anon;
revoke all on function public.admin_set_activity_active(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_activity(uuid) from public, anon;
grant execute on function public.admin_update_activity(uuid, text, text, text[]) to authenticated, service_role;
grant execute on function public.admin_set_activity_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_activity(uuid) to authenticated, service_role;
