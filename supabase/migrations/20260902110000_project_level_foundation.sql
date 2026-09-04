-- Project Level — Stage C foundation. Forward-only; never edits any already-hosted migration.
--
-- Adds: Project status-lifecycle metadata (reason/changed_at/changed_by, trash/restore with
-- pre_trash_status, archived), Completion Date, Project Group, Tags; new project_groups,
-- project_comments (threaded), project_issues tables; RPCs for status transitions, comments,
-- issues. Preserves the existing Company/Project two-table structure (no schema merge), the
-- existing Creator (created_by) vs Owner (owner_id) distinction, and does not widen any
-- Company/Project/Workstream/Task/Documents/Time/Reports authorization based on Service staffing.

-- ---------------------------------------------------------------------------
-- projects: new columns
-- ---------------------------------------------------------------------------
alter table public.projects
  add column status_reason text,
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references public.profiles(id),
  add column trashed_at timestamptz,
  add column pre_trash_status text,
  add column completion_date date,
  add column project_group_id uuid,
  add column tags text[] not null default '{}';

alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status = any (array['active', 'on-hold', 'completed', 'cancelled', 'archived', 'trash']));

-- ---------------------------------------------------------------------------
-- project_groups — simple optional catalog (2026 Tax Season, Annual Accounting Clients, etc.),
-- never confused with Company/Service/Tag. Same read-all/admin-write shape as service_lines.
-- ---------------------------------------------------------------------------
create table public.project_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.project_groups enable row level security;
create policy "project_groups_select_all" on public.project_groups for select using (true);
create policy "project_groups_write_admin" on public.project_groups
  for all using (public.is_superadmin()) with check (public.is_superadmin());
grant select on public.project_groups to authenticated;
grant insert, update, delete on public.project_groups to authenticated, service_role;

alter table public.projects
  add constraint projects_project_group_id_fkey
  foreign key (project_group_id) references public.project_groups(id) on delete set null;

-- ---------------------------------------------------------------------------
-- project_comments — threaded discussion, distinct from the existing append-only Notes model.
-- Soft-delete only (deleted_at), never a hard delete. All mutation via RPC below (no direct
-- INSERT/UPDATE grant to authenticated) so the exact author/active/project-access rules live in
-- one place, not duplicated between RLS and application code.
-- ---------------------------------------------------------------------------
create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_comment_id uuid references public.project_comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.project_comments enable row level security;
create policy "project_comments_select" on public.project_comments
  for select using (
    deleted_at is null
    and public.is_current_user_active()
    and public.can_access_project(project_id)
  );
grant select on public.project_comments to authenticated;

-- ---------------------------------------------------------------------------
-- project_issues — a real, separate concept from a blocked Task; may relate to the whole Project,
-- a Service (workstream), a Task, or nothing yet. All mutation via RPC below.
-- ---------------------------------------------------------------------------
create table public.project_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'in-progress', 'resolved', 'cancelled')),
  created_by uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  workstream_id uuid references public.workstreams(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.project_issues enable row level security;
create policy "project_issues_select" on public.project_issues
  for select using (public.is_current_user_active() and public.can_access_project(project_id));
grant select on public.project_issues to authenticated;

-- ---------------------------------------------------------------------------
-- Status lifecycle RPCs — Admin-only. set_project_status covers active/on-hold/completed/
-- cancelled/archived (never 'trash', which has its own dedicated action; never restores out of
-- trash either, which also has its own dedicated action — status-select is never a substitute for
-- the explicit Restore action). Reason required for on-hold/cancelled. Completion Date defaults to
-- today when moving to completed and none is already set.
-- ---------------------------------------------------------------------------
create or replace function public.set_project_status(target_project_id uuid, new_status text, p_reason text default null)
 returns projects
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.projects;
  updated public.projects;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can change a project''s status.';
  end if;
  if new_status not in ('active', 'on-hold', 'completed', 'cancelled', 'archived') then
    raise exception 'Invalid status for this action: %', new_status;
  end if;
  select * into existing from public.projects where id = target_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  if existing.status = 'trash' then
    raise exception 'This project is in Trash — restore it first.';
  end if;
  if new_status in ('on-hold', 'cancelled') and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required when moving a project to % .', new_status;
  end if;

  update public.projects
  set status = new_status,
      status_reason = case when new_status in ('on-hold', 'cancelled') then trim(p_reason) else null end,
      status_changed_at = now(),
      status_changed_by = auth.uid(),
      completion_date = case
        when new_status = 'completed' and existing.completion_date is null then current_date
        else existing.completion_date
      end,
      updated_at = now()
  where id = target_project_id
  returning * into updated;
  return updated;
end;
$function$;

create or replace function public.trash_project(target_project_id uuid)
 returns projects
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.projects;
  updated public.projects;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can move a project to Trash.';
  end if;
  select * into existing from public.projects where id = target_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  if existing.status = 'trash' then
    return existing;
  end if;

  update public.projects
  set pre_trash_status = existing.status,
      status = 'trash',
      trashed_at = now(),
      status_changed_at = now(),
      status_changed_by = auth.uid(),
      updated_at = now()
  where id = target_project_id
  returning * into updated;
  return updated;
end;
$function$;

create or replace function public.restore_project(target_project_id uuid)
 returns projects
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.projects;
  updated public.projects;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can restore a project from Trash.';
  end if;
  select * into existing from public.projects where id = target_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  if existing.status <> 'trash' then
    raise exception 'This project is not in Trash.';
  end if;

  update public.projects
  set status = coalesce(existing.pre_trash_status, 'active'),
      pre_trash_status = null,
      trashed_at = null,
      status_changed_at = now(),
      status_changed_by = auth.uid(),
      updated_at = now()
  where id = target_project_id
  returning * into updated;
  return updated;
end;
$function$;

revoke all on function public.set_project_status(uuid, text, text) from public, anon;
grant execute on function public.set_project_status(uuid, text, text) to authenticated, service_role;
revoke all on function public.trash_project(uuid) from public, anon;
grant execute on function public.trash_project(uuid) to authenticated, service_role;
revoke all on function public.restore_project(uuid) from public, anon;
grant execute on function public.restore_project(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_project — reworked for "Title is the only required field": p_status is gone (every new
-- Project starts 'active'); p_owner_id now optional, defaulting to the creating Admin themselves
-- (Owner and Creator remain two independent fields — defaulting them equal at creation time is not
-- the same as merging the concepts; an Admin may reassign ownership afterward via updateProject).
-- Adds the three new optional attributes this migration introduces.
-- ---------------------------------------------------------------------------
-- The old 9-arg signature (p_status required, p_owner_id required, no group/tags/completion date)
-- is a genuinely different overload from the new one below — CREATE OR REPLACE would leave it
-- behind as dead code rather than replace it, since Postgres distinguishes functions by their full
-- argument signature. Drop it explicitly (mirrors the Phase 14B reserve_document_upload overload
-- cleanup precedent).
drop function if exists public.create_project(uuid, text, uuid, text, date, integer, date, text, uuid[]);

create or replace function public.create_project(
  p_company_id uuid,
  p_name text,
  p_owner_id uuid default null,
  p_contract_start_date date default null,
  p_contract_months integer default 12,
  p_contract_end_date date default null,
  p_completion_date date default null,
  p_description text default null,
  p_project_group_id uuid default null,
  p_tags text[] default '{}',
  p_member_user_ids uuid[] default '{}'
)
 returns projects
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_project public.projects;
  effective_owner_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin may create a project.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Title can''t be empty.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found.';
  end if;

  effective_owner_id := coalesce(p_owner_id, auth.uid());
  if not exists (select 1 from public.profiles where id = effective_owner_id and active) then
    raise exception 'Owner not found or inactive.';
  end if;
  if p_project_group_id is not null and not exists (select 1 from public.project_groups where id = p_project_group_id) then
    raise exception 'Project Group not found.';
  end if;

  insert into public.projects (
    company_id, name, owner_id, status, contract_start_date, contract_months, contract_end_date,
    completion_date, description, project_group_id, tags, created_by
  ) values (
    p_company_id, trim(p_name), effective_owner_id, 'active', p_contract_start_date,
    coalesce(p_contract_months, 12), p_contract_end_date, p_completion_date, p_description,
    p_project_group_id, coalesce(p_tags, '{}'), auth.uid()
  )
  returning * into new_project;

  if coalesce(array_length(p_member_user_ids, 1), 0) > 0 then
    insert into public.project_members (project_id, user_id)
    select new_project.id, u from unnest(p_member_user_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
  end if;

  return new_project;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Comments RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_project_comment(target_project_id uuid, p_parent_comment_id uuid, p_body text)
 returns project_comments
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_comment public.project_comments;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  if not public.can_access_project(target_project_id) then
    raise exception 'You don''t have access to this project.';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Comment can''t be empty.';
  end if;
  if p_parent_comment_id is not null and not exists (
    select 1 from public.project_comments where id = p_parent_comment_id and project_id = target_project_id and deleted_at is null
  ) then
    raise exception 'Parent comment not found on this project.';
  end if;

  insert into public.project_comments (project_id, parent_comment_id, author_id, body)
  values (target_project_id, p_parent_comment_id, auth.uid(), trim(p_body))
  returning * into new_comment;
  return new_comment;
end;
$function$;

create or replace function public.update_project_comment(target_comment_id uuid, p_body text)
 returns project_comments
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.project_comments;
  updated public.project_comments;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.project_comments where id = target_comment_id;
  if not found or existing.deleted_at is not null then
    raise exception 'Comment not found.';
  end if;
  if existing.author_id <> auth.uid() then
    raise exception 'Only the comment''s own author can edit it.';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Comment can''t be empty.';
  end if;

  update public.project_comments set body = trim(p_body), updated_at = now()
  where id = target_comment_id
  returning * into updated;
  return updated;
end;
$function$;

create or replace function public.delete_project_comment(target_comment_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.project_comments;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.project_comments where id = target_comment_id;
  if not found or existing.deleted_at is not null then
    raise exception 'Comment not found.';
  end if;
  if existing.author_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'Only the comment''s own author or an admin can delete it.';
  end if;

  update public.project_comments set deleted_at = now() where id = target_comment_id;
end;
$function$;

revoke all on function public.create_project_comment(uuid, uuid, text) from public, anon;
grant execute on function public.create_project_comment(uuid, uuid, text) to authenticated, service_role;
revoke all on function public.update_project_comment(uuid, text) from public, anon;
grant execute on function public.update_project_comment(uuid, text) to authenticated, service_role;
revoke all on function public.delete_project_comment(uuid) from public, anon;
grant execute on function public.delete_project_comment(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Issues RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_project_issue(
  target_project_id uuid, p_title text, p_description text, p_workstream_id uuid, p_task_id uuid, p_assigned_to uuid
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
  if p_assigned_to is not null and not exists (select 1 from public.profiles where id = p_assigned_to and active) then
    raise exception 'Assignee not found or inactive.';
  end if;

  insert into public.project_issues (project_id, title, description, created_by, assigned_to, workstream_id, task_id)
  values (target_project_id, trim(p_title), p_description, auth.uid(), p_assigned_to, p_workstream_id, p_task_id)
  returning * into new_issue;
  return new_issue;
end;
$function$;

create or replace function public.update_project_issue_details(
  target_issue_id uuid, p_title text, p_description text, p_assigned_to uuid, p_workstream_id uuid, p_task_id uuid
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
  if p_assigned_to is not null and not exists (select 1 from public.profiles where id = p_assigned_to and active) then
    raise exception 'Assignee not found or inactive.';
  end if;

  update public.project_issues
  set title = trim(p_title), description = p_description, assigned_to = p_assigned_to,
      workstream_id = p_workstream_id, task_id = p_task_id, updated_at = now()
  where id = target_issue_id
  returning * into updated;
  return updated;
end;
$function$;

create or replace function public.set_project_issue_status(target_issue_id uuid, new_status text, p_resolution text default null)
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
  if new_status not in ('open', 'in-progress', 'resolved', 'cancelled') then
    raise exception 'Invalid issue status: %', new_status;
  end if;
  select * into existing from public.project_issues where id = target_issue_id;
  if not found then
    raise exception 'Issue not found.';
  end if;
  if existing.created_by <> auth.uid()
     and (existing.assigned_to is null or existing.assigned_to <> auth.uid())
     and not public.is_superadmin()
  then
    raise exception 'Only the issue''s reporter, its assignee, or an admin may progress it.';
  end if;

  update public.project_issues
  set status = new_status,
      resolution = case when new_status = 'resolved' then p_resolution else existing.resolution end,
      resolved_at = case when new_status = 'resolved' then now() when new_status = 'open' then null else existing.resolved_at end,
      updated_at = now()
  where id = target_issue_id
  returning * into updated;
  return updated;
end;
$function$;

revoke all on function public.create_project_issue(uuid, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.create_project_issue(uuid, text, text, uuid, uuid, uuid) to authenticated, service_role;
revoke all on function public.update_project_issue_details(uuid, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.update_project_issue_details(uuid, text, text, uuid, uuid, uuid) to authenticated, service_role;
revoke all on function public.set_project_issue_status(uuid, text, text) from public, anon;
grant execute on function public.set_project_issue_status(uuid, text, text) to authenticated, service_role;
