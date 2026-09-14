-- ============================================================================================
-- Archived Project Service — New-Task Guard (CD-162 final gap closure)
-- ============================================================================================
-- NOT YET APPLIED TO THE HOSTED PROJECT AS OF THIS PASS — created locally per explicit
-- instruction. Independent of, and reviewable separately from,
-- 20260911090000_workstream_lifecycle_and_duplicate_prevention.sql (also not yet applied).
--
-- Closes the gap flagged in the prior pass's report: "TaskFormDialog's own Service picker was not
-- changed to exclude archived Services." The app/mock-provider layer and the Task form's own picker
-- were fixed in this same pass (no migration needed there); this migration closes the matching
-- HOSTED gap, at the real enforcement boundary rather than trusting the client:
--
--   1. enforce_task_invariants() — the existing BEFORE INSERT OR UPDATE trigger on `tasks` (already
--      fires on every write path: create_task's own INSERT, the plain `.from("tasks").update(...)`
--      the Supabase provider's updateTask uses, and any other future path) gains one more check: a
--      Task's workstream_id may never be NEWLY set (on INSERT, or an UPDATE that actually changes
--      workstream_id) to a Workstream whose status is 'cancelled'. A Task that already lives on a
--      since-archived Workstream is untouched by this check as long as workstream_id isn't itself
--      changing — editing that Task's title/status/checklist/etc. keeps working exactly as before;
--      only a NEW assignment onto an archived Workstream is rejected. This is the necessary fix: the
--      hosted `tasks_insert` RLS policy (`with_check: can_access_workstream(workstream_id)`) and
--      `tasks_update` policy (`can_edit_task(id)`) both currently allow a direct client write with no
--      workstream-status check at all, so relying on the RPC/UI alone would leave a real bypass.
--
--   2. create_task() gains an explicit, early, friendlier-message check for the same rule (the
--      trigger above would already catch it, but failing fast with a clear message before any of the
--      RPC's other work — including the "auto-enable a not-yet-configured Activity" side effect —
--      runs is a better experience than surfacing a raw trigger exception after partial work). Every
--      other line of create_task is byte-for-byte unchanged from the currently-applied
--      20260910090000_employee_service_activity_authorization_parity.sql.
--
-- Neither change touches authorization (who may create/edit a Task), Task status semantics, or any
-- Project/Workstream lifecycle rule — this is purely "which Workstream a Task may newly point at."
-- ============================================================================================

-- 1. enforce_task_invariants — archived-Workstream guard added at the very top, before every
--    existing check; everything below it is unchanged.
create or replace function public.enforce_task_invariants()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

-- 2. create_task — one early, friendlier-message check added right after the Workstream is
--    resolved/access-checked; every other line unchanged from the currently-applied
--    20260910090000_employee_service_activity_authorization_parity.sql.
create or replace function public.create_task(
  p_title text,
  p_description text,
  p_workstream_id uuid,
  p_activity_id uuid,
  p_assignee_ids uuid[],
  p_allow_unassigned boolean,
  p_status text,
  p_priority text,
  p_due_date date,
  p_expected_minutes integer,
  p_template_id uuid,
  p_checklist_items text[],
  p_start_date date default null::date,
  p_status_reason text default null::text
)
returns public.tasks
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ws public.workstreams;
  new_task public.tasks;
  effective_assignee_ids uuid[];
  self_added boolean;
  i int;
  activity_already_enabled boolean;
  may_extend_activities boolean;
  project_status text;
begin
  select * into ws from public.workstreams where id = p_workstream_id;
  if not found then
    raise exception 'Workstream not found.';
  end if;
  if not public.can_access_workstream(p_workstream_id) then
    raise exception 'You don''t have access to that workstream.';
  end if;

  -- CD-162 final gap closure — fail fast, before any of this RPC's other work (including the
  -- "auto-enable a not-yet-configured Activity" side effect below), with a clear message; the
  -- enforce_task_invariants trigger below would also catch this on the final insert regardless, so
  -- this is a UX improvement over that guard, never a replacement for it.
  if ws.status = 'cancelled' then
    raise exception 'This Service is archived — reactivate it before adding new Tasks.';
  end if;

  -- Boss-Aligned Project Status Restoration — a Project must be Active to receive new operational
  -- work; every other normal state (On Hold/Completed/Canceled/Archived) blocks it with its own
  -- accurate explanation, same as Trash.
  if ws.project_id is not null then
    select status into project_status from public.projects where id = ws.project_id;
    if project_status is distinct from 'active' then
      raise exception '%', case project_status
        when 'archived' then 'This client is archived. Reactivate the client to add new work.'
        when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
        when 'completed' then 'This project is completed. Return it to Active to add new work.'
        when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
        when 'trash' then 'This project is in Trash — restore it first.'
        else 'This project must be Active to add new work.'
      end;
    end if;
  end if;

  -- Contextual Activity extension: only when a specific Activity was requested and it isn't
  -- already part of this Workstream's configured set. A Workstream with zero configured Activities
  -- at all (legacy/no-catalog service) is untouched by this branch — enforce_task_invariants
  -- already lets any catalog Activity through for that case, exactly as before.
  if p_activity_id is not null then
    select exists (
      select 1 from public.workstream_activities where workstream_id = p_workstream_id and activity_id = p_activity_id
    ) into activity_already_enabled;

    if not activity_already_enabled then
      -- Boss-approved final rule (MVP Gap Closure) — an Employee can never configure a Service's
      -- Activities, including implicitly via Task creation; only Supervisor/Superadmin may.
      may_extend_activities :=
        public.is_superadmin()
        or (public.is_supervisor() and public.manages_user(ws.lead_user_id) and public.can_access_project(ws.project_id));

      if not may_extend_activities then
        raise exception 'That activity is not yet enabled for this service, and you don''t have permission to add it.';
      end if;

      insert into public.workstream_activities (workstream_id, activity_id) values (p_workstream_id, p_activity_id);
      -- enforce_workstream_activity_service_match fires here, rejecting an Activity that doesn't
      -- belong to this Workstream's own service line — same as any other caller's insert.
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
$function$;
