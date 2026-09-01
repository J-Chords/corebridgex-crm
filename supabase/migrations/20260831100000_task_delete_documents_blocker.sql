-- Phase 14B (Part B9) — extends delete_task with one more dependency blocker: any Document
-- (Project Document or Task Attachment) referencing a Task, INCLUDING soft-deleted/Trash ones, must
-- block that Task's hard-delete.
--
-- FORWARD-ONLY. supabase/migrations/20260828100000_delete_task.sql (already hosted) is NEVER edited
-- again — this migration `create or replace`s the same function instead, per this session's own
-- established "never edit an already-hosted migration" rule.
--
-- Why "including Trash" (Correction 5, not merely `deleted_at is null`): a soft-deleted Document
-- still physically exists in Storage and remains fully restorable (Phase 14B has no automatic purge
-- — see 20260831090000_documents_foundation.sql's own header). Only a Document that has gone through
-- a future, not-yet-built, narrowly-designed Superadmin-only permanent-purge workflow could ever
-- legitimately stop blocking — so the check here is deliberately `exists (select 1 from
-- public.documents where task_id = p_task_id)` with NO `deleted_at` filter at all, stricter than a
-- naive "only active ones" rule would be.
--
-- Every other accepted property of delete_task is preserved byte-for-byte from the hosted version:
-- auth-required check, SECURITY DEFINER, search_path = '', the `select ... for update` row lock
-- (still acquired FIRST, before any dependency check, closing the exact same TimeEntry/Note/Subtask/
-- Document insert race the original migration's own header comment already proved), the TimeEntry
-- blocker, the Subtask blocker, the Note blocker, the `can_edit_task` authorization boundary, the
-- existence-then-permission error ordering, the legacy-Subtask delete policy, and the grants/
-- revokes. No new broad table DELETE grant is introduced.

create or replace function public.delete_task(p_task_id uuid)
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
  v_document_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  -- Lock the target row FIRST, before any dependency check — see 20260828100000_delete_task.sql's
  -- own header comment for exactly why this closes the TimeEntry/Note/Subtask/Document insert race.
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

  -- Phase 14B (Part B9) — blocks on ANY Document row, including Trash (no deleted_at filter): see
  -- this migration's own header for why "soft-deleted" is not "safe to ignore" here.
  select count(*) into v_document_count from public.documents where task_id = p_task_id;
  if v_document_count > 0 then
    raise exception 'This task has attached files and can''t be deleted. Remove or permanently purge its attachments first.';
  end if;

  delete from public.tasks where id = p_task_id;
end;
$$;

revoke all on function public.delete_task(uuid) from public;
revoke all on function public.delete_task(uuid) from anon;
grant execute on function public.delete_task(uuid) to authenticated, service_role;
