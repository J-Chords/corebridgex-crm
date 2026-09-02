-- Admin Foundation Part 1 (acceptance-hardening pass) — deactivation completeness audit found that
-- hardening is_superadmin()/is_supervisor()/is_employee()/manages_user() (prior migration
-- 20260902090000) was NECESSARY but NOT SUFFICIENT. Many policies/helpers/RPCs across this schema
-- gate access via a RAW `<column> = auth.uid()` ownership check that never calls any of those four
-- functions at all — a deactivated user's session keeps satisfying those raw checks regardless of
-- the prior hardening. Confirmed via an exhaustive scan of every SECURITY DEFINER function for
-- `auth.uid()` usage cross-referenced against every known authorization helper.
--
-- New canonical helper: is_current_user_active() — the single choke point every fix below composes,
-- rather than re-deriving the same "select exists(... and active)" query in dozens of places.
--
-- Deliberately NOT touched (documented, not silently left broken):
--   - profiles_select's `id = auth.uid()` branch — a deactivated user's own client must still be
--     able to read their own profile row (to learn active=false and cleanly log out /
--     be gated), so this one raw self-check is an intentional exception.
--   - complete_required_password_change() — self-only, mutates nothing but the caller's own
--     credential-flow bookkeeping; not operational product data, harmless even if a deactivated
--     user's stale session calls it.
--   - can_correct_time_entry() — already safe: its own gate is `not is_employee() and auth.uid() <>
--     target and (is_superadmin() or manages_user(target))`, and is_superadmin()/manages_user() are
--     both already active-gated by the prior migration, so no raw bypass exists here.

create or replace function public.is_current_user_active()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$function$;

revoke all on function public.is_current_user_active() from public, anon;
grant execute on function public.is_current_user_active() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Composable read/write authorization helpers — wrap the entire existing body
-- in "is_current_user_active() and (...)" so every raw self-branch inside them
-- (plain assignee, self_added creator, owner/member ids) is closed at once.
-- ---------------------------------------------------------------------------

create or replace function public.can_access_company(target_company_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and (
      public.is_superadmin()
      or exists (
        select 1 from public.companies where id = target_company_id and is_internal
      )
      or exists (
        select 1 from public.user_companies uc
        where uc.company_id = target_company_id
          and (
            uc.user_id = auth.uid()
            or public.manages_user(uc.user_id)
          )
      )
      or exists (
        select 1 from public.projects p
        where p.company_id = target_company_id
          and (p.owner_id = auth.uid() or public.manages_user(p.owner_id))
      )
      or exists (
        select 1 from public.project_members pm
        join public.projects p on p.id = pm.project_id
        where p.company_id = target_company_id
          and (pm.user_id = auth.uid() or public.manages_user(pm.user_id))
      )
    );
$function$;

create or replace function public.can_access_project(target_project_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and (
      public.is_superadmin()
      or exists (
        select 1 from public.projects p
        join public.companies c on c.id = p.company_id
        where p.id = target_project_id and c.is_internal
      )
      or exists (
        select 1 from public.projects p
        where p.id = target_project_id and public.manages_user(p.owner_id)
      )
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = target_project_id and public.manages_user(pm.user_id)
      )
    );
$function$;

create or replace function public.can_access_workstream(target_workstream_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and (
      public.is_superadmin()
      or exists (
        select 1 from public.workstreams w
        join public.companies c on c.id = w.company_id
        where w.id = target_workstream_id and c.is_internal
      )
      or exists (
        select 1 from public.workstreams w
        where w.id = target_workstream_id and public.manages_user(w.lead_user_id)
      )
      or exists (
        select 1 from public.workstream_members m
        where m.workstream_id = target_workstream_id and public.manages_user(m.user_id)
      )
      or exists (
        select 1 from public.tasks t
        join public.task_assignees ta on ta.task_id = t.id
        where t.workstream_id = target_workstream_id
          and ta.user_id = auth.uid()
          and public.can_access_company(t.company_id)
      )
    );
$function$;

create or replace function public.can_access_task(target_task_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and (
      public.is_superadmin()
      or (
        public.is_supervisor()
        and (
          exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and public.manages_user(ta.user_id))
          or (
            not exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id)
            and exists (select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id))
          )
        )
      )
      or (
        exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = auth.uid())
        and exists (select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id))
      )
      or (
        exists (
          select 1 from public.tasks child
          join public.task_assignees pa on pa.task_id = child.parent_task_id
          where child.id = target_task_id and pa.user_id = auth.uid()
        )
        and exists (select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id))
      )
      or (
        exists (
          select 1 from public.tasks c
          join public.task_assignees ca on ca.task_id = c.id
          where c.parent_task_id = target_task_id and ca.user_id = auth.uid()
        )
        and exists (select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id))
      )
    );
$function$;

create or replace function public.can_edit_task(target_task_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and (
      public.is_superadmin()
      or (public.is_supervisor() and public.can_access_task_directly(target_task_id))
      or exists (
        select 1 from public.tasks t
        where t.id = target_task_id and t.self_added and t.created_by = auth.uid()
      )
    );
$function$;

create or replace function public.can_progress_task(target_task_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and (
      public.is_superadmin()
      or (public.is_supervisor() and public.can_access_task_directly(target_task_id))
      or exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = auth.uid())
    );
$function$;

create or replace function public.can_log_time_on_task(target_task_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and exists (
      select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = auth.uid()
    );
$function$;

-- can_user_access_company / can_user_access_task take an explicit candidate_id (not always
-- auth.uid() — see create_task_handoff/list_handoff_candidates, which check a THIRD PARTY's
-- eligibility). Gate on the CANDIDATE's own active status, not the caller's — this also correctly
-- covers can_access_task_directly (= can_user_access_task(auth.uid(), ...)), closing the notes_insert/
-- create_manual_time_entry/start_timer/resume_timer bypass, since candidate_id = auth.uid() there.
create or replace function public.can_user_access_company(candidate_id uuid, target_company_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    exists (select 1 from public.profiles where id = candidate_id and active)
    and (
      exists (select 1 from public.profiles where id = candidate_id and role = 'superadmin')
      or exists (select 1 from public.companies where id = target_company_id and is_internal)
      or exists (
        select 1 from public.user_companies uc
        where uc.company_id = target_company_id
          and (
            uc.user_id = candidate_id
            or (
              exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
              and exists (select 1 from public.profiles where id = uc.user_id and supervisor_id = candidate_id)
            )
          )
      )
      or exists (
        select 1 from public.projects p
        where p.company_id = target_company_id
          and (
            p.owner_id = candidate_id
            or (
              exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
              and exists (select 1 from public.profiles where id = p.owner_id and supervisor_id = candidate_id)
            )
          )
      )
      or exists (
        select 1 from public.project_members pm
        join public.projects p on p.id = pm.project_id
        where p.company_id = target_company_id
          and (
            pm.user_id = candidate_id
            or (
              exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
              and exists (select 1 from public.profiles where id = pm.user_id and supervisor_id = candidate_id)
            )
          )
      )
    );
$function$;

create or replace function public.can_user_access_task(candidate_id uuid, target_task_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    exists (select 1 from public.profiles where id = candidate_id and active)
    and (
      exists (select 1 from public.profiles where id = candidate_id and role = 'superadmin')
      or (
        exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
        and (
          exists (
            select 1 from public.task_assignees ta
            join public.profiles p on p.id = ta.user_id
            where ta.task_id = target_task_id and (p.id = candidate_id or p.supervisor_id = candidate_id)
          )
          or (
            not exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id)
            and exists (
              select 1 from public.tasks t
              where t.id = target_task_id and public.can_user_access_company(candidate_id, t.company_id)
            )
          )
        )
      )
      or (
        exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = candidate_id)
        and exists (
          select 1 from public.tasks t
          where t.id = target_task_id and public.can_user_access_company(candidate_id, t.company_id)
        )
      )
    );
$function$;

create or replace function public.has_reporting_review_access()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_superadmin()
    or (
      public.is_current_user_active()
      and coalesce((select reporting_review_access from public.profiles where id = auth.uid()), false)
    );
$function$;

create or replace function public.can_view_accomplishments_report(target_report_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and exists (
      select 1 from public.accomplishments_reports r
      where r.id = target_report_id
        and (
          (r.kind = 'person' and r.subject_user_id = auth.uid())
          or (r.kind = 'client' and r.generated_by = auth.uid())
          or (
            not public.is_employee()
            and public.manages_user(case when r.kind = 'person' then r.subject_user_id else r.generated_by end)
          )
        )
    );
$function$;

create or replace function public.can_view_client_report(target_report_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    public.is_current_user_active()
    and exists (
      select 1 from public.client_reports r
      where r.id = target_report_id
        and (
          r.generated_by = auth.uid()
          or (not public.is_employee() and public.manages_user(r.generated_by))
          or public.has_reporting_review_access()
        )
    );
$function$;

-- ---------------------------------------------------------------------------
-- Leaf RPCs with their own raw `<owner column> = auth.uid()` gate that never
-- called any composable helper above — each gets one guard clause at the top,
-- calling the same canonical is_current_user_active(), never a re-derived check.
-- ---------------------------------------------------------------------------

create or replace function public.acknowledge_task_handoff(target_handoff_id uuid)
 returns task_handoffs
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.task_handoffs;
  updated public.task_handoffs;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.task_handoffs where id = target_handoff_id;
  if not found then
    raise exception 'Handoff not found.';
  end if;
  if existing.handed_to_id <> auth.uid() or existing.acknowledged_at is not null then
    raise exception 'Only the recipient can acknowledge this handoff.';
  end if;

  update public.task_handoffs
  set acknowledged_by_id = auth.uid(), acknowledged_at = now()
  where id = target_handoff_id
  returning * into updated;
  return updated;
end;
$function$;

create or replace function public.complete_visit_entry(target_entry_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone)
 returns visit_entries
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.visit_entries;
  v_local_start date;
  v_local_end date;
  result public.visit_entries;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
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
$function$;

create or replace function public.confirm_my_daily_update(target_update_id uuid)
 returns daily_updates
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.daily_updates;
  result public.daily_updates;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.daily_updates where id = target_update_id;
  if not found then
    raise exception 'Daily update not found.';
  end if;
  if existing.user_id <> auth.uid() or existing.status <> 'draft' then
    raise exception 'Only the owner can confirm their daily update, and only while it''s still a draft.';
  end if;

  update public.daily_updates
  set status = 'confirmed', confirmed_at = now(), updated_at = now()
  where id = target_update_id
  returning * into result;
  return result;
end;
$function$;

create or replace function public.finalize_accomplishments_report(target_report_id uuid)
 returns accomplishments_reports
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.accomplishments_reports;
  result public.accomplishments_reports;
  event_type text;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status = 'finalized' then return existing; end if;
  if not (
    (existing.kind = 'person' and existing.subject_user_id = auth.uid())
    or (existing.kind = 'client' and existing.generated_by = auth.uid())
  ) then
    raise exception 'Only the report''s owner can edit its entries.';
  end if;

  event_type := case when jsonb_path_exists(existing.history, '$[*] ? (@.type == "finalized" || @.type == "re-finalized")')
    then 're-finalized' else 'finalized' end;

  update public.accomplishments_reports
  set status = 'finalized', finalized_at = now(), updated_at = now(),
      history = existing.history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'type', event_type, 'actorId', auth.uid(),
        'actorName', (select full_name from public.profiles where id = auth.uid()), 'createdAt', now()
      ))
  where id = target_report_id
  returning * into result;
  return result;
end;
$function$;

create or replace function public.mark_all_notifications_read()
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  update public.notifications
  set read = true
  where recipient_id = auth.uid() and not read and public.is_current_user_active();
$function$;

create or replace function public.pause_timer(target_entry_id uuid)
 returns time_entries
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  entry public.time_entries;
  updated public.time_entries;
  pause_ts timestamptz;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
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
$function$;

create or replace function public.reopen_accomplishments_report(target_report_id uuid)
 returns accomplishments_reports
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.accomplishments_reports;
  result public.accomplishments_reports;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'finalized' then
    raise exception 'Only a finalized report can be reopened.';
  end if;
  if not (
    (existing.kind = 'person' and existing.subject_user_id = auth.uid())
    or (existing.kind = 'client' and existing.generated_by = auth.uid())
  ) then
    raise exception 'Only the report''s owner can reopen it.';
  end if;

  update public.accomplishments_reports
  set status = 'draft', finalized_at = null, updated_at = now(),
      history = existing.history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'type', 'reopened', 'actorId', auth.uid(),
        'actorName', (select full_name from public.profiles where id = auth.uid()), 'createdAt', now()
      ))
  where id = target_report_id
  returning * into result;
  return result;
end;
$function$;

create or replace function public.reopen_client_report(target_report_id uuid)
 returns client_reports
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.client_reports;
  result public.client_reports;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'finalized' then
    raise exception 'Only a finalized report can be reopened.';
  end if;
  if existing.generated_by <> auth.uid() then
    raise exception 'Only the report''s owner can reopen it.';
  end if;

  update public.client_reports
  set status = 'draft', finalized_at = null, updated_at = now(),
      history = existing.history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'type', 'reopened', 'actorId', auth.uid(),
        'actorName', (select full_name from public.profiles where id = auth.uid()), 'createdAt', now()
      ))
  where id = target_report_id
  returning * into result;
  return result;
end;
$function$;

create or replace function public.reopen_my_daily_update(target_update_id uuid)
 returns daily_updates
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.daily_updates;
  result public.daily_updates;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.daily_updates where id = target_update_id;
  if not found then
    raise exception 'Daily update not found.';
  end if;
  if existing.user_id <> auth.uid() or existing.status <> 'confirmed' then
    raise exception 'Only the owner can reopen their daily update, and only while it''s confirmed.';
  end if;

  update public.daily_updates
  set status = 'draft', confirmed_at = null, reviewed_at = null, reviewed_by = null, reviewed_by_name = null, updated_at = now()
  where id = target_update_id
  returning * into result;
  return result;
end;
$function$;

create or replace function public.stop_timer(target_entry_id uuid)
 returns time_entries
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  entry public.time_entries;
  updated public.time_entries;
  stop_ts timestamptz;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
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
$function$;

create or replace function public.update_accomplishments_report_draft(target_report_id uuid, p_brand_sections jsonb)
 returns accomplishments_reports
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.accomplishments_reports;
  result public.accomplishments_reports;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'draft' then
    raise exception 'This report is finalized and can no longer be edited.';
  end if;
  if not (
    (existing.kind = 'person' and existing.subject_user_id = auth.uid())
    or (existing.kind = 'client' and existing.generated_by = auth.uid())
  ) then
    raise exception 'Only the report''s owner can edit its entries.';
  end if;

  update public.accomplishments_reports
  set brand_sections = p_brand_sections, updated_at = now()
  where id = target_report_id
  returning * into result;
  return result;
end;
$function$;

create or replace function public.update_client_report_draft(target_report_id uuid, p_departments jsonb)
 returns client_reports
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.client_reports;
  result public.client_reports;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'draft' then
    raise exception 'This report is finalized and can no longer be edited.';
  end if;
  if existing.generated_by <> auth.uid() then
    raise exception 'Only the report''s owner can edit its entries.';
  end if;

  update public.client_reports
  set departments = p_departments, updated_at = now()
  where id = target_report_id
  returning * into result;
  return result;
end;
$function$;

create or replace function public.update_visit_plan(target_entry_id uuid, p_visit_date date, p_agenda text)
 returns visit_entries
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.visit_entries;
  v_today date;
  result public.visit_entries;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
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
$function$;

create or replace function public.upsert_my_daily_update_draft(target_date date, p_entries jsonb)
 returns daily_updates
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.daily_updates;
  result public.daily_updates;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.daily_updates where user_id = auth.uid() and date = target_date;

  if found and existing.status = 'confirmed' then
    return existing;
  end if;

  if found then
    update public.daily_updates
    set entries = p_entries, updated_at = now()
    where id = existing.id
    returning * into result;
    return result;
  end if;

  insert into public.daily_updates (user_id, date, status, entries)
  values (auth.uid(), target_date, 'draft', p_entries)
  returning * into result;
  return result;
end;
$function$;

-- ---------------------------------------------------------------------------
-- RLS policies whose qual/with_check was a raw self-check with no helper call
-- at all (Time, Visits, Notifications, Saved Views).
-- ---------------------------------------------------------------------------

drop policy if exists "time_entries_select" on public.time_entries;
create policy "time_entries_select" on public.time_entries
  for select using (public.is_current_user_active() and (user_id = auth.uid() or public.manages_user(user_id)));

drop policy if exists "time_entry_corrections_select" on public.time_entry_corrections;
create policy "time_entry_corrections_select" on public.time_entry_corrections
  for select using (
    public.is_current_user_active()
    and exists (
      select 1 from public.time_entries te
      where te.id = time_entry_corrections.time_entry_id
        and (te.user_id = auth.uid() or public.manages_user(te.user_id))
    )
  );

drop policy if exists "visit_entries_select" on public.visit_entries;
create policy "visit_entries_select" on public.visit_entries
  for select using (public.is_current_user_active() and (user_id = auth.uid() or public.manages_user(user_id)));

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (public.is_current_user_active() and recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update
  using (public.is_current_user_active() and recipient_id = auth.uid())
  with check (public.is_current_user_active() and recipient_id = auth.uid());

drop policy if exists "saved_views_select" on public.saved_views;
create policy "saved_views_select" on public.saved_views
  for select using (public.is_current_user_active() and user_id = auth.uid());

drop policy if exists "saved_views_insert" on public.saved_views;
create policy "saved_views_insert" on public.saved_views
  for insert with check (public.is_current_user_active() and user_id = auth.uid());

drop policy if exists "saved_views_update" on public.saved_views;
create policy "saved_views_update" on public.saved_views
  for update
  using (public.is_current_user_active() and user_id = auth.uid())
  with check (public.is_current_user_active() and user_id = auth.uid());

drop policy if exists "saved_views_delete" on public.saved_views;
create policy "saved_views_delete" on public.saved_views
  for delete using (public.is_current_user_active() and user_id = auth.uid());
