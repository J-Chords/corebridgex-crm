-- Phase 9 final product-semantics fix — Plan -> Complete Client Visit workflow.
--
-- Manual acceptance found a real business-semantics gap: the original Visit model treated Agenda +
-- Start/End as though the user was recording an already-completed visit. The actual process is:
--   1. An Employee ("Account Manager" is a business responsibility, not a role — Corebridge still
--      has exactly Employee/Supervisor/Superadmin) PLANS a Client Visit ahead of time: Project,
--      intended local date, and the Agenda/questions they're taking into the meeting.
--   2. The visit happens.
--   3. The Employee RECORDS the actual Start/End afterward — only then does it become Completed,
--      and only its calculated actual minutes ever become reportable Daily Visit Hours.
-- A Planned Visit has zero reportable minutes and no factual actual-time interval, so it must never
-- block (or be counted alongside) real Task Time.
--
-- `status` (planned | completed) is the single source of truth; a structural CHECK constraint
-- guarantees `start_at`/`end_at` are null together for a Planned Visit and set together for a
-- Completed one — never partially. Every already-existing row (which always had real Start/End
-- under the prior model) backfills to `completed` and keeps its real historical hours unchanged.
--
-- Forward-only; does not edit 20260821130000_visit_entries.sql, 20260821140000_visit_reporting_integration.sql,
-- 20260821150000_client_report_schedules.sql, 20260821160000_phase9_final_integrity_hardening.sql,
-- or 20260821170000_visit_time_overlap_canonical_fix.sql.

-- ---------------------------------------------------------------------------
-- Schema evolution.
-- ---------------------------------------------------------------------------

-- Every existing row already has real Start/End/Duration under the prior model — defaulting to
-- 'completed' backfills them safely in the same statement that adds the column; the default is then
-- dropped so every future row (always written by an RPC, never a direct client write) must specify
-- its status explicitly.
alter table public.visit_entries add column status text not null default 'completed';
alter table public.visit_entries add constraint visit_entries_status_check check (status in ('planned', 'completed'));
alter table public.visit_entries alter column status drop default;

-- A Planned Visit has no actual interval yet.
alter table public.visit_entries alter column start_at drop not null;
alter table public.visit_entries alter column end_at drop not null;

-- Structural all-or-none guarantee: never a half-planned/half-completed row. The existing
-- `visit_entries_start_before_end`/`visit_entries_max_duration` CHECK constraints already pass
-- automatically when both sides are null (a NULL comparison result satisfies a CHECK constraint per
-- the SQL standard), so neither needs to change.
alter table public.visit_entries add constraint visit_entries_status_actual_time_consistency check (
  (status = 'planned' and start_at is null and end_at is null)
  or (status = 'completed' and start_at is not null and end_at is not null)
);

-- duration_minutes must be null-safe for a Planned Visit. Postgres has no ALTER COLUMN ... SET
-- EXPRESSION for a generated column, so it is dropped and re-added with the corrected expression —
-- purely a derived/computed column, so this loses nothing: every legacy Completed row's value is
-- losslessly recomputed from its still-present start_at/end_at as part of the ALTER TABLE rewrite.
-- (The original expression, `greatest(0, round(...))`, would have silently evaluated to 0 — not
-- null — for a Planned row, since GREATEST/LEAST ignore null arguments rather than propagating
-- them; this is the exact bug this rewrite avoids.)
alter table public.visit_entries drop column duration_minutes;
alter table public.visit_entries add column duration_minutes integer generated always as (
  case
    when start_at is null or end_at is null then null
    else greatest(0, round(extract(epoch from (end_at - start_at)) / 60))::integer
  end
) stored;

comment on column public.visit_entries.status is
  'planned = Agenda prepared, no actual hours yet (0 reportable minutes). completed = actual Start/End recorded (real reportable minutes). See visit_entries_status_actual_time_consistency.';

-- ---------------------------------------------------------------------------
-- Overlap helpers — a Planned Visit has no real interval and must never be treated as occupying
-- time (Section L's own explicit warning: `tstzrange(null, null)` is an UNBOUNDED/INFINITE range in
-- Postgres, not "no interval" — every planned row must be excluded explicitly, not merely trusted to
-- evaluate harmlessly).
-- ---------------------------------------------------------------------------

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
        and v.status = 'completed'
        and (p_exclude_visit_id is null or v.id <> p_exclude_visit_id)
        and tstzrange(v.start_at, v.end_at) && tstzrange(p_start, p_end)
    )
    or exists (
      select 1 from public.time_entries te
      where te.user_id = p_user_id
        and tstzrange(
          te.start_time,
          coalesce(
            te.end_time,
            case
              when te.duration_minutes is null then 'infinity'::timestamptz
              else te.start_time + (te.duration_minutes * interval '1 minute')
            end
          )
        ) && tstzrange(p_start, p_end)
    );
$$;

create or replace function public.time_interval_overlaps_visit(
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
      and v.status = 'completed'
      and tstzrange(v.start_at, v.end_at) && tstzrange(p_start, p_end, case when p_start = p_end then '[]' else '[)' end)
  );
$$;

revoke execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.time_interval_overlaps_visit(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.time_interval_overlaps_visit(uuid, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- RPCs — the old single-step create_visit_entry(project, start, end, agenda, timezone) is retired
-- (creating a Visit no longer implies actual hours exist); update_visit_entry is likewise retired in
-- favor of two narrower, clearer lanes: update_visit_plan (Planned Visits: date/Agenda only) and
-- complete_visit_entry (records actual hours, transitioning Planned -> Completed, or re-validates a
-- correction on an already-Completed one — Section M: preserve correcting actual hours without a
-- second, separate correction/audit system).
-- ---------------------------------------------------------------------------

drop function if exists public.create_visit_entry(uuid, timestamptz, timestamptz, text, text);
drop function if exists public.update_visit_entry(uuid, timestamptz, timestamptz, text);

-- create_visit_entry — plans a Visit. Self-service only, no actual hours requested or accepted;
-- requires real, non-internal Project access and a useful Agenda, same as before. No overlap check
-- at all — a plan reserves no time (Section J).
create function public.create_visit_entry(
  p_project_id uuid,
  p_visit_date date,
  p_agenda text,
  p_timezone text
)
returns public.visit_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_internal boolean;
  v_today date;
  new_entry public.visit_entries;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to plan a Visit for that Project.';
  end if;
  select c.is_internal into v_is_internal
  from public.projects p join public.companies c on c.id = p.company_id
  where p.id = p_project_id;
  if v_is_internal is null then
    raise exception 'Project not found.';
  end if;
  if v_is_internal then
    raise exception 'Visit Hours can only be planned against a Client Project, not Internal/Non-billable work.';
  end if;
  if length(trim(coalesce(p_agenda, ''))) = 0 then
    raise exception 'Agenda is required.';
  end if;
  begin
    v_today := (now() at time zone p_timezone)::date;
  exception when others then
    raise exception 'Invalid timezone.';
  end;
  if p_visit_date < v_today then
    raise exception 'You can only plan a Client Visit for today or a future date.';
  end if;

  insert into public.visit_entries (user_id, project_id, visit_date, status, agenda, timezone)
  values (auth.uid(), p_project_id, p_visit_date, 'planned', trim(p_agenda), p_timezone)
  returning * into new_entry;
  return new_entry;
end;
$$;

-- update_visit_plan — owner-only, Planned Visits only (a Completed Visit's date is locked in by its
-- own actual hours; correct those via complete_visit_entry instead). Project/timezone stay
-- immutable once planned, same precedent as the original create/update split.
create function public.update_visit_plan(
  target_entry_id uuid,
  p_visit_date date,
  p_agenda text
)
returns public.visit_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.visit_entries;
  v_today date;
  result public.visit_entries;
begin
  select * into existing from public.visit_entries where id = target_entry_id;
  if not found then raise exception 'Visit Entry not found.'; end if;
  if existing.user_id <> auth.uid() then
    raise exception 'Only the Visit''s own owner can edit it.';
  end if;
  if existing.status <> 'planned' then
    raise exception 'This Visit has already been completed — use Record Hours to correct its actual times instead.';
  end if;
  if length(trim(coalesce(p_agenda, ''))) = 0 then
    raise exception 'Agenda is required.';
  end if;
  v_today := (now() at time zone existing.timezone)::date;
  if p_visit_date < v_today then
    raise exception 'You can only plan a Client Visit for today or a future date.';
  end if;

  update public.visit_entries
  set visit_date = p_visit_date, agenda = trim(p_agenda), updated_at = now()
  where id = target_entry_id
  returning * into result;
  return result;
end;
$$;

-- complete_visit_entry — records the real Start/End, applying the full anti-double-counting
-- invariant only now that a real interval exists (Section K): must not overlap the same user's
-- completed Task Time, running/open-ended timer, or another Completed Visit. The actual interval
-- must fall on the Visit's own already-chosen local date — never silently moved to a different day.
-- Works whether the Visit is currently Planned (the normal Plan -> Complete transition) or already
-- Completed (a correction pass, re-validating exactly the same way) — one function serves both,
-- avoiding a second, separate correction system.
create function public.complete_visit_entry(
  target_entry_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns public.visit_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.visit_entries;
  v_local_start date;
  v_local_end date;
  result public.visit_entries;
begin
  select * into existing from public.visit_entries where id = target_entry_id;
  if not found then raise exception 'Visit Entry not found.'; end if;
  if existing.user_id <> auth.uid() then
    raise exception 'Only the Visit''s own owner can record its hours.';
  end if;
  if p_start_at >= p_end_at then
    raise exception 'Start time must be before end time.';
  end if;
  if p_end_at - p_start_at > interval '16 hours' then
    raise exception 'A single Visit cannot exceed 16 hours — check the times.';
  end if;

  v_local_start := (p_start_at at time zone existing.timezone)::date;
  v_local_end := (p_end_at at time zone existing.timezone)::date;
  if v_local_start <> v_local_end then
    raise exception 'A Visit cannot cross midnight — split it into two Visits.';
  end if;
  if v_local_start <> existing.visit_date then
    raise exception 'The actual time must fall on this Visit''s planned date (%) — edit the Visit''s date first if it genuinely happened on a different day.', existing.visit_date;
  end if;

  if public.visit_entry_overlaps(auth.uid(), p_start_at, p_end_at, target_entry_id) then
    raise exception 'This overlaps an existing Time Entry or Visit — correct one of them first.';
  end if;

  update public.visit_entries
  set status = 'completed', start_at = p_start_at, end_at = p_end_at, updated_at = now()
  where id = target_entry_id
  returning * into result;
  return result;
end;
$$;

-- delete_visit_entry is unchanged (owner or Superadmin, any status) — see 20260821130000.

grant execute on function public.create_visit_entry(uuid, date, text, text) to authenticated, service_role;
grant execute on function public.update_visit_plan(uuid, date, text) to authenticated, service_role;
grant execute on function public.complete_visit_entry(uuid, timestamptz, timestamptz) to authenticated, service_role;
revoke execute on function public.create_visit_entry(uuid, date, text, text) from public, anon;
revoke execute on function public.update_visit_plan(uuid, date, text) from public, anon;
revoke execute on function public.complete_visit_entry(uuid, timestamptz, timestamptz) from public, anon;

-- ---------------------------------------------------------------------------
-- Client Report evidence — only Completed actual Visit minutes are reportable; a Planned Visit
-- contributes 0 (there are no actual minutes to sum). Both the manual weekly-evidence RPC and the
-- scheduled generator are updated so manual and scheduled reports agree exactly.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_report_weekly_evidence(
  p_project_id uuid,
  p_range_start date,
  p_range_end date,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_tasks jsonb;
  v_time_evidence jsonb;
  v_daily_update_evidence jsonb;
  v_visit_evidence jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to generate a client report for that Project.';
  end if;
  if p_range_start > p_range_end then
    raise exception 'Invalid date range.';
  end if;

  begin
    perform now() at time zone p_timezone;
  exception when others then
    raise exception 'Invalid timezone.';
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'statusChangedAt', t.status_changed_at,
    'activityId', t.activity_id
  )), '[]'::jsonb)
  into v_tasks
  from public.tasks t
  join public.workstreams w on w.id = t.workstream_id
  where w.project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'taskId', x.task_id,
    'date', x.work_date,
    'minutes', x.total_minutes
  )), '[]'::jsonb)
  into v_time_evidence
  from (
    select te.task_id,
           (te.start_time at time zone p_timezone)::date as work_date,
           sum(te.duration_minutes)::int as total_minutes
    from public.time_entries te
    join public.tasks t on t.id = te.task_id
    join public.workstreams w on w.id = t.workstream_id
    where w.project_id = p_project_id
      and te.duration_minutes is not null
    group by te.task_id, (te.start_time at time zone p_timezone)::date
  ) x
  where x.work_date between p_range_start and p_range_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'taskId', ev."sourceTaskId",
    'date', du.date,
    'details', ev.details
  )), '[]'::jsonb)
  into v_daily_update_evidence
  from public.daily_updates du
  cross join lateral jsonb_to_recordset(du.entries) as ev(details text, "sourceTaskId" text)
  where du.status = 'confirmed'
    and du.date between p_range_start and p_range_end
    and ev."sourceTaskId" is not null
    and exists (
      select 1 from public.tasks t
      join public.workstreams w on w.id = t.workstream_id
      where w.project_id = p_project_id and t.id::text = ev."sourceTaskId"
    );

  -- Only Completed actual Visit minutes are reportable — a Planned Visit has none yet.
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', y.visit_date,
    'minutes', y.total_minutes
  )), '[]'::jsonb)
  into v_visit_evidence
  from (
    select v.visit_date, sum(v.duration_minutes)::int as total_minutes
    from public.visit_entries v
    where v.project_id = p_project_id
      and v.status = 'completed'
      and v.visit_date between p_range_start and p_range_end
    group by v.visit_date
  ) y;

  return jsonb_build_object(
    'tasks', v_tasks,
    'timeEvidence', v_time_evidence,
    'dailyUpdateEvidence', v_daily_update_evidence,
    'visitEvidence', v_visit_evidence
  );
end;
$$;

revoke execute on function public.get_client_report_weekly_evidence(uuid, date, date, text) from public, anon;
grant execute on function public.get_client_report_weekly_evidence(uuid, date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled report generator — the SAME completed-only Visit rule (Section T/U: manual and
-- scheduled reports must agree exactly). Every other part of this function (weekly period, Draft-
-- only, idempotency, name-free scheduled narrative, zero-time Task warnings) is byte-for-byte
-- unchanged from its canonical body in 20260821160000_phase9_final_integrity_hardening.sql.
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

  -- Only Completed actual Visit minutes are reportable — a Planned Visit has none yet (the ONE
  -- change from this function's prior canonical body).
  select coalesce(sum(v.duration_minutes)::int, 0)
  into v_daily_visit_minutes
  from public.visit_entries v
  where v.project_id = v_schedule.project_id
    and v.status = 'completed'
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

revoke execute on function public.run_one_client_report_schedule(uuid) from public, anon, authenticated;
grant execute on function public.run_one_client_report_schedule(uuid) to service_role;
