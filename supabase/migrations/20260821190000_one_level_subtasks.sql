-- Phase 10 — One-Level Subtasks.
--
-- A Subtask is a FULL Task nested exactly one level under a parent Task — reusing the entire
-- existing Task system (status, assignees, checklist, time tracking, notifications) rather than a
-- parallel lightweight object. Locked model: `tasks.parent_task_id` self-references `tasks.id`.
-- NULL = a normal top-level Task (every existing row remains exactly this — no backfill needed).
-- Non-null = a Subtask, whose parent MUST itself be top-level (no sub-subtasks, no arbitrary depth).
--
-- Forward-only: does not edit any prior migration. Every check below is written as a bounded,
-- one-hop lookup (self <-> its one possible parent, or self <-> its direct children) — never a
-- recursive CTE or recursive RLS self-reference — because one-level nesting means there is never
-- more than one hop to consider.

-- ============================================================================
-- 1. Schema: the self-referencing column
-- ============================================================================

alter table public.tasks
  add column parent_task_id uuid null references public.tasks (id) on delete restrict;

comment on column public.tasks.parent_task_id is
  'NULL = top-level Task. Non-null = a Subtask of that Task id, one level only (the referenced '
  'parent must itself have parent_task_id NULL — enforced by enforce_task_invariants). Immutable '
  'once set: a Subtask is never re-parented, promoted to top-level, or converted from an existing '
  'top-level Task after creation (V1 scope). ON DELETE RESTRICT is defense-in-depth — no '
  'authenticated role can hard-delete a Task at all today (see tasks_delete grants), so this only '
  'guards a hypothetical future/service-role deletion from silently orphaning or cascading away '
  'live Subtasks, their checklists, and their logged time.';

create index tasks_parent_task_id_idx on public.tasks (parent_task_id);

-- ============================================================================
-- 2. enforce_task_invariants — extended with the Phase 10 hierarchy guards
-- ============================================================================
-- Byte-for-byte identical to the pre-Phase-10 body (company derivation + Activity-enabled check)
-- except for the new blocks marked "Phase 10" below. Fires BEFORE INSERT OR UPDATE on `tasks`
-- (trigger itself predates this migration and is untouched).

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
  -- Phase 10 — parent_task_id is immutable once a row exists: never re-parented, never promoted
  -- to top-level, never converted from an existing top-level Task into a Subtask after creation.
  if TG_OP = 'UPDATE' and new.parent_task_id is distinct from old.parent_task_id then
    raise exception 'A Task''s parent cannot be changed after creation.';
  end if;

  -- Phase 10 — a top-level Task that already has Subtasks may not change the Service/Workstream or
  -- Activity its children were created under (Section 8's safe V1 rule: block, never silently leave
  -- children behind in a stale context, never auto-cascade/reassign).
  if TG_OP = 'UPDATE' and exists (select 1 from public.tasks where parent_task_id = old.id) then
    if new.workstream_id is distinct from old.workstream_id then
      raise exception 'This Task has Subtasks — its Service/Workstream cannot be changed. Remove or reassign the Subtasks first.';
    end if;
    if new.activity_id is distinct from old.activity_id then
      raise exception 'This Task has Subtasks — its Activity cannot be changed. Remove or reassign the Subtasks first.';
    end if;
  end if;

  -- Phase 10 — self-parent, parent-must-be-top-level, and context-integrity protection. This is
  -- the last line of defense if something ever bypasses create_subtask's own server-side context
  -- inheritance (e.g. a direct INSERT/UPDATE) — reject on mismatch, never silently coerce.
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
    -- Nullable-safe: NULL activity on both sides is not a mismatch (`IS DISTINCT FROM` treats
    -- NULL = NULL as "not distinct"), only a genuine difference is rejected.
    if new.activity_id is distinct from parent.activity_id then
      raise exception 'A Subtask must carry the same Activity as its parent Task.';
    end if;
  end if;

  select w.company_id into new.company_id from public.workstreams w where w.id = new.workstream_id;
  if new.company_id is null then
    raise exception 'Workstream % not found.', new.workstream_id;
  end if;

  -- Phase 10 — Company is derived from Workstream above, so a matching Workstream already implies
  -- a matching Company; asserted explicitly anyway per the locked "Company/Workstream/Activity all
  -- three" contract, as a redundant, cheap safety net.
  if new.parent_task_id is not null and new.company_id is distinct from parent.company_id then
    raise exception 'A Subtask must belong to the same Company as its parent Task.';
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
-- 3. can_access_task — one-hop hierarchy READ visibility, never mutation/time rights
-- ============================================================================
-- Byte-for-byte identical to the pre-Phase-10 body except for the two new OR branches at the end.
-- Grants READ visibility only: can_edit_task/can_progress_task/can_log_time_on_task are completely
-- separate functions, untouched by this change, so seeing a coworker's Subtask (or a Subtask's own
-- parent) for context never grants edit/status/time-logging authority over it. Both new branches
-- are bounded single joins (self <-> its one possible parent, or self <-> its direct children) —
-- never a recursive CTE, never a policy that walks arbitrary depth, since one-level nesting means
-- there is nothing deeper to walk.

create or replace function public.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
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
      -- I'm assigned to this row's PARENT -> I may read this row (it's a Subtask of a Task I'm on).
      exists (
        select 1 from public.tasks child
        join public.task_assignees pa on pa.task_id = child.parent_task_id
        where child.id = target_task_id and pa.user_id = auth.uid()
      )
      and exists (select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id))
    )
    or (
      -- I'm assigned to a CHILD of this row -> I may read this row (it's the parent of a Subtask I'm on).
      exists (
        select 1 from public.tasks c
        join public.task_assignees ca on ca.task_id = c.id
        where c.parent_task_id = target_task_id and ca.user_id = auth.uid()
      )
      and exists (select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id))
    );
$$;

revoke all on function public.can_access_task(uuid) from public, anon;
grant execute on function public.can_access_task(uuid) to authenticated, service_role;

-- ============================================================================
-- 4. get_task_time_rollup — the SMALLEST safe aggregate for "parent inclusive effort"
-- ============================================================================
-- Never exposes raw time_entries rows/notes/user ids — only two integer minute sums. This is what
-- lets a parent-Task viewer see "Own time: 30m / Including subtasks: 3h 15m" even when a Subtask is
-- assigned to a coworker they have no independent raw time_entries visibility into (time_entries_
-- select stays exactly `user_id = auth.uid() or manages_user(user_id)`, completely untouched).

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
  where public.can_access_task(target_task_id);
$$;

revoke all on function public.get_task_time_rollup(uuid) from public, anon;
grant execute on function public.get_task_time_rollup(uuid) to authenticated, service_role;

-- ============================================================================
-- 5. create_subtask — the hardened creation path
-- ============================================================================
-- Deliberately a SEPARATE RPC from create_task rather than an extension of it, so create_task's
-- existing, already-accepted security surface is never touched. Context (company_id/workstream_id/
-- activity_id) is derived from the parent row SERVER-SIDE and is not an input parameter at all —
-- there is no `p_workstream_id`/`p_activity_id`/`p_company_id` for a caller to inject. The
-- assignee-resolution logic below is copied verbatim from create_task's own (Employee forced to
-- self; Superadmin any active user, falling back to self; Supervisor self + direct reports, falling
-- back to self) so the two creation paths can never silently drift apart on who may be assigned.

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

  if not public.can_access_task(p_parent_task_id) then
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
-- 6. toggle_checklist_item — guard against silently auto-completing a parent with open Subtasks
-- ============================================================================
-- Identical to the pre-Phase-10 body except the auto-done branch (done_count = total_count) now
-- also requires zero open Subtasks. The auto-revert-to-in-progress branch (unchecking an item on an
-- already-done task) is unaffected — that direction was never restricted by this rule. A manual
-- "mark Done" via update_task_status is NOT touched here — Section 22's confirmation is a warning,
-- not a server-side block, and lives entirely in the UI.

create or replace function public.toggle_checklist_item(target_item_id uuid, p_is_done boolean)
returns tasks
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
  from public.tasks where parent_task_id = target_task_id and status <> 'done';

  next_status := null;
  if total_count > 0 then
    if done_count = total_count and existing.status <> 'done' and open_subtasks = 0 then
      next_status := 'done';
    elsif done_count < total_count and existing.status = 'done' then
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
  select distinct ta.user_id, 'task-status-changed', format('Task "%s" changed to %s', updated.title, next_status), target_task_id
  from public.task_assignees ta
  where ta.task_id = target_task_id and ta.user_id <> auth.uid();

  return updated;
end;
$$;

revoke all on function public.toggle_checklist_item(uuid, boolean) from public, anon;
grant execute on function public.toggle_checklist_item(uuid, boolean) to authenticated, service_role;
