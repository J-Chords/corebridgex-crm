-- Phase 13B final boss-feedback pass — lets an authorized user create a genuinely NEW, reusable
-- Activity Catalog entry directly from Task creation when no suitable Activity exists yet for the
-- current Service, instead of stopping the workflow. `departments`/`activities` are select-only for
-- `authenticated` (20260814090001_activity_catalog.sql) — there is no existing safe path for a
-- non-service_role caller to insert either row directly, and `workstream_activities_write` is
-- Employee/Supervisor/Superadmin-scoped but only ever associates an EXISTING Activity id, never
-- creates a new one. This migration adds exactly one narrow SECURITY DEFINER RPC for that gap —
-- table RLS/grants on departments/activities/workstream_activities are otherwise untouched.
--
-- Pre-apply correction (Correction 1): the first version of this RPC gated Employee access on
-- `ws.lead_user_id = auth.uid()` — mirroring create_task's OWN contextual "extend this Service's
-- Activity set" branch (`may_extend_activities`, 20260818090000_task_activity_extension.sql), but
-- that branch answers a narrower question ("may this caller silently enable an Activity as a side
-- effect of the Task they're creating") than the one this RPC actually needs answered ("may this
-- caller create a Task in this Workstream at all"). Audited create_task's real, exact Task-creation
-- boundary instead: `if not public.can_access_workstream(p_workstream_id) then raise exception...`
-- (20260814090000_workstreams.sql, last redefined by 20260814100000_hotfix_workstream_task_
-- visibility.sql). That function's Employee-relevant branches are (a) `manages_user(w.lead_user_id)`
-- — true for the Workstream's own lead via manages_user's self-check — and, critically, (b) a
-- separate `workstream_members` branch — true for ANY workstream_members row naming the caller,
-- lead or not. A normal Employee *member* (not lead) of a Workstream can already create a normal
-- Task there today; requiring Workstream-lead for this RPC would have been stricter than that real,
-- already-shipped boundary, exactly the gap the boss feedback identified (Alicia, a legitimate
-- IT/Digital member but not its lead). Fixed by calling `public.can_access_workstream(p_workstream_id)`
-- directly — the literal same function `create_task` itself uses — rather than re-deriving a
-- parallel (and, it turned out, narrower) approximation of it. This can never drift from the real
-- Task-creation boundary again: if that boundary is ever widened or narrowed, this RPC moves with
-- it automatically. Superadmin (unconditional) and Supervisor (their own already-accessible
-- Workstreams, via manages_user on the lead or any member) are unaffected — neither role's scope
-- changes; only the Employee non-lead-member case is newly included, and only up to the exact same
-- scope create_task itself already grants them.
--
-- Department resolution: every existing Department maps 1:1 to one (brand, service_line) pair by
-- convention (see seed-departments.ts's own comment) — several brands currently have zero
-- Departments at all. This RPC finds the Workstream's own matching Department or creates exactly
-- one (named after the service line, matching that same convention) rather than exposing Department
-- as a user-facing field or silently inventing an unrelated default.
--
-- Duplicate handling: reuses an existing Activity in the resolved Department whose name matches
-- case-insensitively (lower(name) = lower(p_name)) rather than inserting a duplicate — the same
-- comparison 20260817110000_expand_activity_catalog.sql's own catalog-seeding already used.
--
-- Still does not touch Project/Workstream membership, Task assignment rules, or any Company/
-- Contacts data, and grants no organization-wide Activity-catalog administration to any role — the
-- Activity/Department rows this RPC can create or read are always scoped to exactly the one
-- Workstream the (already-authorized) caller named, never a broader catalog-management surface.

create function public.create_activity_for_workstream(
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

  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;

  -- The exact same boundary create_task itself uses to decide "may this caller create a Task in
  -- this Workstream" — see this migration's own header comment for why extending Activities uses
  -- the identical gate rather than a narrower lead-only approximation.
  if not public.can_access_workstream(p_workstream_id) then
    raise exception 'You do not have permission to add an activity to this service.';
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

revoke all on function public.create_activity_for_workstream(uuid, text) from public;
revoke all on function public.create_activity_for_workstream(uuid, text) from anon;
grant execute on function public.create_activity_for_workstream(uuid, text) to authenticated, service_role;
