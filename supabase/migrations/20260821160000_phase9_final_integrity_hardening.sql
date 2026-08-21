-- Phase 9 final integrity hotfix — closes four concrete issues found on review before manual
-- acceptance, plus canonicalizes one already-applied live fix. Forward-only; does NOT edit
-- 20260821120000_reporting_review_capability.sql, 20260821130000_visit_entries.sql,
-- 20260821140000_visit_reporting_integration.sql, or 20260821150000_client_report_schedules.sql.
--
-- 1. Visit/Time anti-double-counting becomes genuinely bidirectional: every Time Entry write path
--    (start/stop/pause/resume/manual) now rejects a conflict with an existing Visit, not just the
--    Visit-creation path rejecting a conflict with existing Time Entries.
-- 2. A running Time Entry is treated as OPEN-ENDED (never "ends now") when checked against a
--    proposed Visit — a running 09:00 timer that later continues through 10:30 can never be
--    silently invalidated by a 10:00 Visit that was allowed to exist beside it.
-- 3. The two overlap helpers become genuinely internal: direct EXECUTE is revoked from
--    `authenticated` (already revoked from public/anon) — an ordinary browser session has no
--    legitimate reason to call a cross-user boolean activity oracle directly; the outer Visit/Time
--    RPCs keep working because SECURITY DEFINER functions execute nested calls as their OWNER, not
--    as the original caller, so revoking `authenticated`'s own direct grant never affects them.
-- 4. `create_client_report_schedule` no longer requires ordinary `can_access_project()` — reporting
--    review/scheduling is an orthogonal, organization-wide Client Reporting capability, not
--    operational Project access; it now requires `has_reporting_review_access()` plus "this is a
--    real, non-internal Client Project," nothing more. A narrow `list_client_report_schedule_projects()`
--    directory (capability-gated, non-internal Projects only, no Task/Time/member data) supplies the
--    Schedules UI's Project picker so it never needs `useProjects()`'s operationally-scoped list.
-- 5. `run_one_client_report_schedule` is canonically re-asserted here via `create or replace`, using
--    the exact corrected body already verified live against hosted Supabase — 20260821150000 itself
--    is left untouched; this is the forward-only record of that correction.

-- ---------------------------------------------------------------------------
-- B/C/D — Visit/Time overlap helpers, now bidirectional and running-timer-open-ended.
-- ---------------------------------------------------------------------------

-- visit_entry_overlaps — additive `create or replace`, same signature. The ONLY behavior change:
-- a running Time Entry (`end_time is null`) is now treated as open-ended into the future
-- (`'infinity'`) rather than as ending "now" — a Visit can no longer be created beside a running
-- timer that might later grow into it.
create or replace function public.visit_entry_overlaps(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_visit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.visit_entries v
      where v.user_id = p_user_id
        and (p_exclude_visit_id is null or v.id <> p_exclude_visit_id)
        and tstzrange(v.start_at, v.end_at) && tstzrange(p_start, p_end)
    )
    or exists (
      select 1 from public.time_entries te
      where te.user_id = p_user_id
        and tstzrange(te.start_time, coalesce(te.end_time, 'infinity'::timestamptz)) && tstzrange(p_start, p_end)
    );
$$;

-- time_interval_overlaps_visit — the reciprocal helper: does a proposed (or about-to-be-finalized)
-- Time interval for this user overlap any of their Visit Entries? Visits always have a real,
-- already-finalized end, so there is no open-ended concern on this side. `p_start = p_end` performs
-- a point-in-time check (used before starting/resuming a timer: "is right now inside a Visit?"),
-- via an inclusive-both-ends single-point range; otherwise the normal half-open interval applies.
create function public.time_interval_overlaps_visit(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.visit_entries v
    where v.user_id = p_user_id
      and tstzrange(v.start_at, v.end_at) && tstzrange(p_start, p_end, case when p_start = p_end then '[]' else '[)' end)
  );
$$;

-- Both helpers are INTERNAL infrastructure — never PUBLIC/anon, and never `authenticated` either
-- (Section D/N): an ordinary browser session has no legitimate reason to ask "does user X have a
-- Visit/Time conflict right now," which would otherwise be a cross-user activity oracle. The outer
-- create/update Visit RPCs and the Time Entry RPCs below all call these internally as their own
-- SECURITY DEFINER owner — a nested call's privilege check runs as the function OWNER, never as the
-- original caller, so this revoke cannot break them.
revoke execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.time_interval_overlaps_visit(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.time_interval_overlaps_visit(uuid, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- B/C/E — Time Entry RPCs, hardened with the reciprocal Visit-overlap check. Every previously
-- accepted behavior (one running timer per user, auto-pause-prior, Todo -> In Progress, pause/
-- resume chaining, billable derivation, assignment/access checks, manual time, correction audit)
-- is preserved byte-for-byte except for the new checks below, which run BEFORE any mutation so a
-- rejected call never partially pauses one timer and then fails to start/resume the next.
-- ---------------------------------------------------------------------------

create or replace function public.start_timer(target_task_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_entry public.time_entries;
  target_company_id uuid;
  target_status text;
  internal_company_id uuid;
  running public.time_entries;
  start_ts timestamptz;
begin
  if not public.can_access_task(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  if not public.can_log_time_on_task(target_task_id) then
    raise exception 'You don''t have permission to log time on this task.';
  end if;

  select company_id, status into target_company_id, target_status from public.tasks where id = target_task_id;
  select id into internal_company_id from public.companies where is_internal limit 1;

  start_ts := now();
  if public.time_interval_overlaps_visit(auth.uid(), start_ts, start_ts) then
    raise exception 'You have a Visit logged for this time — pause/stop it or adjust the Visit before starting a timer.';
  end if;

  select * into running from public.time_entries where user_id = auth.uid() and duration_minutes is null;
  if found and public.time_interval_overlaps_visit(auth.uid(), running.start_time, start_ts) then
    raise exception 'Your running timer overlaps a logged Visit — resolve the conflict before starting a new one.';
  end if;

  if found then
    update public.time_entries
    set end_time = start_ts,
        duration_minutes = greatest(1, round(extract(epoch from (start_ts - running.start_time)) / 60)::int),
        paused_for_resume = true
    where id = running.id;
  end if;

  insert into public.time_entries (task_id, user_id, start_time, billable)
  values (target_task_id, auth.uid(), start_ts, target_company_id is distinct from internal_company_id)
  returning * into new_entry;

  if target_status = 'todo' then
    perform public.update_task_status(target_task_id, 'in-progress');
  end if;

  return new_entry;
end;
$$;

create or replace function public.stop_timer(target_entry_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.time_entries;
  updated public.time_entries;
  stop_ts timestamptz;
begin
  select * into entry from public.time_entries where id = target_entry_id;
  if not found then raise exception 'Time entry not found.'; end if;
  if entry.user_id <> auth.uid() then raise exception 'You can only stop your own timer.'; end if;
  if entry.duration_minutes is not null then raise exception 'This timer isn''t running.'; end if;

  stop_ts := now();
  if public.time_interval_overlaps_visit(entry.user_id, entry.start_time, stop_ts) then
    raise exception 'This timer''s interval overlaps a logged Visit — resolve the Visit conflict before stopping it.';
  end if;

  update public.time_entries
  set end_time = stop_ts,
      duration_minutes = greatest(1, round(extract(epoch from (stop_ts - entry.start_time)) / 60)::int),
      paused_for_resume = false
  where id = target_entry_id
  returning * into updated;
  return updated;
end;
$$;

create or replace function public.pause_timer(target_entry_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.time_entries;
  updated public.time_entries;
  pause_ts timestamptz;
begin
  select * into entry from public.time_entries where id = target_entry_id;
  if not found then raise exception 'Time entry not found.'; end if;
  if entry.user_id <> auth.uid() then raise exception 'You can only pause your own timer.'; end if;
  if entry.duration_minutes is not null then raise exception 'This timer isn''t running.'; end if;

  pause_ts := now();
  if public.time_interval_overlaps_visit(entry.user_id, entry.start_time, pause_ts) then
    raise exception 'This timer''s interval overlaps a logged Visit — resolve the Visit conflict before pausing it.';
  end if;

  update public.time_entries
  set end_time = pause_ts,
      duration_minutes = greatest(1, round(extract(epoch from (pause_ts - entry.start_time)) / 60)::int),
      paused_for_resume = true
  where id = target_entry_id
  returning * into updated;
  return updated;
end;
$$;

create or replace function public.resume_timer(paused_entry_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  paused public.time_entries;
  new_entry public.time_entries;
  running public.time_entries;
  resume_ts timestamptz;
begin
  select * into paused from public.time_entries where id = paused_entry_id;
  if not found then raise exception 'Time entry not found.'; end if;
  if paused.user_id <> auth.uid() then raise exception 'You can only resume your own timer.'; end if;
  if not paused.paused_for_resume then raise exception 'This entry isn''t paused.'; end if;
  if not public.can_access_task(paused.task_id) then raise exception 'You don''t have access to this task.'; end if;
  if not public.can_log_time_on_task(paused.task_id) then raise exception 'You don''t have permission to log time on this task.'; end if;

  resume_ts := now();
  if public.time_interval_overlaps_visit(auth.uid(), resume_ts, resume_ts) then
    raise exception 'You have a Visit logged for this time — pause/stop it or adjust the Visit before resuming this timer.';
  end if;

  select * into running from public.time_entries where user_id = auth.uid() and duration_minutes is null;
  if found and public.time_interval_overlaps_visit(auth.uid(), running.start_time, resume_ts) then
    raise exception 'Your running timer overlaps a logged Visit — resolve the conflict before resuming another one.';
  end if;

  if found then
    update public.time_entries
    set end_time = resume_ts,
        duration_minutes = greatest(1, round(extract(epoch from (resume_ts - running.start_time)) / 60)::int),
        paused_for_resume = true
    where id = running.id;
  end if;

  insert into public.time_entries (task_id, user_id, start_time, billable, continues_from_entry_id)
  values (paused.task_id, auth.uid(), resume_ts, paused.billable, paused.id)
  returning * into new_entry;
  return new_entry;
end;
$$;

-- create_manual_time_entry — an explicit interval (p_end_time not null) is checked as given; the
-- accepted "duration-only" mode (p_end_time null, per ManualTimeEntryInput's own doc comment — "no
-- specific clock range") still represents a real occupied span of p_duration_minutes minutes
-- starting at p_start_time, so THAT implied span (never an arbitrarily invented one) is what gets
-- checked — the smallest conservative interpretation that doesn't silently allow double-counting.
create or replace function public.create_manual_time_entry(
  target_task_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_duration_minutes int,
  p_notes text,
  p_billable boolean
)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_entry public.time_entries;
  effective_end timestamptz;
begin
  if not public.can_access_task(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  if not public.can_log_time_on_task(target_task_id) then
    raise exception 'You don''t have permission to log time on this task.';
  end if;

  effective_end := coalesce(p_end_time, p_start_time + (p_duration_minutes * interval '1 minute'));
  if public.time_interval_overlaps_visit(auth.uid(), p_start_time, effective_end) then
    raise exception 'This time overlaps a logged Visit — resolve the Visit conflict before logging this entry.';
  end if;

  insert into public.time_entries (task_id, user_id, start_time, end_time, duration_minutes, notes, billable)
  values (target_task_id, auth.uid(), p_start_time, p_end_time, p_duration_minutes, p_notes, p_billable)
  returning * into new_entry;
  return new_entry;
end;
$$;

-- correct_time_entry — audited, NOT changed. It only ever updates `duration_minutes`; `start_time`/
-- `end_time` (the actual clock interval) are never touched by a correction, so a correction can
-- never create a NEW timestamp overlap that didn't already exist. No overlap check is added here —
-- adding one would be a gratuitous redesign of an already-correct, unrelated RPC.

-- No re-grant needed for any of the six functions above — CREATE OR REPLACE preserves existing
-- EXECUTE grants (to authenticated/service_role from 20260814090003_time_entries.sql).

-- ---------------------------------------------------------------------------
-- I/J/K — Reporting reviewer schedule scope: orthogonal Client Reporting capability, never ordinary
-- operational Project access.
-- ---------------------------------------------------------------------------

-- create_client_report_schedule — `can_access_project()` requirement removed. A reporting reviewer
-- manages Client Report schedules organization-wide through this one narrow feature; they are never
-- required to be operationally assigned to the Project. Still rejects a genuinely nonexistent
-- Project, and still rejects an Internal/Non-billable one (no client site to report on).
create or replace function public.create_client_report_schedule(
  p_project_id uuid,
  p_weekday smallint,
  p_local_time time,
  p_timezone text
)
returns public.client_report_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.client_report_schedules;
  v_is_internal boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if not public.has_reporting_review_access() then
    raise exception 'Only a reporting reviewer or superadmin can manage recurring Client Report schedules.';
  end if;

  select c.is_internal into v_is_internal
  from public.projects p join public.companies c on c.id = p.company_id
  where p.id = p_project_id;
  if v_is_internal is null then
    raise exception 'Project not found.';
  end if;
  if v_is_internal then
    raise exception 'Recurring Client Report schedules can only be created for a Client Project, not Internal/Non-billable work.';
  end if;

  insert into public.client_report_schedules (project_id, created_by, weekday, local_time, timezone, next_run_at)
  values (p_project_id, auth.uid(), p_weekday, p_local_time, p_timezone, public.compute_next_client_report_run(p_weekday, p_local_time, p_timezone, now()))
  returning * into result;
  return result;
end;
$$;

-- list_client_report_schedule_projects — the narrow, capability-gated Project directory the
-- Schedules UI's picker uses instead of the operationally-scoped useProjects() list. Returns only
-- id/name/companyId/companyName for every non-internal Client Project, organization-wide — no Task/
-- Time/member/contact data, and never expands base `projects` SELECT RLS (that policy is completely
-- untouched by this migration).
create function public.list_client_report_schedule_projects()
returns table (project_id uuid, project_name text, company_id uuid, company_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if not public.has_reporting_review_access() then
    raise exception 'Only a reporting reviewer or superadmin can view the reportable Project directory.';
  end if;
  return query
    select p.id, p.name, c.id, c.name
    from public.projects p
    join public.companies c on c.id = p.company_id
    where not c.is_internal
    order by c.name, p.name;
end;
$$;

revoke execute on function public.list_client_report_schedule_projects() from public, anon;
grant execute on function public.list_client_report_schedule_projects() to authenticated, service_role;

-- update_client_report_schedule/delete_client_report_schedule/run_client_report_schedule_now
-- already use has_reporting_review_access() only (no can_access_project) — audited, unchanged.

-- ---------------------------------------------------------------------------
-- L — Canonical forward-only re-assertion of run_one_client_report_schedule's corrected body.
-- 20260821150000 was pushed with a zero_time_tasks CTE-scoping bug; the hosted probe that found it
-- was fixed live via an ad-hoc `create or replace` against the hosted database, and the same fix
-- was applied to the LOCAL migration file before it was ever committed/accepted. This statement is
-- the canonical forward-only record of that exact corrected body — 20260821150000 itself is left
-- byte-for-byte untouched; nothing here changes behavior versus what is already live, it only makes
-- that live state reproducible from migration history alone.
-- ---------------------------------------------------------------------------
create or replace function public.run_one_client_report_schedule(p_schedule_id uuid)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.client_report_schedules;
  v_project public.projects;
  v_company public.companies;
  v_brand public.brands;
  v_generated_by_name text;
  v_range_end date;
  v_range_start date;
  v_existing public.client_reports;
  v_departments jsonb;
  v_history jsonb;
  v_daily_visit_minutes int;
  result public.client_reports;
begin
  select * into v_schedule from public.client_report_schedules where id = p_schedule_id;
  if not found then raise exception 'Schedule not found.'; end if;

  select * into v_project from public.projects where id = v_schedule.project_id;
  if not found then raise exception 'Project not found.'; end if;
  select * into v_company from public.companies where id = v_project.company_id;
  if not found then raise exception 'Project % references unknown company %', v_project.id, v_project.company_id; end if;
  select * into v_brand from public.brands where id = v_company.brand_id;
  if not found then raise exception 'Company % references unknown brand %', v_company.id, v_company.brand_id; end if;

  v_range_end := ((now() at time zone v_schedule.timezone)::date) - 1;
  v_range_start := v_range_end - 6;

  select * into v_existing
  from public.client_reports
  where schedule_id = p_schedule_id and range_start = v_range_start and range_end = v_range_end;
  if found then
    return v_existing;
  end if;

  select full_name into v_generated_by_name from public.profiles where id = v_schedule.created_by;

  with qualifying_tasks as (
    select t.id, t.title, t.description, t.activity_id
    from public.tasks t
    join public.workstreams w on w.id = t.workstream_id
    where w.project_id = v_schedule.project_id
      and t.status = 'done'
      and t.status_changed_at is not null
      and (t.status_changed_at at time zone v_schedule.timezone)::date between v_range_start and v_range_end
  ),
  time_by_task_date as (
    select te.task_id, (te.start_time at time zone v_schedule.timezone)::date as work_date, sum(te.duration_minutes)::int as minutes
    from public.time_entries te
    join qualifying_tasks qt on qt.id = te.task_id
    where te.duration_minutes is not null
    group by te.task_id, (te.start_time at time zone v_schedule.timezone)::date
    having (te.start_time at time zone v_schedule.timezone)::date between v_range_start and v_range_end
  ),
  line_items as (
    select
      qt.id as task_id,
      qt.title,
      qt.activity_id,
      tbd.work_date,
      tbd.minutes,
      coalesce(nullif(trim(qt.description), ''), qt.title) as details
    from qualifying_tasks qt
    join time_by_task_date tbd on tbd.task_id = qt.id
  ),
  zero_time_tasks as (
    select qt.title
    from qualifying_tasks qt
    where not exists (select 1 from time_by_task_date tbd where tbd.task_id = qt.id)
  ),
  bucketed as (
    select
      d.id as department_id, d.name as department_name, d.position as department_position,
      a.id as activity_id, a.name as activity_name, a.position as activity_position,
      li.task_id, li.title as task_label, li.work_date, li.minutes, li.details
    from line_items li
    left join public.activities a on a.id = li.activity_id
    left join public.departments d on d.id = a.department_id
  ),
  activities_json as (
    select
      department_id, department_name, department_position,
      coalesce(activity_id::text, 'other') as activity_key,
      activity_id, activity_name, activity_position,
      jsonb_agg(jsonb_build_object(
        'id', gen_random_uuid(), 'date', work_date, 'minutes', minutes, 'details', details,
        'source', 'raw', 'taskId', task_id, 'taskLabel', task_label
      ) order by work_date) as line_items
    from bucketed
    group by department_id, department_name, department_position, coalesce(activity_id::text, 'other'), activity_id, activity_name, activity_position
  ),
  departments_json as (
    select
      department_id, department_name, department_position,
      jsonb_agg(jsonb_build_object(
        'activityId', activity_id, 'activityName', coalesce(activity_name, 'Untagged work'), 'lineItems', line_items
      ) order by coalesce(activity_position, 999999)) as activities
    from activities_json
    group by department_id, department_name, department_position
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
      'departmentId', department_id, 'departmentName', coalesce(department_name, 'Other'), 'activities', activities
    ) order by coalesce(department_position, 999999)), '[]'::jsonb) from departments_json),
    (select coalesce(jsonb_agg(jsonb_build_object(
      'id', gen_random_uuid(), 'type', 'generation-warning', 'actorId', v_schedule.created_by,
      'actorName', v_generated_by_name, 'createdAt', now(),
      'message', '"' || title || '" was completed in this range but has no legitimate tracked time — omitted from duration-bearing lines.'
    )), '[]'::jsonb) from zero_time_tasks)
  into v_departments, v_history;

  select coalesce(sum(v.duration_minutes)::int, 0)
  into v_daily_visit_minutes
  from public.visit_entries v
  where v.project_id = v_schedule.project_id
    and v.visit_date between v_range_start and v_range_end;

  insert into public.client_reports (
    project_id, company_id, company_label, brand_id, brand_label,
    range_label, range_start, range_end, status, departments, history, daily_visit_minutes,
    schedule_id, generated_by, generated_by_name
  )
  values (
    v_project.id, v_company.id, v_company.name, v_brand.id, v_brand.name,
    'custom', v_range_start, v_range_end, 'draft', v_departments, v_history, v_daily_visit_minutes,
    v_schedule.id, v_schedule.created_by, coalesce(v_generated_by_name, '')
  )
  returning * into result;

  update public.client_report_schedules
  set last_run_at = now(), last_report_id = result.id, updated_at = now(),
      next_run_at = public.compute_next_client_report_run(weekday, local_time, timezone, now())
  where id = p_schedule_id;

  return result;
exception
  when unique_violation then
    select * into v_existing
    from public.client_reports
    where schedule_id = p_schedule_id and range_start = v_range_start and range_end = v_range_end;
    return v_existing;
end;
$$;

-- Privilege re-assertion — CREATE OR REPLACE preserves existing grants, but this is re-stated
-- explicitly per Section L's own instruction: direct ordinary authenticated EXECUTE remains revoked;
-- only the trusted internal path (pg_cron / service_role) and the auth-gated
-- run_client_report_schedule_now wrapper may invoke it.
revoke execute on function public.run_one_client_report_schedule(uuid) from public, anon, authenticated;
grant execute on function public.run_one_client_report_schedule(uuid) to service_role;
