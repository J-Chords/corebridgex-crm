-- Phase 13B structural correction — Task Start Date.
--
-- Employees plan and reason about work through Tasks, not Project contract periods (the Projects
-- index's contract-date Gantt is being removed in this same phase for exactly that reason — see
-- docs/phase-13b-project-workspace-history-spec.md). The Task-level Timeline this migration
-- supports needs a genuine PLANNED/SCHEDULED start, which does not exist anywhere on `tasks`
-- today: `due_date` is the only date field, and `created_at`/`status_changed_at` are historical
-- event timestamps, never planning data (audited explicitly — neither is repurposed here).
--
-- `start_date` is a plain, optional, user-set date — never auto-populated, never derived from
-- `created_at`, never derived from status/timer activity. Existing Tasks keep `start_date = null`;
-- no backfill, no fabricated value. Mirrors the exact nullable-both-ends shape and constraint style
-- already used for `projects.contract_start_date`/`contract_end_date`
-- (`20260815090000_projects.sql`'s `projects_end_after_start` check) — same idea, one level down in
-- the hierarchy, on `tasks` instead of `projects`.
--
-- LOCAL / UNAPPLIED: this migration is created for review only. Do not `supabase db push` it
-- against the hosted project until explicitly approved.

alter table public.tasks add column start_date date null;

comment on column public.tasks.start_date is
  'Optional planned/scheduled start date, set directly by the user — never derived from created_at, status_changed_at, or any timer/status event. Null for a Task with no planned start (the common case); existing Tasks keep this null on migration, never backfilled.';

alter table public.tasks add constraint tasks_due_after_start
  check (start_date is null or due_date is null or due_date >= start_date);

-- ============================================================================
-- create_task — add p_start_date, all other parameters/behavior byte-for-byte unchanged
-- ============================================================================
-- Signature change (new optional-value parameter), so the old 12-arg overload is dropped first —
-- same convention already used in this repository for RPC signature changes (see
-- 20260821180000_planned_client_visit_workflow.sql's drop-then-recreate of
-- create_visit_entry/update_visit_entry). Every authorization check, the Activity
-- auto-enable branch, assignee-resolution branch (Employee self-only / Supervisor own-team /
-- Superadmin any-active-user, silent fallback to self), checklist insertion, and
-- notify_task_created call are copied verbatim — only the new `start_date` column is threaded
-- into the single `insert into public.tasks (...)` statement.

drop function if exists public.create_task(
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[]
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
  p_start_date date default null
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
    title, description, company_id, workstream_id, status, priority, due_date, start_date, expected_minutes,
    created_by, self_added, template_id, activity_id
  ) values (
    p_title, p_description, ws.company_id, p_workstream_id, p_status, p_priority, p_due_date, p_start_date, p_expected_minutes,
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
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[], date
) from public, anon;
grant execute on function public.create_task(
  text, text, uuid, uuid, uuid[], boolean, text, text, date, int, uuid, text[], date
) to authenticated, service_role;

-- ============================================================================
-- create_subtask — add p_start_date, all other parameters/behavior byte-for-byte unchanged
-- ============================================================================
-- Same drop-then-recreate treatment. Direct-access gate (can_access_task_directly), one-level
-- guard, assignee resolution, checklist insertion, notify_task_created are all unchanged —
-- Subtasks use the same `tasks` table/model, so they get the same optional start_date column for
-- free; only the new parameter and its pass-through into the insert are added.

drop function if exists public.create_subtask(
  uuid, text, text, uuid[], boolean, text, text, date, integer, text[]
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
  p_start_date date default null
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
    title, description, company_id, workstream_id, status, priority, due_date, start_date, expected_minutes,
    created_by, self_added, activity_id, parent_task_id
  ) values (
    p_title, p_description, parent.company_id, parent.workstream_id, coalesce(p_status, 'todo'), coalesce(p_priority, 'medium'),
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

revoke all on function public.create_subtask(uuid, text, text, uuid[], boolean, text, text, date, integer, text[], date) from public, anon;
grant execute on function public.create_subtask(uuid, text, text, uuid[], boolean, text, text, date, integer, text[], date) to authenticated, service_role;

-- ============================================================================
-- update_task — no RPC change needed
-- ============================================================================
-- Task updates go through a direct `tasks` table UPDATE via PostgREST (RLS-gated by the existing
-- `tasks_update` policy / `can_edit_task`), not an RPC — see
-- supabase-tasks-provider.ts's `updateTask`. `start_date` needs no new grant, RLS policy, or RPC:
-- the existing `tasks_update` policy already covers every column on the row, and the provider's
-- update payload is extended in the same application-layer change that adds this migration (no
-- database change required for that half).
