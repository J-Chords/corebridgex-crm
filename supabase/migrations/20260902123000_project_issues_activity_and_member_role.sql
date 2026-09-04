-- Project Level Part 10 — Issues gain an optional Activity relation, validated against the
-- existing catalog (activities + workstream_activities), never a duplicate/new activity concept.
-- Part 11 — project_members gains an optional, Project-scoped "Project Role / Responsibility" text
-- field — data only, never a new global authorization role, never consulted by any access helper.

alter table public.project_issues add column activity_id uuid references public.activities(id);

-- Old 6-arg signatures are different overloads from the 7-arg ones below — drop explicitly.
drop function if exists public.create_project_issue(uuid, text, text, uuid, uuid, uuid);
drop function if exists public.update_project_issue_details(uuid, text, text, uuid, uuid, uuid);

create or replace function public.create_project_issue(
  target_project_id uuid, p_title text, p_description text, p_workstream_id uuid, p_task_id uuid,
  p_assigned_to uuid, p_activity_id uuid default null
)
 returns project_issues
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_issue public.project_issues;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  if not public.can_access_project(target_project_id) then
    raise exception 'You don''t have access to this project.';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Title can''t be empty.';
  end if;
  if p_workstream_id is not null and not exists (select 1 from public.workstreams where id = p_workstream_id and project_id = target_project_id) then
    raise exception 'Service not found on this project.';
  end if;
  if p_task_id is not null and not exists (
    select 1 from public.tasks t join public.workstreams w on w.id = t.workstream_id
    where t.id = p_task_id and w.project_id = target_project_id
  ) then
    raise exception 'Task not found on this project.';
  end if;
  if p_activity_id is not null then
    if p_workstream_id is null then
      raise exception 'An Activity requires its Service to be selected too.';
    end if;
    if not exists (
      select 1 from public.workstream_activities wa
      where wa.workstream_id = p_workstream_id and wa.activity_id = p_activity_id
    ) then
      raise exception 'That Activity does not belong to the selected Service.';
    end if;
  end if;
  if p_assigned_to is not null and not exists (select 1 from public.profiles where id = p_assigned_to and active) then
    raise exception 'Assignee not found or inactive.';
  end if;

  insert into public.project_issues (project_id, title, description, created_by, assigned_to, workstream_id, task_id, activity_id)
  values (target_project_id, trim(p_title), p_description, auth.uid(), p_assigned_to, p_workstream_id, p_task_id, p_activity_id)
  returning * into new_issue;
  return new_issue;
end;
$function$;

create or replace function public.update_project_issue_details(
  target_issue_id uuid, p_title text, p_description text, p_assigned_to uuid, p_workstream_id uuid,
  p_task_id uuid, p_activity_id uuid default null
)
 returns project_issues
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.project_issues;
  updated public.project_issues;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.project_issues where id = target_issue_id;
  if not found then
    raise exception 'Issue not found.';
  end if;
  if existing.created_by <> auth.uid() and not public.is_superadmin() then
    raise exception 'Only the issue''s reporter or an admin can edit its details.';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Title can''t be empty.';
  end if;
  if p_workstream_id is not null and not exists (select 1 from public.workstreams where id = p_workstream_id and project_id = existing.project_id) then
    raise exception 'Service not found on this project.';
  end if;
  if p_task_id is not null and not exists (
    select 1 from public.tasks t join public.workstreams w on w.id = t.workstream_id
    where t.id = p_task_id and w.project_id = existing.project_id
  ) then
    raise exception 'Task not found on this project.';
  end if;
  if p_activity_id is not null then
    if p_workstream_id is null then
      raise exception 'An Activity requires its Service to be selected too.';
    end if;
    if not exists (
      select 1 from public.workstream_activities wa
      where wa.workstream_id = p_workstream_id and wa.activity_id = p_activity_id
    ) then
      raise exception 'That Activity does not belong to the selected Service.';
    end if;
  end if;
  if p_assigned_to is not null and not exists (select 1 from public.profiles where id = p_assigned_to and active) then
    raise exception 'Assignee not found or inactive.';
  end if;

  update public.project_issues
  set title = trim(p_title), description = p_description, assigned_to = p_assigned_to,
      workstream_id = p_workstream_id, task_id = p_task_id, activity_id = p_activity_id, updated_at = now()
  where id = target_issue_id
  returning * into updated;
  return updated;
end;
$function$;

revoke all on function public.create_project_issue(uuid, text, text, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.create_project_issue(uuid, text, text, uuid, uuid, uuid, uuid) to authenticated, service_role;
revoke all on function public.update_project_issue_details(uuid, text, text, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.update_project_issue_details(uuid, text, text, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Part 11 — Project member responsibility (data only).
-- ---------------------------------------------------------------------------
alter table public.project_members add column project_role text;

create or replace function public.set_project_member_role(target_project_id uuid, target_user_id uuid, p_project_role text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can set a Project member''s role/responsibility.';
  end if;
  update public.project_members
  set project_role = nullif(trim(coalesce(p_project_role, '')), '')
  where project_id = target_project_id and user_id = target_user_id;
  if not found then
    raise exception 'That user is not a member of this project.';
  end if;
end;
$function$;

revoke all on function public.set_project_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_project_member_role(uuid, uuid, text) to authenticated, service_role;
