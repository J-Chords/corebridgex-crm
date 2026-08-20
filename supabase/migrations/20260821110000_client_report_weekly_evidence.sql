-- Phase 9D hotfix — a narrow, Project-authorized reporting-evidence RPC closing a real
-- multi-contributor correctness gap in the hosted Supabase Client Report generation path.
--
-- The Weekly Client Report's TypeScript aggregation (client-report-weekly.ts) correctly combines
-- every legitimate contributor's Time Entry minutes for a Task/date — but the Supabase provider
-- gathered that evidence via ordinary authenticated browser SELECTs against `time_entries`/
-- `daily_updates`, whose existing RLS (`user_id = auth.uid() OR manages_user(user_id)`) is
-- deliberately owner/team-scoped, NOT Project-scoped. An Employee generating a report for a Project
-- they legitimately access could therefore only ever see their OWN Time Entries on a shared Task,
-- silently under-counting a coworker's legitimate time on that same Task/date.
--
-- This is fixed with a SECURITY DEFINER "derive the minimum evidence a legitimate Project-report
-- generator needs" boundary — NOT by broadening `time_entries_select`/`daily_updates_select`
-- themselves, which stay exactly as they are (least-privilege, owner/team-scoped, unchanged by this
-- migration). Anyone who can legitimately generate a Client Report for Project P (the same
-- `can_access_project` check `generate_client_report` already uses) may obtain ONLY:
--   - the Tasks belonging to that Project's own Workstreams (id/title/description/status/
--     status_changed_at/activity_id — never Task Notes, since this app's Task type has none, and
--     nothing else)
--   - Time Entry minutes already aggregated server-side to one row per (task, local work date)
--     across every legitimate contributor — no user_id, no notes, no correction history; each
--     Time Entry contributes to exactly one bucket
--   - confirmed Daily Update narrative text already isolated to one row per (task, local work
--     date) — no author identity, no Scheduled Time, no review metadata, no unrelated entries
--
-- Work-date bucketing stays local-calendar-safe (Phase 9C's own locked rule), not naive UTC date
-- slicing — Postgres has no notion of "the browser's timezone," so the calling browser passes its
-- own detected IANA timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) explicitly; the
-- function validates it before use and buckets via `time_entries.start_time AT TIME ZONE
-- p_timezone`, the same local-wall-clock-date semantics `dateKeyFromTimestamp` already establishes
-- client-side. All contributors' entries are bucketed under the *generating user's own* detected
-- timezone — the same "whichever machine runs the aggregation" behavior the pre-existing mock/pure
-- algorithm already had, not a new inconsistency.
--
-- Forward-only; does not edit any already-applied migration.

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

  -- Validate the caller-supplied IANA timezone before trusting it in AT TIME ZONE below — an
  -- invalid identifier raises a clean, caller-facing error instead of an opaque Postgres one.
  -- This is a bound parameter, not string-concatenated SQL, so it is not an injection vector
  -- either way; the check is purely to fail cleanly on a bad value.
  begin
    perform now() at time zone p_timezone;
  exception when others then
    raise exception 'Invalid timezone.';
  end;

  -- Tasks belonging to this Project's own Workstreams only — same scope
  -- generate_client_report's own evidence-gathering has always used, just moved behind this
  -- function so the browser never needs a broader ordinary SELECT to get it. No Task Notes column
  -- exists on this table to accidentally expose.
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

  -- One row per (task, local work date) — every legitimate contributor's minutes summed together
  -- server-side. No user_id, no notes: the browser has no way to learn who logged what.
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

  -- Confirmed, Task-backed Daily Update narrative only, for Tasks in this Project, one row per
  -- (task, date) with nothing but the text itself — no author, no Scheduled Time, no review
  -- metadata, no entries for any other Task/Project. A generic SELECT against daily_updates
  -- remains exactly as owner/team-scoped as before; this is the one narrow derived exception.
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

  return jsonb_build_object(
    'tasks', v_tasks,
    'timeEvidence', v_time_evidence,
    'dailyUpdateEvidence', v_daily_update_evidence
  );
end;
$$;

revoke execute on function public.get_client_report_weekly_evidence(uuid, date, date, text) from public, anon;
grant execute on function public.get_client_report_weekly_evidence(uuid, date, date, text) to authenticated, service_role;

-- generate_client_report gains one new optional parameter, p_history, so the Phase 9D generation
-- warnings this hotfix introduces (e.g. "completed Task had no legitimate tracked time — omitted")
-- can be persisted atomically with the report itself, using the exact same `"generation-warning"`
-- history-event shape the mock provider already writes — instead of a separate follow-up write (this
-- report has no other RPC for touching `history` alone, and a second round-trip would leave a window
-- where the row exists without its warnings). Defaulted to '[]'::jsonb so this is backward compatible
-- with the pre-9D-hotfix 5-argument call shape; the old 5-argument overload is dropped explicitly
-- (rather than left alongside) so there is only ever one real generation path again, matching the
-- rest of this table's "one RPC per mutation" pattern. Every other precondition/behavior (Project
-- lookup, can_access_project, range validation, Company/brand derivation) is byte-for-byte unchanged
-- from 20260820090000_client_reports_project_scope.sql, which is left untouched.
drop function if exists public.generate_client_report(uuid, text, date, date, jsonb);

create function public.generate_client_report(
  p_project_id uuid,
  p_range_label text,
  p_range_start date,
  p_range_end date,
  p_departments jsonb,
  p_history jsonb default '[]'::jsonb
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
    range_label, range_start, range_end, status, departments, history,
    generated_by, generated_by_name
  )
  values (
    v_project.id, v_company.id, v_company.name, v_brand.id, v_brand.name,
    p_range_label, p_range_start, p_range_end, 'draft', p_departments, coalesce(p_history, '[]'::jsonb),
    auth.uid(), v_generated_by_name
  )
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.generate_client_report(uuid, text, date, date, jsonb, jsonb) from public, anon;
grant execute on function public.generate_client_report(uuid, text, date, date, jsonb, jsonb) to authenticated, service_role;
