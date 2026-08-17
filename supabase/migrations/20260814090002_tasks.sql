-- Phase 7, part 3/4 — Tasks, assignees, checklist, and Notifications (minimum needed by Task
-- mutations). Maps to src/lib/data/types/task.ts, checklist-item.ts, notification.ts.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  -- Denormalized copy of workstream.company_id, synced by the provider on write — never
  -- independently editable, exactly as the mock's own comment on Task.companyId states.
  company_id uuid not null references public.companies (id) on delete cascade,
  workstream_id uuid not null references public.workstreams (id) on delete cascade,
  status text not null check (status in ('todo', 'in-progress', 'blocked', 'waiting-on-client', 'done')),
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date null,
  -- Normalized to minutes regardless of entry unit — see src/lib/data/expected-time.ts.
  expected_minutes int null,
  created_by uuid not null references public.profiles (id),
  self_added boolean not null default false,
  -- No templates table yet (Phase 7 explicitly scopes Reports/Templates/Saved Views out) — kept
  -- as a bare nullable id for forward compatibility, same "reserve, don't build" treatment the
  -- product brief already uses for tasks.parent_task_id.
  template_id uuid null,
  related_contact_id uuid null references public.client_contacts (id) on delete set null,
  -- Optional tag into the Activity Catalog, scoped by the owning Workstream's own selected
  -- Activities at the application layer (see enforce_task_activity_enabled below) — never
  -- required, matching "work is never blocked for lack of one."
  activity_id uuid null references public.activities (id),
  recurrence_rule text null,
  status_changed_by uuid null references public.profiles (id),
  status_changed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_company_id_idx on public.tasks (company_id);
create index tasks_workstream_id_idx on public.tasks (workstream_id);
create index tasks_activity_id_idx on public.tasks (activity_id);
create index tasks_status_idx on public.tasks (status);

comment on table public.tasks is
  'A Task belongs to exactly one Company (denormalized from its Workstream, database-enforced), one Workstream, and at most one Activity. See enforce_task_invariants for the company_id sync and the "must belong to the workstream''s enabled Activities, when it has any configured" rule.';

create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (task_id, user_id)
);

create index task_assignees_user_id_idx on public.task_assignees (user_id);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  description text not null,
  is_done boolean not null default false,
  position int not null default 0,
  completed_by uuid null references public.profiles (id),
  completed_at timestamptz null
);

create index checklist_items_task_id_idx on public.checklist_items (task_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('self-added-task', 'task-assigned', 'task-status-changed', 'task-handoff', 'report-comment', 'client-report-comment')),
  message text not null,
  related_task_id uuid null references public.tasks (id) on delete cascade,
  related_report_id uuid null,
  related_client_report_id uuid null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_recipient_id_idx on public.notifications (recipient_id);

-- ---------------------------------------------------------------------------
-- Access helpers — mirror permissions.ts's canAccessTask / canEditTask / canProgressTask exactly.
-- ---------------------------------------------------------------------------
create function public.can_access_task(target_task_id uuid)
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
        exists (
          select 1 from public.task_assignees ta
          where ta.task_id = target_task_id and public.manages_user(ta.user_id)
        )
        or (
          not exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id)
          and exists (
            select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id)
          )
        )
      )
    )
    or (
      exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = auth.uid())
      and exists (select 1 from public.tasks t where t.id = target_task_id and public.can_access_company(t.company_id))
    );
$$;

-- Full-field edit: supervisor/superadmin, or the employee who self-added it.
create function public.can_edit_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_supervisor() or public.is_superadmin()
    or exists (
      select 1 from public.tasks t
      where t.id = target_task_id and t.self_added and t.created_by = auth.uid()
    );
$$;

-- Progressing (status changes, checklist ticks): any assignee, or a manager.
create function public.can_progress_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_supervisor() or public.is_superadmin()
    or exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = auth.uid());
$$;

grant execute on function public.can_access_task(uuid) to authenticated;
grant execute on function public.can_edit_task(uuid) to authenticated;
grant execute on function public.can_progress_task(uuid) to authenticated;
grant execute on function public.can_access_task(uuid) to service_role;
grant execute on function public.can_edit_task(uuid) to service_role;
grant execute on function public.can_progress_task(uuid) to service_role;

-- Two invariants enforced together in one BEFORE trigger, mirroring the mock provider exactly:
-- (1) company_id is always forced to the workstream's own company_id — "denormalized copy...
--     never independently editable" per Task.companyId's own doc comment — the database now
--     guarantees this instead of trusting whatever the client happened to send.
-- (2) a tagged Activity must be one the Workstream actually enabled — same permissive-when-legacy
--     rule as the mock's requireActivityEnabledOnWorkstream: a Workstream with zero persisted
--     workstream_activities rows has nothing to check against, so anything valid for its service
--     is accepted (only matters pre-migration; every real Workstream going forward will have an
--     explicit, non-empty set whenever its service has a catalog).
create function public.enforce_task_invariants()
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

create trigger tasks_enforce_invariants
  before insert or update on public.tasks
  for each row execute function public.enforce_task_invariants();

-- ---------------------------------------------------------------------------
-- RLS — tasks.
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;

create policy "tasks_select" on public.tasks
  for select using (public.can_access_task(id));

create policy "tasks_insert" on public.tasks
  for insert with check (public.can_access_workstream(workstream_id));

-- General/full-field update path (updateTask) — the narrower status/checklist-only paths go
-- through the update_task_status / toggle_checklist_item RPCs below instead, which are gated by
-- can_progress_task (broader than can_edit_task) but never touch any other column.
create policy "tasks_update" on public.tasks
  for update
  using (public.can_edit_task(id))
  with check (public.can_edit_task(id));

grant select, insert, update on public.tasks to authenticated;
grant select, insert, update, delete on public.tasks to service_role;

alter table public.task_assignees enable row level security;

create policy "task_assignees_select" on public.task_assignees
  for select using (public.can_access_task(task_id));

create policy "task_assignees_write" on public.task_assignees
  for all
  using (public.can_edit_task(task_id))
  with check (public.can_edit_task(task_id));

grant select, insert, delete on public.task_assignees to authenticated;
grant select, insert, update, delete on public.task_assignees to service_role;

alter table public.checklist_items enable row level security;

create policy "checklist_items_select" on public.checklist_items
  for select using (public.can_access_task(task_id));

-- Full add/remove/rename of checklist rows is a can_edit_task action (mirrors syncChecklistItems,
-- called only from the same updateTask/createTask path as full-field edits). Ticking/unticking an
-- existing item's isDone is the narrower can_progress_task action — handled by the
-- toggle_checklist_item RPC below, not by this table-level policy.
create policy "checklist_items_write" on public.checklist_items
  for all
  using (public.can_edit_task(task_id))
  with check (public.can_edit_task(task_id));

grant select, insert, update, delete on public.checklist_items to authenticated;
grant select, insert, update, delete on public.checklist_items to service_role;

-- ---------------------------------------------------------------------------
-- RLS — notifications. Always self-scoped (recipient_id = auth.uid()), matching
-- NotificationsProvider's own doc comment. No direct INSERT for authenticated — every
-- notification is written by the SECURITY DEFINER RPCs below (create_task /
-- update_task_status / toggle_checklist_item), which already know it's safe to notify a
-- given recipient because the actor just performed a real, permission-checked mutation
-- naming them (a new assignee, an existing assignee, or the actor's own supervisor).
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (recipient_id = auth.uid());

-- Only the read flag is ever client-editable, and only on your own notifications (mark
-- read / mark all read) — never the message/type/recipient of an existing notification.
create policy "notifications_update_own" on public.notifications
  for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- ---------------------------------------------------------------------------
-- update_task_status — the narrow status-only mutation path (also used by the timer's
-- Todo -> In Progress transition). Notifies other current assignees, plus the actor's own
-- supervisor when the actor is an employee — mirrors notifyOfStatusChange, simplified to skip
-- the mock's extra "recipient can already access this task" filter (a defensive nicety there,
-- not a security boundary — every candidate recipient here is already an assignee or a
-- supervisor of one, so they already have access by definition).
-- ---------------------------------------------------------------------------
create function public.update_task_status(target_task_id uuid, new_status text)
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
begin
  select * into existing from public.tasks where id = target_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;
  if not public.can_progress_task(target_task_id) then
    raise exception 'You don''t have permission to update this task''s status.';
  end if;
  if new_status not in ('todo', 'in-progress', 'blocked', 'waiting-on-client', 'done') then
    raise exception 'Invalid status: %', new_status;
  end if;

  if new_status = existing.status then
    return existing;
  end if;

  update public.tasks
  set status = new_status, status_changed_by = auth.uid(), status_changed_at = now(), updated_at = now()
  where id = target_task_id
  returning * into updated;

  select role, supervisor_id into actor_role, actor_supervisor_id from public.profiles where id = auth.uid();

  insert into public.notifications (recipient_id, type, message, related_task_id)
  select distinct ta.user_id, 'task-status-changed', format('Task "%s" changed to %s', updated.title, new_status), target_task_id
  from public.task_assignees ta
  where ta.task_id = target_task_id and ta.user_id <> auth.uid();

  if actor_role = 'employee' and actor_supervisor_id is not null then
    insert into public.notifications (recipient_id, type, message, related_task_id)
    values (actor_supervisor_id, 'task-status-changed', format('Task "%s" changed to %s', updated.title, new_status), target_task_id);
  end if;

  return updated;
end;
$$;

grant execute on function public.update_task_status(uuid, text) to authenticated;
grant execute on function public.update_task_status(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- toggle_checklist_item — atomic: flips the item, then applies the exact same auto-Done /
-- auto-revert-to-In-Progress rule as toggleChecklistItem (last item checked -> Done; unchecking
-- any item on an already-Done task -> In Progress, never back to Todo).
-- ---------------------------------------------------------------------------
create function public.toggle_checklist_item(target_item_id uuid, p_is_done boolean)
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
    if done_count = total_count and existing.status <> 'done' then
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

grant execute on function public.toggle_checklist_item(uuid, boolean) to authenticated;
grant execute on function public.toggle_checklist_item(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- notify_task_created — called by the app right after a normal (non-RPC) task insert +
-- assignee sync, so "task-assigned"/"self-added-task" notifications stay centralized in the
-- database layer rather than duplicated per-provider. Takes the assignee list explicitly (the
-- caller already knows it, having just written task_assignees) rather than re-deriving it.
-- ---------------------------------------------------------------------------
create function public.notify_task_created(target_task_id uuid, assignee_ids uuid[], is_self_added boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
  actor_supervisor_id uuid;
  superadmin_id uuid;
begin
  if not public.can_access_task(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  select title into task_title from public.tasks where id = target_task_id;

  insert into public.notifications (recipient_id, type, message, related_task_id)
  select distinct u, 'task-assigned', format('You were assigned to "%s"', task_title), target_task_id
  from unnest(assignee_ids) as u
  where u <> auth.uid();

  if is_self_added then
    select supervisor_id into actor_supervisor_id from public.profiles where id = auth.uid();
    if actor_supervisor_id is not null then
      insert into public.notifications (recipient_id, type, message, related_task_id)
      values (actor_supervisor_id, 'self-added-task', format('A new task was added: "%s"', task_title), target_task_id);
    end if;
    for superadmin_id in select id from public.profiles where role = 'superadmin' and active loop
      insert into public.notifications (recipient_id, type, message, related_task_id)
      values (superadmin_id, 'self-added-task', format('A new task was added: "%s"', task_title), target_task_id);
    end loop;
  end if;
end;
$$;

grant execute on function public.notify_task_created(uuid, uuid[], boolean) to authenticated;
grant execute on function public.notify_task_created(uuid, uuid[], boolean) to service_role;

-- ---------------------------------------------------------------------------
-- notify_task_assignment_changed — same shape as notify_task_created's "task-assigned" half,
-- for the updateTask path (only the newly-added assignees, never someone already on the task).
-- ---------------------------------------------------------------------------
create function public.notify_task_assignment_changed(target_task_id uuid, newly_assigned_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
begin
  if not public.can_access_task(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  select title into task_title from public.tasks where id = target_task_id;

  insert into public.notifications (recipient_id, type, message, related_task_id)
  select distinct u, 'task-assigned', format('You were assigned to "%s"', task_title), target_task_id
  from unnest(newly_assigned_ids) as u
  where u <> auth.uid();
end;
$$;

grant execute on function public.notify_task_assignment_changed(uuid, uuid[]) to authenticated;
grant execute on function public.notify_task_assignment_changed(uuid, uuid[]) to service_role;

-- mark_all_notifications_read — small convenience RPC so the client doesn't need to fetch every
-- unread id first just to flip them all (the column-level UPDATE grant above already covers the
-- single-notification "mark read" case via a plain .update() call).
create function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read = true where recipient_id = auth.uid() and not read;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_all_notifications_read() to service_role;
