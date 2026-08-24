-- Phase 10 hierarchy-authorization hardening.
--
-- Root cause: Phase 10 (20260821190000) correctly widened `can_access_task` to grant one-hop
-- HIERARCHY READ visibility (parent assignee -> child, child assignee -> parent). That widening was
-- READ-only by design, but several MUTATION/side-effect paths were still gated by that same
-- `can_access_task` call, so they silently inherited hierarchy visibility as if it were operating
-- authority. Concretely: Parent P assigned only to Alicia, Child C (parent_task_id = P) assigned
-- only to Sam. Sam legitimately gets `can_access_task(P) = true` through the hierarchy branch, and
-- every write path gated on that alone (`create_subtask`, the `notes_insert` RLS policy,
-- `create_task_handoff`'s caller check, `list_handoff_candidates`, `get_task_time_rollup`,
-- `notify_task_assignment_changed`) would have let him act on P as if directly authorized.
--
-- Fix: introduce `can_access_task_directly` — pure pre-Phase-10 semantics, NO hierarchy branch —
-- and repoint every mutation/side-effect site at it. `can_access_task` itself is UNCHANGED and keeps
-- providing hierarchy READ visibility exactly as Phase 10 intended; every SELECT-only RLS policy
-- (`tasks_select`, `checklist_items_select`, `task_assignees_select`, `task_handoffs_select`,
-- `notes_select`) is left exactly as-is.
--
-- Forward-only: does not edit 20260821190000_one_level_subtasks.sql or any earlier migration.

-- ============================================================================
-- 1. can_access_task_directly — pure direct-access semantics, no hierarchy branch
-- ============================================================================
-- Reuses the EXISTING `can_user_access_task(candidate_id, target_task_id)` helper (predates Phase
-- 10, never modified by it, already the parameterized pre-Phase-10 `can_access_task` logic used for
-- Handoff-recipient validation) rather than re-implementing the same rule a third time. This is a
-- thin, single-argument "for the current caller" convenience wrapper around it.
--
-- Expected semantics (reproduced from `can_user_access_task`, unchanged):
--   Superadmin  -> true, organization-wide.
--   Supervisor  -> true if any assignee is a direct report (or self), OR the task is unassigned and
--                  the supervisor can access its Company — the exact pre-Phase-10 team rule.
--   Employee    -> true only if directly assigned AND can access the task's Company.
--   No parent/child inheritance in either direction.

create or replace function public.can_access_task_directly(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_user_access_task(auth.uid(), target_task_id);
$$;

revoke all on function public.can_access_task_directly(uuid) from public, anon;
grant execute on function public.can_access_task_directly(uuid) to authenticated, service_role;

comment on function public.can_access_task_directly(uuid) is
  'Pre-Phase-10 direct Task-access semantics, no hierarchy inheritance. Use this (never '
  'can_access_task) as the authorization gate for any MUTATION or side-effect on a Task — creating a '
  'Subtask, a Note, a Handoff, logging time, or the parent time roll-up. can_access_task remains the '
  'READ-only hierarchy-visibility helper for SELECT policies and presentation context.';

-- ============================================================================
-- 2. create_subtask — caller must have DIRECT access to the parent, not hierarchy-only visibility
-- ============================================================================
-- Body otherwise byte-for-byte identical to 20260821190000's version: one-level guard, server-side
-- context inheritance, verbatim create_task assignee-resolution logic, checklist insertion,
-- notify_task_created — none of that is weakened, only the access gate.

create or replace function public.create_subtask(
  p_parent_task_id uuid,
  p_title text,
  p_description text,
  p_assignee_ids uuid[],
  p_allow_unassigned boolean,
  p_status text,
  p_priority text,
  p_due_date date,
  p_expected_minutes integer,
  p_checklist_items text[]
)
returns tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.tasks;
  new_task public.tasks;
  effective_assignee_ids uuid[];
  self_added boolean;
  i int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into parent from public.tasks where id = p_parent_task_id;
  if not found then
    raise exception 'Parent Task not found.';
  end if;

  if not public.can_access_task_directly(p_parent_task_id) then
    raise exception 'You do not have access to that Task.';
  end if;

  if parent.parent_task_id is not null then
    raise exception 'Cannot create a Subtask under another Subtask — one level of nesting only.';
  end if;

  self_added := public.is_employee();

  if public.is_employee() then
    effective_assignee_ids := array[auth.uid()];
  elsif p_allow_unassigned and coalesce(array_length(p_assignee_ids, 1), 0) = 0 then
    effective_assignee_ids := '{}';
  elsif public.is_superadmin() then
    select coalesce(array_agg(u), '{}') into effective_assignee_ids
    from unnest(p_assignee_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
    if coalesce(array_length(effective_assignee_ids, 1), 0) = 0 then
      effective_assignee_ids := array[auth.uid()];
    end if;
  else
    select coalesce(array_agg(u), '{}') into effective_assignee_ids
    from unnest(p_assignee_ids) as u
    where exists (
      select 1 from public.profiles p
      where p.id = u and p.active and (p.id = auth.uid() or p.supervisor_id = auth.uid())
    );
    if coalesce(array_length(effective_assignee_ids, 1), 0) = 0 then
      effective_assignee_ids := array[auth.uid()];
    end if;
  end if;

  insert into public.tasks (
    title, description, company_id, workstream_id, status, priority, due_date, expected_minutes,
    created_by, self_added, activity_id, parent_task_id
  ) values (
    p_title, p_description, parent.company_id, parent.workstream_id, coalesce(p_status, 'todo'), coalesce(p_priority, 'medium'),
    p_due_date, p_expected_minutes, auth.uid(), self_added, parent.activity_id, p_parent_task_id
  )
  returning * into new_task;

  if coalesce(array_length(effective_assignee_ids, 1), 0) > 0 then
    insert into public.task_assignees (task_id, user_id)
    select new_task.id, u from unnest(effective_assignee_ids) as u;
  end if;

  if p_checklist_items is not null and array_length(p_checklist_items, 1) > 0 then
    for i in 1..array_length(p_checklist_items, 1) loop
      insert into public.checklist_items (task_id, description, position) values (new_task.id, p_checklist_items[i], i - 1);
    end loop;
  end if;

  perform public.notify_task_created(new_task.id, effective_assignee_ids, self_added);

  return new_task;
end;
$$;

revoke all on function public.create_subtask(uuid, text, text, uuid[], boolean, text, text, date, integer, text[]) from public, anon;
grant execute on function public.create_subtask(uuid, text, text, uuid[], boolean, text, text, date, integer, text[]) to authenticated, service_role;

-- ============================================================================
-- 3. Task Notes — WRITE requires direct access; READ keeps hierarchy visibility
-- ============================================================================
-- notes_select is UNCHANGED (still can_access_task — a hierarchy-visible Task's Notes may remain
-- readable, matching the existing Task read model). Only notes_insert's task-scoped branch changes;
-- the company-scoped branch (can_access_company) is untouched.

alter policy "notes_insert" on public.notes
  with check (
    (author_id = auth.uid())
    and (
      ((task_id is not null) and public.can_access_task_directly(task_id))
      or ((company_id is not null) and public.can_access_company(company_id))
    )
  );

-- ============================================================================
-- 4. Task Handoffs — caller must have DIRECT access to initiate; recipient rule unchanged
-- ============================================================================
-- Recipient eligibility (`can_user_access_task(p_handed_to_id, target_task_id)`) already reproduces
-- pure direct-access semantics — it was never widened by Phase 10 and needs no change. Only the
-- CALLER's own access gate changes.

create or replace function public.create_task_handoff(
  target_task_id uuid,
  p_handed_to_id uuid,
  p_work_done text,
  p_work_remaining text,
  p_blockers text
)
returns task_handoffs
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_handoff public.task_handoffs;
  task_title text;
  actor_name text;
  now_ts timestamptz := now();
begin
  if not public.can_access_task_directly(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  if not (
    exists (select 1 from public.profiles where id = p_handed_to_id and active)
    and public.can_user_access_task(p_handed_to_id, target_task_id)
  ) then
    raise exception 'That person doesn''t have access to this task.';
  end if;

  insert into public.task_handoffs (task_id, handed_by_id, handed_to_id, work_done, work_remaining, blockers, created_at)
  values (target_task_id, auth.uid(), p_handed_to_id, p_work_done, p_work_remaining, p_blockers, now_ts)
  returning * into new_handoff;

  select title into task_title from public.tasks where id = target_task_id;
  select full_name into actor_name from public.profiles where id = auth.uid();

  insert into public.notifications (recipient_id, type, message, related_task_id, read, created_at)
  values (p_handed_to_id, 'task-handoff', format('%s handed off "%s" to you', actor_name, task_title), target_task_id, false, now_ts);

  return new_handoff;
end;
$$;

revoke all on function public.create_task_handoff(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_task_handoff(uuid, uuid, text, text, text) to authenticated, service_role;

-- Candidate listing feeds directly into "who can I hand this off to" — the caller must have the same
-- direct access required to actually create the handoff. The per-candidate filter
-- (`can_user_access_task(p.id, ...)`) was already pure direct-access semantics and is unchanged.

create or replace function public.list_handoff_candidates(target_task_id uuid)
returns table(id uuid, full_name text, email text, role text, active boolean, supervisor_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.role, p.active, p.supervisor_id, p.created_at
  from public.profiles p
  where public.can_access_task_directly(target_task_id)
    and p.active
    and p.id <> auth.uid()
    and public.can_user_access_task(p.id, target_task_id);
$$;

revoke all on function public.list_handoff_candidates(uuid) from public, anon;
grant execute on function public.list_handoff_candidates(uuid) to authenticated, service_role;

-- ============================================================================
-- 5. get_task_time_rollup — the parent-inclusive aggregate requires DIRECT access to the target
-- ============================================================================
-- A child-only assignee (Sam) must not be able to request Parent P's rollup merely because
-- hierarchy read shows him Parent P's existence/title for context — that would hand him an
-- aggregate of every sibling Subtask's minutes (including ones he has no relationship to at all),
-- which is more than "Subtask of: Parent Task" ever needed to expose. Still exposes only two integer
-- sums, never raw time_entries rows/notes/user ids, for whoever DOES have direct access.

create or replace function public.get_task_time_rollup(target_task_id uuid)
returns table (own_minutes int, subtasks_minutes int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(te.duration_minutes) from public.time_entries te
      where te.task_id = target_task_id and te.duration_minutes is not null
    ), 0)::int as own_minutes,
    coalesce((
      select sum(te.duration_minutes)
      from public.tasks child
      join public.time_entries te on te.task_id = child.id
      where child.parent_task_id = target_task_id and te.duration_minutes is not null
    ), 0)::int as subtasks_minutes
  where public.can_access_task_directly(target_task_id);
$$;

revoke all on function public.get_task_time_rollup(uuid) from public, anon;
grant execute on function public.get_task_time_rollup(uuid) to authenticated, service_role;

-- ============================================================================
-- 6. notify_task_assignment_changed — closes a real notification-spoofing gap
-- ============================================================================
-- This RPC IS directly callable by authenticated end users (supabaseTasksProvider.updateTask calls
-- it straight from the browser after editing assignees) and its only gate was `can_access_task`.
-- With hierarchy read in place, a child-only assignee could have called this directly against the
-- parent (or vice versa) to inject an arbitrary "You were assigned to X" notification to any user id
-- — a real, independently-discovered issue while auditing every mutation/side-effect site, not
-- merely the scenario originally reported. Tightened to direct access; behavior for every legitimate
-- caller (an actual editor of the task) is completely unchanged.

create or replace function public.notify_task_assignment_changed(target_task_id uuid, newly_assigned_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
begin
  if not public.can_access_task_directly(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  select title into task_title from public.tasks where id = target_task_id;

  insert into public.notifications (recipient_id, type, message, related_task_id)
  select distinct u, 'task-assigned', format('You were assigned to "%s"', task_title), target_task_id
  from unnest(newly_assigned_ids) as u
  where u <> auth.uid();
end;
$$;

revoke all on function public.notify_task_assignment_changed(uuid, uuid[]) from public, anon;
grant execute on function public.notify_task_assignment_changed(uuid, uuid[]) to authenticated, service_role;

-- ============================================================================
-- 7. Time-logging entry points — proactive defense-in-depth (not independently exploitable)
-- ============================================================================
-- can_log_time_on_task (unchanged, assignment-only) is and remains the REAL, authoritative gate on
-- every one of these — a hierarchy-only viewer would already be rejected by it regardless of the
-- leading can_access_task pre-check. Tightened anyway so no mutation path is left silently resting
-- on hierarchy-widened logic even where a second gate happens to save it today — removes a fragile
-- "safe only incidentally" situation rather than an active vulnerability. Nothing else in these
-- functions changes: one-active-timer-per-user, Visit-overlap checks, Todo->In Progress transition.

create or replace function public.start_timer(target_task_id uuid)
returns time_entries
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
  if not public.can_access_task_directly(target_task_id) then
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

revoke all on function public.start_timer(uuid) from public, anon;
grant execute on function public.start_timer(uuid) to authenticated, service_role;

create or replace function public.resume_timer(paused_entry_id uuid)
returns time_entries
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
  if not public.can_access_task_directly(paused.task_id) then raise exception 'You don''t have access to this task.'; end if;
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

revoke all on function public.resume_timer(uuid) from public, anon;
grant execute on function public.resume_timer(uuid) to authenticated, service_role;

create or replace function public.create_manual_time_entry(
  target_task_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_duration_minutes integer,
  p_notes text,
  p_billable boolean
)
returns time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_entry public.time_entries;
  effective_end timestamptz;
begin
  if not public.can_access_task_directly(target_task_id) then
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

revoke all on function public.create_manual_time_entry(uuid, timestamptz, timestamptz, integer, text, boolean) from public, anon;
grant execute on function public.create_manual_time_entry(uuid, timestamptz, timestamptz, integer, text, boolean) to authenticated, service_role;

-- ============================================================================
-- Left unchanged, with reasoning (see the final report's complete audit table):
--   - can_access_task itself: unchanged, remains the READ-only hierarchy-visibility helper.
--   - tasks_select / checklist_items_select / task_assignees_select / task_handoffs_select /
--     notes_select (all SELECT-only RLS): unchanged — hierarchy-visible rows may remain readable.
--   - notify_task_created: unchanged — internal-only (no `authenticated` EXECUTE grant at all; only
--     reachable via create_task/create_subtask's own already-gated `perform` calls), not
--     independently exploitable.
--   - resolve_profile_directory: unchanged — a low-sensitivity read aggregate (full_name/role/
--     supervisor_id only, no time/notes/financials) whose whole purpose is resolving basic identity
--     for people/tasks already visible to the viewer; consistent with hierarchy read's own intent,
--     not a new authority.
--   - can_user_access_task: unchanged — already pure direct-access semantics, the exact logic
--     can_access_task_directly now reuses.
-- ============================================================================
