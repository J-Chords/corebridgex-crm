-- Phase 9F — recurring Client Report DRAFT generation (V1: weekly only). A schedule produces an
-- ordinary Draft that lands in the Review Queue exactly like a manually-generated one — it is never
-- auto-finalized (Section 29's own locked instruction: "This preserves human control").
--
-- pg_cron is available on this hosted project (verified live before writing this migration) and is
-- enabled here. A single due-schedule runner job processes every schedule whose `next_run_at` has
-- arrived, rather than one cron job per Project/schedule (Section 35's own explicit preference).
--
-- Forward-only; does not edit any already-applied migration.

create extension if not exists pg_cron with schema extensions;

create table public.client_report_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  created_by uuid not null references public.profiles (id),
  active boolean not null default true,
  -- 0=Sunday .. 6=Saturday — same convention as JS Date.getDay(), which the schedule UI reads/writes
  -- directly with no reindexing.
  weekday smallint not null check (weekday between 0 and 6),
  local_time time not null,
  timezone text not null,
  next_run_at timestamptz not null,
  last_run_at timestamptz null,
  last_report_id uuid null references public.client_reports (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_report_schedules_next_run_idx on public.client_report_schedules (next_run_at) where active;
create index client_report_schedules_project_id_idx on public.client_report_schedules (project_id);

comment on table public.client_report_schedules is
  'Mutated only via create_client_report_schedule/update_client_report_schedule/delete_client_report_schedule/run_client_report_schedule_now RPCs — never a direct client INSERT/UPDATE/DELETE.';

-- Deleting a schedule (Section 41/49.Q) must NOT delete the historical Client Reports it already
-- produced — only detach them from the (now-gone) schedule.
alter table public.client_reports add column schedule_id uuid null references public.client_report_schedules (id) on delete set null;

-- Duplicate prevention (Section 33): a schedule can never produce two Drafts for the exact same
-- (schedule, rangeStart, rangeEnd) — a hard database-level backstop, not just an application-level
-- "check first" (which a retried/concurrent runner invocation could still race).
create unique index client_reports_schedule_range_unique on public.client_reports (schedule_id, range_start, range_end) where schedule_id is not null;

-- ---------------------------------------------------------------------------
-- compute_next_client_report_run — DST-safe next occurrence of (weekday, local_time) in timezone,
-- strictly after p_after. Never fixed 24h/millisecond arithmetic: `(date + time) AT TIME ZONE tz`
-- asks Postgres's own timezone database for the correct UTC instant for that specific local wall-
-- clock moment, so a DST transition between now and the target date is handled correctly by
-- construction, not by a manual offset calculation.
-- ---------------------------------------------------------------------------
create function public.compute_next_client_report_run(
  p_weekday smallint,
  p_local_time time,
  p_timezone text,
  p_after timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local_today date;
  v_candidate_date date;
  v_candidate timestamptz;
  v_day_diff int;
begin
  begin
    perform now() at time zone p_timezone;
  exception when others then
    raise exception 'Invalid timezone.';
  end;

  v_local_today := (p_after at time zone p_timezone)::date;
  -- extract(dow from date) matches JS Date.getDay(): 0=Sunday..6=Saturday.
  v_day_diff := (p_weekday - extract(dow from v_local_today)::int + 7) % 7;
  v_candidate_date := v_local_today + v_day_diff;
  v_candidate := (v_candidate_date + p_local_time) at time zone p_timezone;

  -- If today already matches the weekday but the local time already passed (or this recomputation
  -- is happening exactly at/after a due run), or the same-week candidate isn't strictly after
  -- p_after for any other reason, step forward a full week — never less, since this is a WEEKLY
  -- schedule (Section 31: "Do not implement daily/monthly/quarterly schedule complexity").
  if v_candidate <= p_after then
    v_candidate_date := v_candidate_date + 7;
    v_candidate := (v_candidate_date + p_local_time) at time zone p_timezone;
  end if;

  return v_candidate;
end;
$$;

revoke execute on function public.compute_next_client_report_run(smallint, time, text, timestamptz) from public, anon;
grant execute on function public.compute_next_client_report_run(smallint, time, text, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- run_one_client_report_schedule — the ONE scheduled-generation function, used by BOTH the
-- background due-runner and the reviewer-facing "Run Now" action (Section 39: "It must use the SAME
-- scheduled generation function used by background processing... not a separate divergent 'test
-- generation' algorithm"). Idempotent: if a report for this exact (schedule, computed range)
-- already exists, returns it unchanged instead of generating a duplicate (Section 33) — the unique
-- index above is the hard backstop if two invocations somehow race.
--
-- Deliberately reimplements the qualifying-Task/aggregation/grouping rules directly against the
-- source tables (same shape as get_client_report_weekly_evidence + the TypeScript pure function)
-- rather than calling either — a cron-triggered run has no auth.uid()/session, so it cannot go
-- through the auth.uid()-gated evidence RPC; and TypeScript cannot execute inside Postgres at all,
-- so the alternative would be no automation. Authorization for the underlying Project access is not
-- re-derived per run: it was already checked once, for real, at schedule CREATE time
-- (create_client_report_schedule requires can_access_project for the creating user) — an existing,
-- active schedule IS the ongoing authorization token for its own recurring generation, the same way
-- a cron job in any system trusts its own prior setup rather than re-deriving a session that no
-- longer exists.
--
-- Narrative (Section 36's own explicit, deliberate simplification for AUTOMATED generation only):
-- Task description, then Task title — never confirmed Daily Update narrative, and never Task Notes.
-- This is safer for unattended generation specifically because it needs no interactive staff-name
-- scanner; the mandatory review/finalize name-scan (Section 37, unchanged) still runs before this
-- Draft can ever be finalized, exactly like manual generation.
-- ---------------------------------------------------------------------------
create function public.run_one_client_report_schedule(p_schedule_id uuid)
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

  -- Previous 7 COMPLETED local calendar days, ending the local day immediately before "now" in the
  -- schedule's own timezone (Section 32's exact locked semantics) — computed fresh at run time from
  -- the actual current moment, never from a possibly-stale next_run_at, so a late-running cron tick
  -- still reports the correct, intended period.
  v_range_end := ((now() at time zone v_schedule.timezone)::date) - 1;
  v_range_start := v_range_end - 6;

  select * into v_existing
  from public.client_reports
  where schedule_id = p_schedule_id and range_start = v_range_start and range_end = v_range_end;
  if found then
    return v_existing;
  end if;

  select full_name into v_generated_by_name from public.profiles where id = v_schedule.created_by;

  -- Qualifying Tasks (locked 9D rule): status='done' AND statusChangedAt's LOCAL work date (in the
  -- schedule's own timezone) falls within range. Project-scoped via each Task's own Workstream.
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
  -- One line item per (Task, work date) — narrative is Task description, else title, never Daily
  -- Update narrative (Section 36) and never a fabricated 0 for a qualifying Task with no time.
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
  -- Bucket into Activity -> Department, "Other" fallback exactly like the TS pure function.
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
  -- Both aggregates below read CTEs from the SAME `with` clause above (a CTE only exists for the
  -- one statement it's attached to) — so they must be pulled out as two scalar subqueries in one
  -- final `select ... into v_departments, v_history` rather than two separate statements.
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
  -- The unique index is the real backstop against a genuine race between two concurrent
  -- invocations for the same (schedule, range) — treat it exactly like the idempotent "already
  -- exists" path above rather than surfacing a raw constraint-violation error.
  when unique_violation then
    select * into v_existing
    from public.client_reports
    where schedule_id = p_schedule_id and range_start = v_range_start and range_end = v_range_end;
    return v_existing;
end;
$$;

-- Callable only by the trusted internal path (pg_cron runs as the job owner, effectively
-- postgres/service_role) and by the auth-gated run_client_report_schedule_now wrapper below —
-- never directly by an ordinary authenticated user, since this function itself performs no
-- auth.uid()-based authorization check (see the doc comment above for why).
revoke execute on function public.run_one_client_report_schedule(uuid) from public, anon, authenticated;
grant execute on function public.run_one_client_report_schedule(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- run_due_client_report_schedules — the single due-schedule batch runner pg_cron invokes on a
-- fixed interval (Section 35: one runner, not one job per schedule/Project). Each schedule's
-- failure is caught independently so one bad schedule never blocks the rest of the batch.
-- ---------------------------------------------------------------------------
create function public.run_due_client_report_schedules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_id uuid;
begin
  for v_schedule_id in
    select id from public.client_report_schedules where active and next_run_at <= now()
  loop
    begin
      perform public.run_one_client_report_schedule(v_schedule_id);
    exception when others then
      -- Never let one schedule's failure (e.g. a deleted Project) halt the whole batch or leave
      -- next_run_at stuck in the past forever — advance it so this schedule doesn't fire every
      -- single runner tick until someone notices and fixes it.
      update public.client_report_schedules
      set next_run_at = public.compute_next_client_report_run(weekday, local_time, timezone, now()), updated_at = now()
      where id = v_schedule_id;
    end;
  end loop;
end;
$$;

revoke execute on function public.run_due_client_report_schedules() from public, anon, authenticated;
grant execute on function public.run_due_client_report_schedules() to service_role;

-- ---------------------------------------------------------------------------
-- Reviewer-facing CRUD RPCs (Section 30: reportingReviewAccess=true OR Superadmin only, org-wide —
-- schedule management is not owner/project-scoped beyond requiring real access to the Project at
-- creation time).
-- ---------------------------------------------------------------------------
create function public.create_client_report_schedule(
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
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if not public.has_reporting_review_access() then
    raise exception 'Only a reporting reviewer or superadmin can manage recurring Client Report schedules.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to schedule reports for that Project.';
  end if;

  insert into public.client_report_schedules (project_id, created_by, weekday, local_time, timezone, next_run_at)
  values (p_project_id, auth.uid(), p_weekday, p_local_time, p_timezone, public.compute_next_client_report_run(p_weekday, p_local_time, p_timezone, now()))
  returning * into result;
  return result;
end;
$$;

create function public.update_client_report_schedule(
  p_schedule_id uuid,
  p_weekday smallint,
  p_local_time time,
  p_timezone text,
  p_active boolean
)
returns public.client_report_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.client_report_schedules;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if not public.has_reporting_review_access() then
    raise exception 'Only a reporting reviewer or superadmin can manage recurring Client Report schedules.';
  end if;
  if not exists (select 1 from public.client_report_schedules where id = p_schedule_id) then
    raise exception 'Schedule not found.';
  end if;

  update public.client_report_schedules
  set weekday = p_weekday, local_time = p_local_time, timezone = p_timezone, active = p_active, updated_at = now(),
      -- Resuming (or editing timing while active) recalculates a fresh next_run_at from now — a
      -- paused schedule keeps whatever next_run_at it last had, harmless since the runner only ever
      -- looks at active schedules, and reactivating always recomputes it fresh here.
      next_run_at = case when p_active then public.compute_next_client_report_run(p_weekday, p_local_time, p_timezone, now()) else next_run_at end
  where id = p_schedule_id
  returning * into result;
  return result;
end;
$$;

create function public.delete_client_report_schedule(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if not public.has_reporting_review_access() then
    raise exception 'Only a reporting reviewer or superadmin can manage recurring Client Report schedules.';
  end if;
  delete from public.client_report_schedules where id = p_schedule_id;
  if not found then raise exception 'Schedule not found.'; end if;
end;
$$;

-- run_client_report_schedule_now — the reviewer-facing "Run Now" action (Section 39). Auth-gated
-- exactly like the CRUD RPCs above, then delegates to the EXACT SAME generation function the
-- background runner uses — never a second, divergent implementation.
create function public.run_client_report_schedule_now(p_schedule_id uuid)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if not public.has_reporting_review_access() then
    raise exception 'Only a reporting reviewer or superadmin can run a Client Report schedule.';
  end if;
  if not exists (select 1 from public.client_report_schedules where id = p_schedule_id) then
    raise exception 'Schedule not found.';
  end if;
  return public.run_one_client_report_schedule(p_schedule_id);
end;
$$;

revoke execute on function public.create_client_report_schedule(uuid, smallint, time, text) from public, anon;
revoke execute on function public.update_client_report_schedule(uuid, smallint, time, text, boolean) from public, anon;
revoke execute on function public.delete_client_report_schedule(uuid) from public, anon;
revoke execute on function public.run_client_report_schedule_now(uuid) from public, anon;
grant execute on function public.create_client_report_schedule(uuid, smallint, time, text) to authenticated, service_role;
grant execute on function public.update_client_report_schedule(uuid, smallint, time, text, boolean) to authenticated, service_role;
grant execute on function public.delete_client_report_schedule(uuid) to authenticated, service_role;
grant execute on function public.run_client_report_schedule_now(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS — reviewer org-wide (Section 40: schedules UI is reviewer/Superadmin only), no plain
-- INSERT/UPDATE/DELETE grant to authenticated (RPC-only, same convention as time_entries/
-- visit_entries).
-- ---------------------------------------------------------------------------
alter table public.client_report_schedules enable row level security;

create policy "client_report_schedules_select" on public.client_report_schedules
  for select using (public.has_reporting_review_access());

grant select on public.client_report_schedules to authenticated;
grant select, insert, update, delete on public.client_report_schedules to service_role;

-- ---------------------------------------------------------------------------
-- Background execution — ONE recurring pg_cron job calling the due-schedule runner every 15
-- minutes. Idempotent across repeated migration runs: unschedule-then-reschedule by a fixed job
-- name, rather than assuming cron.schedule(name, ...) upserts on every pg_cron version.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'client-report-schedule-runner';
exception when others then
  null;
end $$;

select cron.schedule('client-report-schedule-runner', '*/15 * * * *', $cron$select public.run_due_client_report_schedules();$cron$);
