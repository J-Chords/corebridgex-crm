-- ---------------------------------------------------------------------------
-- Phase 12B final polish — a directly assigned Employee may ADD one checklist
-- item to a Task even when they don't have full `can_edit_task` authority
-- (e.g. a Supervisor-created Task assigned to them, where the Supervisor
-- forgot to add an item). This is deliberately narrower than the existing
-- `checklist_items_write` RLS policy (`can_edit_task`-gated, used by the
-- client's general `updateTask` path for full checklist add/remove/rename) —
-- mirrors `toggle_checklist_item`'s own established pattern exactly: a
-- SECURITY DEFINER RPC gated on the broader `can_progress_task` (any
-- assignee, or a manager — confirmed by inspection to require neither
-- hierarchy-read-only access nor any other broadening), touching ONLY a
-- single `checklist_items` insert. No existing RLS policy is changed or
-- weakened; `tasks_update`/`checklist_items_write` remain exactly as they
-- were. The parent `tasks` row itself is never mutated by this function.
-- ---------------------------------------------------------------------------
create function public.add_task_checklist_item(target_task_id uuid, p_description text)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tasks;
  trimmed text;
  new_position int;
begin
  select * into existing from public.tasks where id = target_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;

  if not public.can_progress_task(target_task_id) then
    raise exception 'You don''t have permission to add a checklist item to this task.';
  end if;

  trimmed := trim(p_description);
  if trimmed = '' then
    raise exception 'Checklist item description cannot be empty.';
  end if;

  select coalesce(max(position), -1) + 1 into new_position
  from public.checklist_items where task_id = target_task_id;

  insert into public.checklist_items (task_id, description, position)
  values (target_task_id, trimmed, new_position);

  return existing;
end;
$$;

revoke all on function public.add_task_checklist_item(uuid, text) from public, anon;
grant execute on function public.add_task_checklist_item(uuid, text) to authenticated, service_role;
