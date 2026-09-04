-- Service Level Phase B, Section 9 — Global Service/Activity ownership is Admin-only.
--
-- `create_activity_for_workstream` mints a brand-new GLOBAL Activity catalog row (find-or-create
-- Department, find-or-create Activity), authorized today by `can_access_workstream` — which any
-- Employee-as-lead or Supervisor-in-scope satisfies. That conflicts with the locked V1 rule that
-- Team Lead/Employee may SELECT/CONFIGURE existing catalog Activities onto a Project Service but
-- must never CREATE a new global Activity definition themselves. Narrowed to Superadmin only.
--
-- Note: this RPC is not currently reachable from any shipped UI (the one component that called it,
-- CreateActivityDialog, was never wired into a real page) — this is a defense-in-depth lockdown of a
-- latent path, not a fix for an actively-exploited one, so no user-facing behavior changes today.

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

  insert into public.workstream_activities (workstream_id, activity_id)
  values (p_workstream_id, v_activity.id)
  on conflict do nothing;

  return v_activity;
end;
$$;
