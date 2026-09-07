-- Task Level Phase 1, Section 16 — close a real, pre-existing gap the Task Level audit flagged:
-- delete_task already blocks on logged TimeEntries/Subtasks/Notes/Documents, but never checked
-- Comments (project_comments, task-scoped) or historical Handoffs (task_handoffs) or a linked
-- Project Issue (project_issues) — all three of which either CASCADE or SET NULL on the underlying
-- FK, meaning a Task with real conversation/handoff/issue history could previously be hard-deleted,
-- silently destroying or unlinking that history. Byte-for-byte identical to the prior body except
-- for the three new blocks, marked below.

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

  select count(*) into v_subtask_count from public.tasks where parent_task_id = p_task_id;
  if v_subtask_count > 0 then
    raise exception 'This task has subtasks and can''t be deleted. Remove or reassign its subtasks first.';
  end if;

  select count(*) into v_note_count from public.notes where task_id = p_task_id;
  if v_note_count > 0 then
    raise exception 'This task has notes attached and can''t be deleted.';
  end if;

  select count(*) into v_document_count from public.documents where task_id = p_task_id;
  if v_document_count > 0 then
    raise exception 'This task has attached files and can''t be deleted. Remove or permanently purge its attachments first.';
  end if;

  -- Task Level Phase 1 — Comments is the canonical Task conversation surface; project_comments.task_id
  -- is ON DELETE CASCADE, so without this check a Task with real discussion history could be
  -- silently deleted along with every comment on it.
  select count(*) into v_comment_count from public.project_comments where task_id = p_task_id and deleted_at is null;
  if v_comment_count > 0 then
    raise exception 'This task has comments and can''t be deleted.';
  end if;

  -- Task Level Phase 1 — task_handoffs.task_id is ON DELETE CASCADE; historical Handoffs (even though
  -- new creation is retired) must never be silently destroyed.
  select count(*) into v_handoff_count from public.task_handoffs where task_id = p_task_id;
  if v_handoff_count > 0 then
    raise exception 'This task has handoff history and can''t be deleted.';
  end if;

  -- Task Level Phase 1 — project_issues.task_id is ON DELETE SET NULL; deleting the Task would
  -- silently unlink it from a real Issue rather than destroying the Issue itself, but that's still a
  -- piece of context quietly going stale, so it's blocked the same way as everything else here.
  select count(*) into v_issue_count from public.project_issues where task_id = p_task_id;
  if v_issue_count > 0 then
    raise exception 'This task is linked to a Project Issue and can''t be deleted. Unlink it from the Issue first.';
  end if;

  delete from public.tasks where id = p_task_id;
end;
$$;
