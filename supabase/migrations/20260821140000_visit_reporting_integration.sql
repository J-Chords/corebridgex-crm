-- Phase 9F — wires Daily Visit Hours into the Weekly Client Report evidence/generation path,
-- without ever exposing contributor identity or private Agenda text to the browser, and without
-- ever letting the same minutes count as both Task Time and Visit Hours (that guarantee already
-- lives at the source — visit_entry_overlaps, 20260821130000_visit_entries.sql — this migration
-- only ever SUMS already-non-overlapping Visit Entries, it never re-derives the anti-overlap rule).
--
-- Forward-only; does not edit 20260821110000_client_report_weekly_evidence.sql,
-- 20260821120000_reporting_review_capability.sql, or 20260821130000_visit_entries.sql.

-- Small nullable snapshot field (Section 27): legacy reports generated before this migration keep
-- NULL — visit data was genuinely not captured in that historical snapshot, never retroactively
-- invented as 0. A newly generated report always gets the actual calculated value, including a
-- legitimate 0 when no Visit Entries exist in range.
alter table public.client_reports add column daily_visit_minutes integer null;

-- get_client_report_weekly_evidence — additive: returns jsonb regardless of internal shape, so this
-- `create or replace` needs no drop/recreate the way generate_client_report's signature change
-- does below. Adds `visitEvidence`, one aggregate row per local visit_date (Visit Entries already
-- store their own local calendar date at creation time — see visit_entries.visit_date — so no
-- AT TIME ZONE bucketing is needed here, unlike Time Entries) summed across every legitimate
-- contributor, same anonymization-by-GROUP-BY structure as timeEvidence: no user_id, no Agenda
-- text, nothing but date + minutes. Every other part of this function (Tasks, timeEvidence,
-- dailyUpdateEvidence, and all of their own authorization/validation) is byte-for-byte unchanged
-- from 20260821110000_client_report_weekly_evidence.sql.
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

  -- Visit evidence: one row per local visit_date, summed across every legitimate contributor for
  -- this Project — no user_id, no Agenda, nothing else. Never counted alongside timeEvidence in the
  -- SAME total by this function or by the TS pure function that consumes it (Total Week Hours and
  -- Daily Visit Hours stay two separate numbers all the way to Grand Total).
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', y.visit_date,
    'minutes', y.total_minutes
  )), '[]'::jsonb)
  into v_visit_evidence
  from (
    select v.visit_date, sum(v.duration_minutes)::int as total_minutes
    from public.visit_entries v
    where v.project_id = p_project_id
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

-- generate_client_report gains a second optional parameter, p_daily_visit_minutes (default null),
-- stored as-is into the new column — the RPC does not recompute or validate the number itself
-- (that stays TypeScript's job, same division of labor as departments/history: "SQL enforces access
-- and derives minimum evidence, TypeScript owns report composition/math"). Old 6-argument overload
-- dropped explicitly, same rationale as the Phase 9E p_history addition — exactly one generation
-- path. Every other precondition/behavior is byte-for-byte unchanged from
-- 20260821120000_reporting_review_capability.sql (itself unchanged from
-- 20260820090000_client_reports_project_scope.sql before it).
drop function if exists public.generate_client_report(uuid, text, date, date, jsonb, jsonb);

create function public.generate_client_report(
  p_project_id uuid,
  p_range_label text,
  p_range_start date,
  p_range_end date,
  p_departments jsonb,
  p_history jsonb default '[]'::jsonb,
  p_daily_visit_minutes int default null
)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_company public.companies;
  v_brand public.brands;
  v_generated_by_name text;
  result public.client_reports;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to generate a client report for that Project.';
  end if;
  if p_range_label not in ('today', 'this-week', 'custom') then
    raise exception 'Invalid range label.';
  end if;
  if p_range_start > p_range_end then
    raise exception 'Invalid date range.';
  end if;

  select * into v_company from public.companies where id = v_project.company_id;
  if not found then
    raise exception 'Project % references unknown company %', v_project.id, v_project.company_id;
  end if;
  select * into v_brand from public.brands where id = v_company.brand_id;
  if not found then
    raise exception 'Company % references unknown brand %', v_company.id, v_company.brand_id;
  end if;
  select full_name into v_generated_by_name from public.profiles where id = auth.uid();

  insert into public.client_reports (
    project_id, company_id, company_label, brand_id, brand_label,
    range_label, range_start, range_end, status, departments, history, daily_visit_minutes,
    generated_by, generated_by_name
  )
  values (
    v_project.id, v_company.id, v_company.name, v_brand.id, v_brand.name,
    p_range_label, p_range_start, p_range_end, 'draft', p_departments, coalesce(p_history, '[]'::jsonb), p_daily_visit_minutes,
    auth.uid(), v_generated_by_name
  )
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.generate_client_report(uuid, text, date, date, jsonb, jsonb, int) from public, anon;
grant execute on function public.generate_client_report(uuid, text, date, date, jsonb, jsonb, int) to authenticated, service_role;
