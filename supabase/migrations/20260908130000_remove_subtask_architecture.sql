-- Task Level Phase 1 — final Subtask removal. Product Owner decision is final: THERE ARE NO
-- SUBTASKS IN COREBRIDGE X. Final hierarchy: Project -> Service -> Activity -> Task -> Checklist.
-- Unexpected additional work becomes another ordinary Task.
--
-- Pre-migration hosted audit (read-only, performed before this file): exactly 1 Task had
-- parent_task_id NOT NULL — `9ff9aa13-f2d9-4aaf-b548-a03cfa8be521` ("Phase 10 Child"), parented under
-- `d8993d05-7395-4fb7-b51f-08ad6d86fbbc` ("Phase 10 Manual Test Parent"). Its own relationships were
-- captured before this migration: 1 assignee, 2 checklist items (both open), 0 time entries, 0
-- comments, 0 notes, 0 handoffs, 0 documents, 0 linked issues — nothing to migrate or preserve beyond
-- the row itself, which this migration does not delete, recreate, or alter in any business field.
--
-- Ordering matters: the CURRENTLY hosted enforce_task_invariants forbids changing parent_task_id at
-- all ("A Task's parent cannot be changed after creation"), so the trigger is replaced with its
-- Subtask-free version FIRST — only then can the one existing child row be flattened via a plain
-- UPDATE. Every other function below is a `create or replace`/`drop` against the exact signature
-- read back live from hosted immediately before writing this migration (never reconstructed from
-- memory or an earlier file).

-- ============================================================================
-- 1. enforce_task_invariants — drop every Subtask-hierarchy block, keep everything else
-- ============================================================================
-- Byte-for-byte identical to the currently-hosted body (fresh read-back) MINUS: the parent-
-- immutability check, the "this Task has Subtasks so Service/Activity can't change" guard, the
-- parent-Task lookup/nesting-depth/workstream-activity-company-match block, and the `parent`
-- variable those blocks used. status_reason lifecycle (incl. the legacy compatibility bypass),
-- inactive-Activity gate, workstream_activities-enabled check, and company derivation are untouched.

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

  -- Task Level Phase 1 — status_reason lifecycle: required exactly when Waiting/Blocked, force-
  -- cleared the moment status is anything else. Applies uniformly to every write path (create_task,
  -- update_task_status, toggle_checklist_item's own auto-transition, and the general updateTask
  -- path) since this trigger fires on every INSERT/UPDATE regardless of which RPC/table-write
  -- performs it — never duplicated per-RPC.
  if new.status in ('waiting', 'blocked') then
    if new.status_reason is null or btrim(new.status_reason) = '' then
      -- Legacy compatibility bypass (added 20260908120000) — see that migration's own header for the
      -- full root-cause writeup. Only a row that already had this exact gap, and is not having its
      -- status or reason changed, passes through; every other path still raises.
      if TG_OP = 'UPDATE' and old.status = new.status and (old.status_reason is null or btrim(old.status_reason) = '') then
        null;
      else
        raise exception 'A reason is required while this Task is % — describe what it''s waiting on or blocked by.', new.status;
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
-- 2. Flatten the one existing child Task in place — same row, same id, no business field touched
-- ============================================================================

update public.tasks set parent_task_id = null where id = '9ff9aa13-f2d9-4aaf-b548-a03cfa8be521';

-- Safety assertion — abort the whole migration (transactional) if hosted data ever drifted from the
-- audited count between the read-only audit and this apply.
do $$
declare
  remaining int;
begin
  select count(*) into remaining from public.tasks where parent_task_id is not null;
  if remaining <> 0 then
    raise exception 'Expected 0 Tasks with parent_task_id set after flattening, found %.', remaining;
  end if;
end;
$$;

-- ============================================================================
-- 3. Drop the column — cascades away its own FK constraint (tasks_parent_task_id_fkey) and index
--    (tasks_parent_task_id_idx) automatically; no dependent view exists (verified before writing
--    this migration).
-- ============================================================================

alter table public.tasks drop column parent_task_id;

-- ============================================================================
-- 4. delete_task — drop the "has Subtasks" blocker only, every other historical blocker unchanged
-- ============================================================================

create or replace function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked_id uuid;
  v_time_entry_count int;
  v_note_count int;
  v_document_count int;
  v_comment_count int;
  v_handoff_count int;
  v_issue_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

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

  select count(*) into v_note_count from public.notes where task_id = p_task_id;
  if v_note_count > 0 then
    raise exception 'This task has notes attached and can''t be deleted.';
  end if;

  select count(*) into v_document_count from public.documents where task_id = p_task_id;
  if v_document_count > 0 then
    raise exception 'This task has attached files and can''t be deleted. Remove or permanently purge its attachments first.';
  end if;

  select count(*) into v_comment_count from public.project_comments where task_id = p_task_id and deleted_at is null;
  if v_comment_count > 0 then
    raise exception 'This task has comments and can''t be deleted.';
  end if;

  select count(*) into v_handoff_count from public.task_handoffs where task_id = p_task_id;
  if v_handoff_count > 0 then
    raise exception 'This task has handoff history and can''t be deleted.';
  end if;

  select count(*) into v_issue_count from public.project_issues where task_id = p_task_id;
  if v_issue_count > 0 then
    raise exception 'This task is linked to a Project Issue and can''t be deleted. Unlink it from the Issue first.';
  end if;

  delete from public.tasks where id = p_task_id;
end;
$$;

-- ============================================================================
-- 5. toggle_checklist_item — drop the open_subtasks gate only, auto-completion logic unchanged
-- ============================================================================

create or replace function public.toggle_checklist_item(target_item_id uuid, p_is_done boolean)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_task_id uuid;
  existing public.tasks;
  updated public.tasks;
  total_count int;
  done_count int;
  next_status text;
begin
  select task_id into target_task_id from public.checklist_items where id = target_item_id;
  if not found then
    raise exception 'Checklist item not found.';
  end if;
  if not public.can_progress_task(target_task_id) then
    raise exception 'You don''t have permission to update this task''s checklist.';
  end if;

  update public.checklist_items
  set is_done = p_is_done,
      completed_by = case when p_is_done then auth.uid() else null end,
      completed_at = case when p_is_done then now() else null end
  where id = target_item_id;

  select * into existing from public.tasks where id = target_task_id;

  select count(*), count(*) filter (where ci.is_done) into total_count, done_count
  from public.checklist_items ci where ci.task_id = target_task_id;

  next_status := null;
  if total_count > 0 then
    if done_count = total_count and existing.status <> 'completed' then
      next_status := 'completed';
    elsif done_count < total_count and existing.status = 'completed' then
      next_status := 'in-progress';
    end if;
  end if;

  if next_status is null then
    return existing;
  end if;

  update public.tasks
  set status = next_status, status_changed_by = auth.uid(), status_changed_at = now(), updated_at = now()
  where id = target_task_id
  returning * into updated;

  insert into public.notifications (recipient_id, type, message, related_task_id)
  select distinct ta.user_id, 'task-status-changed', format('Task "%s" changed to %s', updated.title, replace(next_status, '-', ' ')), target_task_id
  from public.task_assignees ta
  where ta.task_id = target_task_id and ta.user_id <> auth.uid();

  return updated;
end;
$$;

-- ============================================================================
-- 6. can_access_task — drop the two Subtask-hierarchy OR-branches, core access rule unchanged
-- ============================================================================
-- Removed: "target is a Subtask and I'm assigned to its parent" and "target is a parent and I'm
-- assigned to one of its Subtasks" — both permanently vacuous now that parent_task_id no longer
-- exists. can_access_task_directly (the narrow gate used by mutation RPCs) never referenced
-- parent_task_id and is untouched.

create or replace function public.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
    );
$$;

-- ============================================================================
-- 7. Drop Subtask-only RPCs entirely
-- ============================================================================
-- create_subtask — Subtask creation itself; get_task_time_rollup — existed solely to compute a
-- parent's "own + Subtasks" time roll-up, which no longer means anything once Subtasks don't exist.

drop function if exists public.create_subtask(
  uuid, text, text, uuid[], boolean, text, text, date, integer, text[], date, text
);

drop function if exists public.get_task_time_rollup(uuid);
