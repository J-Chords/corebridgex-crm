-- CD-217 — fix a live System-B defect: `materialize_template_tasks` (the ONE shared helper behind
-- both live Apply-Template callers, `apply_template` and `apply_service_template_to_project`) still
-- inserts new Tasks with the stale literal `status = 'todo'` — a value that stopped satisfying
-- `tasks_status_check` back at Phase 1's status-model rename (`20260908090000_task_status_model_
-- phase1.sql`) and has never been valid since. This migration is the deferred fix that Phase 5
-- (CD-214)'s own migration explicitly flagged and declined to touch
-- (`20261001160000_phase5_retire_blocked_task_status.sql`'s header comment).
--
-- System B (`templates`/`template_tasks`/`template_checklist_items`/`apply_template`/
-- `materialize_template_tasks`/`apply_service_template_to_project`) is LIVE and remains live — this
-- is a narrow compatibility fix, never a redesign. System A (`project_templates`/
-- `project_template_services`/`project_template_activities`/`apply_project_template`) stays
-- retired, confirmed absent from hosted — not touched, not revived.
--
-- Canonical initial Task status, proven (not assumed) from three independent current sources before
-- writing this fix: `TASK_STATUS_ORDER[0]` in `src/lib/data/task-status.ts` ("not-started" is first
-- in the single canonical order every status-ordered surface derives from); the mock provider's own
-- already-correct parallel implementation, `materializeTemplateTasks` in
-- `src/lib/data/providers/mock/mock-templates-provider.ts` (already passes `status: "not-started"`,
-- confirming the mock never had this defect — left unchanged here); and the ordinary Task-creation
-- UI's own default (`task-form-dialog.tsx`'s `emptyForm`: `defaultStatus ?? "not-started"`).
--
-- The ONLY change from the current hosted body: the literal Task-insert status value. Every other
-- behavior — signature, return type, SECURITY DEFINER, search_path, grants, the per-template-task
-- loop, due-date-offset calculation, expected_minutes/description/title mapping, `template_id`
-- lineage, checklist materialization (loop + ordering), and the complete absence of any
-- authorization check inside this function (the two callers enforce authorization themselves) — is
-- preserved byte-for-byte, re-verified against the live hosted function body immediately before
-- writing this file.

create or replace function public.materialize_template_tasks(p_template_id uuid, p_workstream_id uuid, p_start_date date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tt record;
  new_task_id uuid;
  ci record;
begin
  for tt in select * from public.template_tasks where template_id = p_template_id order by position loop
    insert into public.tasks (
      title, description, workstream_id, status, priority, due_date, expected_minutes, created_by, self_added, template_id
    )
    values (
      tt.title, tt.description, p_workstream_id, 'not-started', 'medium',
      case when tt.due_days_after_start is not null then p_start_date + tt.due_days_after_start else null end,
      tt.expected_minutes, auth.uid(), false, tt.id
    )
    returning id into new_task_id;

    for ci in select * from public.template_checklist_items where template_task_id = tt.id order by position loop
      insert into public.checklist_items (task_id, description, position) values (new_task_id, ci.description, ci.position);
    end loop;
  end loop;
end;
$function$;

-- Signature is unchanged from the currently-hosted function, so existing privileges are preserved by
-- CREATE OR REPLACE alone; re-asserted explicitly here for auditability, matching every other
-- function-correction migration in this project's history.
revoke all on function public.materialize_template_tasks(uuid, uuid, date) from public, anon;
grant execute on function public.materialize_template_tasks(uuid, uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- CD-217 follow-up — Project-level Apply Template authorization gap in
-- `apply_service_template_to_project`, found while building this ticket's own new, real UI entry
-- point for this RPC (Project workspace -> Services tab -> "Apply Template"). The function has
-- always had TWO branches: create a new Workstream (delegates to `create_workstream`, which has
-- always correctly enforced `can_manage_project(p_project_id)` for a Supervisor caller, and its own
-- unconditional Superadmin branch) — and merge newly-selected Activities into an ALREADY-EXISTING
-- Workstream for that Project+Service Line, which had **no authorization check of any kind** before
-- this fix. Any authenticated caller (including Employee, or a Team Lead with no relationship to
-- that Project) could reach the merge branch simply by naming a Project/Template combination where a
-- matching Workstream already existed, and silently insert `workstream_activities` rows for it.
--
-- This was reachable only via a direct RPC call before CD-217 (no UI ever called this function) —
-- not an active exploit, but a real, live gap on a `SECURITY DEFINER` function already granted to
-- every `authenticated` user, and one this ticket's own new UI would otherwise make trivially
-- reachable through the product itself. The fix adds exactly one check, `can_manage_project
-- (p_project_id)`, before the merge/create branch split, so both branches share the identical
-- boundary the create branch already relied on — never a new or different authorization model.
-- `can_manage_project` itself already returns true unconditionally for a Superadmin, so this is a
-- single check, not a per-role branch. Every other line of this function — the Template/Project
-- existence checks, the merge-vs-create branch logic itself, the Activity-merge insert, the
-- create-branch's call into `create_workstream`/`materialize_template_tasks`, the return shape — is
-- preserved byte-for-byte, re-verified against the live hosted function body immediately before
-- writing this file.

create or replace function public.apply_service_template_to_project(
  p_template_id uuid,
  p_project_id uuid,
  p_lead_user_id uuid,
  p_team_user_ids uuid[],
  p_start_date date,
  p_activity_ids uuid[]
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tmpl record;
  existing_workstream_id uuid;
  new_ws public.workstreams;
  merged_count int;
begin
  select * into tmpl from public.templates where id = p_template_id;
  if not found then
    raise exception 'Service Template % not found.', p_template_id;
  end if;
  if tmpl.service_line_id is null then
    raise exception 'This Service Template has no Service Line configured and cannot be applied to a Project.';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project % not found.', p_project_id;
  end if;

  if not public.can_manage_project(p_project_id) then
    raise exception 'You don''t have permission to add a Service to that project.';
  end if;

  select id into existing_workstream_id
  from public.workstreams
  where project_id = p_project_id and service_line_id = tmpl.service_line_id
  limit 1;

  if existing_workstream_id is not null then
    -- Already present — never a duplicate Workstream/Tasks/checklists. Merge only the missing
    -- selected Activities; everything else about the existing Service (assignments, dates, Tasks,
    -- time, Comments, Documents) is left exactly as it is.
    insert into public.workstream_activities (workstream_id, activity_id)
    select existing_workstream_id, aid from unnest(coalesce(p_activity_ids, '{}')) as aid
    on conflict do nothing;
    get diagnostics merged_count = row_count;
    return jsonb_build_object(
      'status', 'merged',
      'workstreamId', existing_workstream_id,
      'serviceLineId', tmpl.service_line_id,
      'activitiesMerged', merged_count
    );
  end if;

  new_ws := public.create_workstream(
    tmpl.name, tmpl.description, null, p_project_id, tmpl.service_line_id, p_lead_user_id,
    coalesce(p_team_user_ids, '{}'), coalesce(p_activity_ids, '{}'), 'active', p_start_date, null,
    tmpl.recurrence_frequency,
    case when tmpl.recurrence_frequency is not null then p_start_date else null end,
    tmpl.recurrence_custom_interval_days,
    null
  );

  perform public.materialize_template_tasks(p_template_id, new_ws.id, p_start_date);

  return jsonb_build_object('status', 'created', 'workstreamId', new_ws.id, 'serviceLineId', tmpl.service_line_id);
end;
$function$;

-- Signature is unchanged from the currently-hosted function, so existing privileges are preserved by
-- CREATE OR REPLACE alone; re-asserted explicitly here for auditability, matching every other
-- function-correction migration in this project's history.
revoke all on function public.apply_service_template_to_project(uuid, uuid, uuid, uuid[], date, uuid[]) from public, anon;
grant execute on function public.apply_service_template_to_project(uuid, uuid, uuid, uuid[], date, uuid[]) to authenticated, service_role;
