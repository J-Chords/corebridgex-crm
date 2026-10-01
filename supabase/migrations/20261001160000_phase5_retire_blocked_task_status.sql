-- Phase 5 (CD-214) — retire the Task status "blocked" in favor of "waiting".
--
-- Locked product decisions (Product Owner approved, see docs/decisions.md's Phase 5 entry):
--   1. Legacy `?status=blocked` filter/read state transparently behaves as `waiting` (app layer —
--      see `src/lib/data/task-status.ts`'s `normalizeLegacyTaskFilterStatus*` helpers). This
--      migration's own data conversion (step 2 below) is the hosted-data half of that compatibility
--      story — existing rows actually change value, they are not merely reinterpreted at read time.
--   2. Attention is deduplicated (overdue OR Waiting), already the Project-detail KPI's existing
--      formula (`src/app/dashboard/projects/[id]/page.tsx`) and now also the Dashboard "Needs
--      Attention" strip's (`src/components/my-day/needs-attention-strip.tsx`) — app-layer only, no
--      schema change needed for this one.
--   3. The Projects-list Team Lead table's separate Blocked column is removed, folded into Waiting
--      (app-layer only).
--   4. No new Task-status history/audit subsystem is introduced — existing rows may normalize
--      Blocked -> Waiting; historical decision/QA records stay untouched (documentation-only).
--   5. Legacy persisted FILTER state (sessionStorage, Saved Views) normalizes blocked -> waiting on
--      read; this migration's step 3 additionally backfills any hosted Saved View row defensively,
--      even though the pre-migration read-only audit found 0 affected rows.
--
-- WRITE compatibility is deliberately different from READ/FILTER compatibility: a caller attempting
-- to WRITE status = 'blocked' after this migration must be REJECTED outright (steps 4-6 below), not
-- silently converted. Only stale FILTER/read state is normalized.
--
-- Audited baseline (read-only, performed before this migration — see the Phase 5 audit report):
--   hosted Tasks: 15 total (6 not-started, 6 in-progress, 2 waiting, 0 blocked, 1 completed,
--   0 canceled). The 2 Waiting rows with a null status_reason are the same already-documented
--   legacy gap from 20260908120000_status_reason_legacy_compat.sql (IDs 7b18b47c.../599b9cc3...),
--   not new drift. hosted Saved Views: 2 total, 0 with filters->>'status' = 'blocked'.
--
-- This migration does NOT touch: create_task (its own status-membership validation is intentionally
-- left to the CHECK constraint below — see that function's own migration history), System B's
-- materialize_template_tasks (a separate, pre-existing, out-of-scope defect — still hardcodes the
-- stale 'todo' literal; not modified here), any authorization/RLS predicate (none reference status
-- values), or any historical migration file.

-- ============================================================================
-- 1. Data preflight — fail clearly, never fabricate a reason
-- ============================================================================

do $$
declare
  v_bad_count int;
begin
  select count(*) into v_bad_count
  from public.tasks
  where status = 'blocked' and (status_reason is null or btrim(status_reason) = '');

  if v_bad_count > 0 then
    raise exception
      'Phase 5 (CD-214) preflight failed: % Blocked Task(s) have a null/blank status_reason. '
      'Refusing to convert them to Waiting without a real reason — investigate before retrying. '
      'Do not fabricate reason text.', v_bad_count;
  end if;
end $$;

-- ============================================================================
-- 2. Task data conversion — status only; status_reason carries over unchanged
-- ============================================================================

update public.tasks
set status = 'waiting'
where status = 'blocked';

-- ============================================================================
-- 3. Saved View filter backfill — defensive; audited baseline found 0 affected rows
-- ============================================================================

update public.saved_views
set filters = jsonb_set(filters, '{status}', '"waiting"')
where filters->>'status' = 'blocked';

-- ============================================================================
-- 4. tasks_status_check — five-value allow-list, Blocked no longer a legal value
-- ============================================================================

alter table public.tasks drop constraint if exists tasks_status_check;

alter table public.tasks add constraint tasks_status_check
  check (status in ('not-started', 'in-progress', 'waiting', 'completed', 'canceled'));

-- ============================================================================
-- 5. enforce_task_invariants — Waiting-only reason requirement
-- ============================================================================
-- Based on the CURRENT/LATEST hosted definition (20260911100000_archived_workstream_task_guard.sql),
-- not the original Phase-1 version — byte-for-byte identical except the status_reason block (now
-- keyed on 'waiting' only) and its exception message. Every other invariant (parent/child hierarchy
-- guards — now removed upstream of this copy, matching the current hosted body exactly —, Company
-- derivation, archived-Workstream guard, inactive-Activity gate, workstream_activities-enabled
-- check) is preserved unchanged, including the legacy reason-gap compatibility bypass (still needed:
-- the 2 known historical Waiting rows still carry a null status_reason).

create or replace function public.enforce_task_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled_count int;
begin
  select w.company_id into new.company_id from public.workstreams w where w.id = new.workstream_id;
  if new.company_id is null then
    raise exception 'Workstream % not found.', new.workstream_id;
  end if;

  -- CD-162 final gap closure — a Task's workstream_id may never be NEWLY set to an archived
  -- (cancelled) Workstream. On INSERT this always applies; on UPDATE it only applies when
  -- workstream_id is actually changing — a Task that already lives on a since-archived Workstream
  -- keeps being editable on that same Workstream without complaint.
  if (TG_OP = 'INSERT' or new.workstream_id is distinct from old.workstream_id) then
    if exists (select 1 from public.workstreams w where w.id = new.workstream_id and w.status = 'cancelled') then
      raise exception 'This Service is archived — reactivate it before adding new Tasks.';
    end if;
  end if;

  -- Task Level Phase 1 — status_reason lifecycle: required exactly when Waiting, force-cleared the
  -- moment status is anything else. Applies uniformly to every write path (create_task,
  -- update_task_status, toggle_checklist_item's own auto-transition, and the general updateTask
  -- path) since this trigger fires on every INSERT/UPDATE regardless of which RPC/table-write
  -- performs it — never duplicated per-RPC. Phase 5 (CD-214) — Blocked retired; this rule now
  -- applies to Waiting only.
  if new.status = 'waiting' then
    if new.status_reason is null or btrim(new.status_reason) = '' then
      -- Legacy compatibility bypass (added 20260908120000) — see that migration's own header for the
      -- full root-cause writeup. Only a row that already had this exact gap, and is not having its
      -- status or reason changed, passes through; every other path still raises.
      if TG_OP = 'UPDATE' and old.status = new.status and (old.status_reason is null or btrim(old.status_reason) = '') then
        null;
      else
        raise exception 'A reason is required while this Task is % — describe what it''s waiting on.', new.status;
      end if;
    end if;
  else
    new.status_reason := null;
  end if;

  -- Task Level Phase 1 — an inactive Activity may never be NEWLY selected (create, or an edit that
  -- actually changes activity_id); an already-selected inactive Activity on an existing Task stays
  -- fully valid until the caller deliberately picks a different one (TG_OP = 'UPDATE' with an
  -- unchanged activity_id never re-checks is_active).
  if new.activity_id is not null and (TG_OP = 'INSERT' or new.activity_id is distinct from old.activity_id) then
    if not exists (select 1 from public.activities where id = new.activity_id and is_active) then
      raise exception 'That activity is inactive and cannot be newly selected for a Task.';
    end if;
  end if;

  if new.activity_id is null then
    return new;
  end if;
  select count(*) into enabled_count from public.workstream_activities wa where wa.workstream_id = new.workstream_id;
  if enabled_count = 0 then
    return new;
  end if;
  if not exists (
    select 1 from public.workstream_activities wa
    where wa.workstream_id = new.workstream_id and wa.activity_id = new.activity_id
  ) then
    raise exception 'That activity isn''t enabled for this workstream.';
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 6. update_task_status — five-value allow-list, Waiting-only reason handling
-- ============================================================================
-- Based on the current hosted definition (20260908090000_task_status_model_phase1.sql) — same
-- signature (no change needed, so no drop/re-grant churn), byte-for-byte identical except the
-- status allow-list and the status_reason case expression. Authorization (can_progress_task),
-- status-change metadata (status_changed_by/at), and the notification fan-out are all preserved
-- unchanged.

create or replace function public.update_task_status(target_task_id uuid, new_status text, p_status_reason text default null)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tasks;
  updated public.tasks;
  actor_role text;
  actor_supervisor_id uuid;
  status_label text;
begin
  select * into existing from public.tasks where id = target_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;
  if not public.can_progress_task(target_task_id) then
    raise exception 'You don''t have permission to update this task''s status.';
  end if;
  if new_status not in ('not-started', 'in-progress', 'waiting', 'completed', 'canceled') then
    raise exception 'Invalid status: %', new_status;
  end if;

  if new_status = existing.status then
    return existing;
  end if;

  -- status_reason lifecycle is also enforced by enforce_task_invariants (applies to every write
  -- path); passing it through here as well means a caller doesn't have to make a second round trip
  -- to clear it themselves.
  update public.tasks
  set status = new_status,
      status_reason = case when new_status = 'waiting' then p_status_reason else null end,
      status_changed_by = auth.uid(), status_changed_at = now(), updated_at = now()
  where id = target_task_id
  returning * into updated;

  select role, supervisor_id into actor_role, actor_supervisor_id from public.profiles where id = auth.uid();
  status_label := replace(new_status, '-', ' ');

  insert into public.notifications (recipient_id, type, message, related_task_id)
  select distinct ta.user_id, 'task-status-changed', format('Task "%s" changed to %s', updated.title, status_label), target_task_id
  from public.task_assignees ta
  where ta.task_id = target_task_id and ta.user_id <> auth.uid();

  if actor_role = 'employee' and actor_supervisor_id is not null then
    insert into public.notifications (recipient_id, type, message, related_task_id)
    values (actor_supervisor_id, 'task-status-changed', format('Task "%s" changed to %s', updated.title, status_label), target_task_id);
  end if;

  return updated;
end;
$$;

-- Signature is unchanged from the currently-hosted function, so existing privileges are preserved
-- by CREATE OR REPLACE alone; re-asserted explicitly here for auditability, not because they were
-- lost. No broadening: still authenticated + service_role only, anon excluded.
revoke all on function public.update_task_status(uuid, text, text) from public, anon;
grant execute on function public.update_task_status(uuid, text, text) to authenticated, service_role;
