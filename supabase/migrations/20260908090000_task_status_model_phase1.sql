-- Task Level Phase 1 — final canonical Task status model.
--
-- Renames the persisted status values to their final canonical names (persisted value IS the
-- canonical name, no separate display-mapping layer to maintain), adds Canceled as a genuinely new
-- closed status, and adds a `status_reason` field required exactly when a Task is Waiting/Blocked —
-- server-enforced (not just UI-enforced) via `enforce_task_invariants`, the same BEFORE INSERT OR
-- UPDATE trigger that already guards every other Task write path regardless of which RPC/table-write
-- performs it. Also closes a real, pre-existing gap: newly selecting an inactive Activity was
-- previously only ever blocked in the UI, never at the DB/RPC layer — added here alongside the status
-- work since both live in the same trigger.
--
-- Hosted status audit (read-only, performed before this migration): 6 in-progress, 6 todo,
-- 2 waiting-on-client, 1 done, 0 blocked — no unexpected values. Mapping applied below:
--   todo              -> not-started
--   in-progress       -> in-progress   (unchanged)
--   blocked           -> blocked       (unchanged)
--   waiting-on-client -> waiting
--   done              -> completed
-- `canceled` is new; no existing row maps to it.
--
-- Subtask hosted audit (read-only, performed before this migration): 1 Task has parent_task_id
-- NOT NULL ("Phase 10 Child", a manual-test artifact from Phase 10's own acceptance pass). Per the
-- locked rule ("IF count > 0: STOP BEFORE DESTRUCTIVE MIGRATION"), the Subtask schema/RPCs/
-- constraints are NOT touched by this migration — parent_task_id, create_subtask, and every
-- Subtask-specific guard remain exactly as they were. See the Task Level Phase 1 report for the full
-- flattening plan (not executed this pass).

-- ============================================================================
-- 1. status_reason column
-- ============================================================================

alter table public.tasks add column status_reason text null;

comment on column public.tasks.status_reason is
  'The CURRENT reason this Task is Waiting or Blocked — required exactly when status is ''waiting'' '
  'or ''blocked'', and force-cleared by enforce_task_invariants the moment status leaves either of '
  'those. Workflow state, not conversation history — Comments remain the team-discussion surface.';

-- ============================================================================
-- 2. Rename persisted status values, then swap the CHECK constraint
-- ============================================================================

alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks set status = case status
  when 'todo' then 'not-started'
  when 'waiting-on-client' then 'waiting'
  when 'done' then 'completed'
  else status
end
where status in ('todo', 'waiting-on-client', 'done');

alter table public.tasks add constraint tasks_status_check
  check (status in ('not-started', 'in-progress', 'waiting', 'blocked', 'completed', 'canceled'));

-- ============================================================================
-- 3. enforce_task_invariants — status_reason lifecycle + inactive-Activity gate
-- ============================================================================
-- Byte-for-byte identical to the pre-Phase-1 body (parent/child hierarchy guards, Company
-- derivation, workstream_activities-enabled check) plus two new blocks, marked "Task Level Phase 1"
-- below. Subtask-specific logic is untouched (see the header note — Subtask removal is deferred).

create or replace function public.enforce_task_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled_count int;
  parent public.tasks;
begin
  if TG_OP = 'UPDATE' and new.parent_task_id is distinct from old.parent_task_id then
    raise exception 'A Task''s parent cannot be changed after creation.';
  end if;

  if TG_OP = 'UPDATE' and exists (select 1 from public.tasks where parent_task_id = old.id) then
    if new.workstream_id is distinct from old.workstream_id then
      raise exception 'This Task has Subtasks — its Service/Workstream cannot be changed. Remove or reassign the Subtasks first.';
    end if;
    if new.activity_id is distinct from old.activity_id then
      raise exception 'This Task has Subtasks — its Activity cannot be changed. Remove or reassign the Subtasks first.';
    end if;
  end if;

  if new.parent_task_id is not null then
    if new.parent_task_id = new.id then
      raise exception 'A Task cannot be its own parent.';
    end if;

    select * into parent from public.tasks where id = new.parent_task_id;
    if not found then
      raise exception 'Parent Task % not found.', new.parent_task_id;
    end if;

    if parent.parent_task_id is not null then
      raise exception 'Cannot nest a Subtask under another Subtask — one level of nesting only.';
    end if;

    if new.workstream_id is distinct from parent.workstream_id then
      raise exception 'A Subtask must belong to the same Service/Workstream as its parent Task.';
    end if;
    if new.activity_id is distinct from parent.activity_id then
      raise exception 'A Subtask must carry the same Activity as its parent Task.';
    end if;
  end if;

  select w.company_id into new.company_id from public.workstreams w where w.id = new.workstream_id;
  if new.company_id is null then
    raise exception 'Workstream % not found.', new.workstream_id;
  end if;

  if new.parent_task_id is not null and new.company_id is distinct from parent.company_id then
    raise exception 'A Subtask must belong to the same Company as its parent Task.';
  end if;

  -- Task Level Phase 1 — status_reason lifecycle: required exactly when Waiting/Blocked, force-
  -- cleared the moment status is anything else. Applies uniformly to every write path (create_task,
  -- create_subtask, update_task_status, toggle_checklist_item's own auto-transition, and the general
  -- updateTask path) since this trigger fires on every INSERT/UPDATE regardless of which RPC/table-
  -- write performs it — never duplicated per-RPC.
  if new.status in ('waiting', 'blocked') then
    if new.status_reason is null or btrim(new.status_reason) = '' then
      raise exception 'A reason is required while this Task is % — describe what it''s waiting on or blocked by.', new.status;
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
-- 4. create_task — accept an optional status_reason, otherwise unchanged
-- ============================================================================

drop function if exists public.create_task(
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[], date
);

create function public.create_task(
  p_title text,
  p_description text,
  p_workstream_id uuid,
  p_activity_id uuid,
  p_assignee_ids uuid[],
  p_allow_unassigned boolean,
  p_status text,
  p_priority text,
  p_due_date date,
  p_expected_minutes int,
  p_template_id uuid,
  p_checklist_items text[],
  p_start_date date default null,
  p_status_reason text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws public.workstreams;
  new_task public.tasks;
  effective_assignee_ids uuid[];
  self_added boolean;
  i int;
  activity_already_enabled boolean;
  may_extend_activities boolean;
begin
  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;
  if not public.can_access_workstream(p_workstream_id) then
    raise exception 'You don''t have access to that workstream.';
  end if;

  if p_activity_id is not null then
    select exists (
      select 1 from public.workstream_activities where workstream_id = p_workstream_id and activity_id = p_activity_id
    ) into activity_already_enabled;

    if not activity_already_enabled then
      may_extend_activities :=
        public.is_superadmin()
        or (public.is_employee() and ws.lead_user_id = auth.uid())
        or (public.is_supervisor() and public.manages_user(ws.lead_user_id) and public.can_access_project(ws.project_id));

      if not may_extend_activities then
        raise exception 'That activity is not yet enabled for this service, and you don''t have permission to add it.';
      end if;

      insert into public.workstream_activities (workstream_id, activity_id) values (p_workstream_id, p_activity_id);
    end if;
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
    title, description, company_id, workstream_id, status, status_reason, priority, due_date, start_date, expected_minutes,
    created_by, self_added, template_id, activity_id
  ) values (
    p_title, p_description, ws.company_id, p_workstream_id, p_status, p_status_reason, p_priority, p_due_date, p_start_date, p_expected_minutes,
    auth.uid(), self_added, p_template_id, p_activity_id
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

revoke execute on function public.create_task(
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[], date, text
) from public, anon;
grant execute on function public.create_task(
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[], date, text
) to authenticated, service_role;

-- ============================================================================
-- 5. create_subtask — accept an optional status_reason, otherwise unchanged
-- ============================================================================
-- Subtask CREATION is already fully retired from the UI (no call site anywhere in src/), but the
-- RPC itself is deliberately left live and correct per the count>0 hosted-data finding above — it is
-- not part of this migration's schema-removal scope.

drop function if exists public.create_subtask(
  uuid, text, text, uuid[], boolean, text, text, date, integer, text[], date
);

create function public.create_subtask(
  p_parent_task_id uuid,
  p_title text,
  p_description text,
  p_assignee_ids uuid[],
  p_allow_unassigned boolean,
  p_status text,
  p_priority text,
  p_due_date date,
  p_expected_minutes integer,
  p_checklist_items text[],
  p_start_date date default null,
  p_status_reason text default null
)
returns public.tasks
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
    title, description, company_id, workstream_id, status, status_reason, priority, due_date, start_date, expected_minutes,
    created_by, self_added, activity_id, parent_task_id
  ) values (
    p_title, p_description, parent.company_id, parent.workstream_id, coalesce(p_status, 'not-started'), p_status_reason, coalesce(p_priority, 'medium'),
    p_due_date, p_start_date, p_expected_minutes, auth.uid(), self_added, parent.activity_id, p_parent_task_id
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

revoke execute on function public.create_subtask(
  uuid, text, text, uuid[], boolean, text, text, date, integer, text[], date, text
) from public, anon;
grant execute on function public.create_subtask(
  uuid, text, text, uuid[], boolean, text, text, date, integer, text[], date, text
) to authenticated, service_role;

-- ============================================================================
-- 6. update_task_status — new 6-value set, optional status_reason
-- ============================================================================

drop function if exists public.update_task_status(uuid, text);

create function public.update_task_status(target_task_id uuid, new_status text, p_status_reason text default null)
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
  if new_status not in ('not-started', 'in-progress', 'waiting', 'blocked', 'completed', 'canceled') then
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
      status_reason = case when new_status in ('waiting', 'blocked') then p_status_reason else null end,
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

grant execute on function public.update_task_status(uuid, text, text) to authenticated;
grant execute on function public.update_task_status(uuid, text, text) to service_role;

-- ============================================================================
-- 7. toggle_checklist_item — auto-complete now targets 'completed', not 'done'
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
  open_subtasks int;
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

  select count(*) into open_subtasks
  from public.tasks where parent_task_id = target_task_id and status not in ('completed', 'canceled');

  next_status := null;
  if total_count > 0 then
    if done_count = total_count and existing.status <> 'completed' and open_subtasks = 0 then
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
