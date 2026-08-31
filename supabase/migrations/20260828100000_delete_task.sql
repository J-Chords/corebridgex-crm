-- Phase 13 (Task Edit/Delete correction) — a real, safe Task delete capability.
--
-- Audited first, per instruction, rather than assumed: today NO authenticated role can delete a
-- Task at all. `tasks`' own grants are `grant select, insert, update on public.tasks to
-- authenticated` (20260814090002_tasks.sql) — no `delete`, and no DELETE RLS policy exists either.
-- `20260821190000_one_level_subtasks.sql`'s own comment on `parent_task_id` says exactly this:
-- "no authenticated role can hard-delete a Task at all today." So Task delete is a genuinely NEW
-- capability, not a UI gap in front of an existing safe backend — this migration is the necessary
-- new surface, deliberately narrow and SECURITY DEFINER, exactly like every other Phase 7-13
-- mutation RPC in this codebase.
--
-- Authorization: reuses `public.can_edit_task(target_task_id)` directly (defined in
-- 20260814090002_tasks.sql — Supervisor/Superadmin unconditional, or the Employee who self-added
-- the Task) — the exact same boundary already gates `tasks_update`/`checklist_items_write`. Not a
-- new, narrower-or-wider "can_delete_task" approximation: an Employee may delete a Task only under
-- the identical condition they may already edit every field of it.
--
-- Safety (the actual point of this migration): a raw `delete from tasks` would CASCADE per the
-- existing FK definitions — `time_entries.task_id`, `notes.task_id`, `checklist_items.task_id`,
-- `task_assignees.task_id`, and `task_handoffs.task_id` are all `on delete cascade`, and
-- `tasks.parent_task_id` is `on delete restrict` (a Task with live Subtasks can't be deleted at the
-- DB level at all — Postgres would raise a bare FK-violation error). Silently letting a Task
-- delete cascade away logged TimeEntry history or notes would destroy exactly the "financial/
-- reporting evidence" this phase's own instructions say must never be silently lost. Client Report
-- history is NOT at risk either way — `client_reports.departments`/`history` are `jsonb` snapshots
-- with no live FK back to `tasks` at all (20260814110006_client_reports.sql) — a Task's own life
-- cycle can never affect already-generated report content.
--
-- This RPC therefore BLOCKS deletion (raising a specific, truthful, UI-facing message — never a
-- bare Postgres FK-violation) whenever the Task has:
--   1. any logged TimeEntry — real effort/financial history, never silently destroyed;
--   2. any Subtask — mirrors the DB's own `on delete restrict`, with a clear message instead of a
--      raw constraint-violation error;
--   3. any Note attached directly to it — a Task-scoped Shared Note is real recorded context.
-- Only a genuinely "safe to remove" Task (no logged time, no Subtasks, no attached notes) is ever
-- actually hard-deleted. `task_assignees`/`checklist_items`/`task_handoffs` are allowed to cascade
-- silently in that safe case — they are structural to the one Task being removed, not independent
-- evidence (matching the same structural/evidence distinction the audit was asked to draw).
--
-- Pre-apply security review (final pass, before hosted apply) — one real gap found and fixed:
-- TOCTOU/race safety. The original version checked dependencies (COUNT queries) and only then
-- issued a plain `delete from tasks`, with no lock held across that gap. A concurrent transaction
-- could, in principle, INSERT a new `time_entries`/`notes` row (or a new Subtask `tasks` row)
-- referencing this exact `p_task_id` AFTER this function's own COUNT check ran clean but BEFORE its
-- DELETE executed. Because `time_entries.task_id`/`notes.task_id` are `on delete cascade` (not
-- restrict), that race would let the DELETE proceed and silently cascade away the very row this
-- migration exists to protect — exactly the silent-evidence-loss failure mode this whole feature
-- is designed to prevent, just moved into a narrow timing window instead of the ordinary case.
--
-- Fixed with a real, standard Postgres mechanism (never "RPCs are transactional" hand-waving):
-- `select ... for update` on the target `tasks` row, done FIRST, before any dependency check runs.
-- Postgres already implicitly takes a `FOR KEY SHARE` lock on a referenced parent row for any
-- INSERT into a table with a foreign key pointing at it (`time_entries.task_id`, `notes.task_id`,
-- and `tasks.parent_task_id` for a new Subtask all qualify) — and `FOR KEY SHARE` conflicts with
-- `FOR UPDATE`. So once this function holds `FOR UPDATE` on the target Task row:
--   - any concurrent INSERT of a TimeEntry/Note/Subtask referencing this Task blocks until this
--     function's transaction ends (commit or rollback) — it can never sneak in between the checks
--     below and the final DELETE;
--   - conversely, if such an insert was already committed before this function started, this
--     function's own COUNT checks (which run AFTER acquiring the lock, so they see current
--     committed state) correctly see it and block deletion.
-- Either way, the check-then-act window is closed by ordinary MVCC/lock semantics, not an assumption
-- about statement ordering. If a raced concurrent INSERT is still in-flight when this function's
-- transaction ends by successfully deleting the Task, that blocked INSERT resumes afterward and
-- fails with a real foreign-key-violation (the parent row it referenced no longer exists) — a loud,
-- honest error instead of a silent cascade, and the exact same outcome Postgres would give without
-- this RPC existing at all.
--
-- Existence-then-permission error ordering (`Task not found.` before the `can_edit_task` check)
-- matches this codebase's own established convention exactly (`update_task_status`,
-- `toggle_checklist_item` — see 20260814090002_tasks.sql) rather than introducing a new one; not a
-- new information-disclosure decision made in isolation for this RPC.
--
-- Legacy Subtask delete policy (explicit decision, not inherited by accident): a Subtask that is
-- itself otherwise safe to delete (no logged time, no attached Notes — a Subtask can never have its
-- own children, nesting is one level only) MAY be deleted under the exact same `can_edit_task`
-- boundary as any other Task. This is not a new or looser rule: a Subtask already behaves as a full,
-- independently mutable Task in every other respect today (its own status changes, checklist,
-- time-logging, and field edits are all already unrestricted by `updateTask`/`update_task_status`
-- — only its Workstream/Activity context is locked to its parent's). The "historical Subtasks
-- remain viewable" rule this product locks is about never hiding or silently converting a Subtask
-- that carries real completed work — which this RPC already fully honors, identically to a
-- top-level Task, via the same TimeEntry/Note blockers above. An empty, never-actually-used legacy
-- Subtask carries no historical substance those blockers exist to protect, so there is nothing
-- inconsistent about allowing its removal. Deleting a Subtask never touches its parent Task row.
--
-- LOCAL ONLY. NOT APPLIED. This is exactly the "if a new security-sensitive delete RPC/schema
-- change would be required" case the instructions anticipated — reported as a blocker requiring
-- explicit security review/authorization before hosted apply, not applied automatically.

create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked_id uuid;
  v_time_entry_count int;
  v_subtask_count int;
  v_note_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  -- Lock the target row FIRST, before any dependency check — see this migration's own header
  -- comment for exactly why this closes the TimeEntry/Note/Subtask insert race.
  select id into v_locked_id from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found.';
  end if;

  if not public.can_edit_task(p_task_id) then
    raise exception 'You do not have permission to delete this task.';
  end if;

  select count(*) into v_time_entry_count from public.time_entries where task_id = p_task_id;
  if v_time_entry_count > 0 then
    raise exception 'This task has logged time against it and can''t be deleted. Close it out instead of removing it.';
  end if;

  select count(*) into v_subtask_count from public.tasks where parent_task_id = p_task_id;
  if v_subtask_count > 0 then
    raise exception 'This task has subtasks and can''t be deleted. Remove or reassign its subtasks first.';
  end if;

  select count(*) into v_note_count from public.notes where task_id = p_task_id;
  if v_note_count > 0 then
    raise exception 'This task has notes attached and can''t be deleted.';
  end if;

  delete from public.tasks where id = p_task_id;
end;
$$;

revoke all on function public.delete_task(uuid) from public;
revoke all on function public.delete_task(uuid) from anon;
grant execute on function public.delete_task(uuid) to authenticated, service_role;
