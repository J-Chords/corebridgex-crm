-- Admin Foundation Part 6/7 — global Service staffing (Team Lead / Employee membership).
--
-- Two concrete tables, not one polymorphic "service_members" with a type column (same reasoning
-- as this schema's own `notes` precedent: Leadership and Membership have genuinely different
-- write-rules — Leadership is role-restricted to active supervisors, Membership is broader).
-- Global to the Service, never per-Project/per-Workstream — no project_id/workstream_id column on
-- either table, and this migration never touches workstream_members or workstreams.lead_user_id.
-- Composite primary key (service_line_id, user_id) makes a duplicate pair structurally impossible.
-- Admin-write-only. Per Stage 0 Correction 2, this is staffing/organizational data only — it does
-- not broaden can_access_company/can_access_project/can_access_workstream/can_access_task/
-- can_access_task_directly/can_edit_task/can_progress_task/Documents/Time/Reports/Team Updates.

create table public.service_team_leads (
  service_line_id uuid not null references public.service_lines(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (service_line_id, user_id)
);

create table public.service_employees (
  service_line_id uuid not null references public.service_lines(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (service_line_id, user_id)
);

alter table public.service_team_leads enable row level security;
alter table public.service_employees enable row level security;

-- Role-eligibility enforced at the DB layer regardless of write path (RPC below, or any future raw
-- write) — never just an application-level check the client could bypass.
create or replace function public.enforce_service_team_lead_eligibility()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.profiles where id = new.user_id and active and role = 'supervisor'
  ) then
    raise exception 'User % is not an active Team-Lead-eligible user.', new.user_id;
  end if;
  return new;
end;
$function$;

create or replace function public.enforce_service_employee_eligibility()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.user_id and active and role in ('employee', 'supervisor')
  ) then
    raise exception 'User % is not an active Employee-membership-eligible user.', new.user_id;
  end if;
  return new;
end;
$function$;

create trigger service_team_leads_check
  before insert or update on public.service_team_leads
  for each row execute function public.enforce_service_team_lead_eligibility();

create trigger service_employees_check
  before insert or update on public.service_employees
  for each row execute function public.enforce_service_employee_eligibility();

-- Visible org-wide (staffing/organizational data, not sensitive) — mutation is superadmin-only.
create policy "service_team_leads_select_all" on public.service_team_leads
  for select using (true);
create policy "service_employees_select_all" on public.service_employees
  for select using (true);

create policy "service_team_leads_write_admin" on public.service_team_leads
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy "service_employees_write_admin" on public.service_employees
  for all using (public.is_superadmin()) with check (public.is_superadmin());

grant select on public.service_team_leads to authenticated;
grant select on public.service_employees to authenticated;
grant insert, update, delete on public.service_team_leads to authenticated, service_role;
grant insert, update, delete on public.service_employees to authenticated, service_role;

-- Replace-set RPCs, both directions (per-user and per-service), covering all four entry points the
-- Admin UI/Service management UI need (Create User, Edit User, Service management, and the future
-- Project-Service entry point hook) without ever exposing a raw multi-row write to the client.

create or replace function public.admin_set_user_service_leadership(p_user_id uuid, p_service_line_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can manage Service staffing.';
  end if;
  delete from public.service_team_leads where user_id = p_user_id;
  insert into public.service_team_leads (service_line_id, user_id)
  select distinct sid, p_user_id from unnest(p_service_line_ids) as sid;
end;
$function$;

create or replace function public.admin_set_user_service_membership(p_user_id uuid, p_service_line_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can manage Service staffing.';
  end if;
  delete from public.service_employees where user_id = p_user_id;
  insert into public.service_employees (service_line_id, user_id)
  select distinct sid, p_user_id from unnest(p_service_line_ids) as sid;
end;
$function$;

create or replace function public.admin_set_service_team_leads(p_service_line_id uuid, p_user_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can manage Service staffing.';
  end if;
  delete from public.service_team_leads where service_line_id = p_service_line_id;
  insert into public.service_team_leads (service_line_id, user_id)
  select distinct p_service_line_id, uid from unnest(p_user_ids) as uid;
end;
$function$;

create or replace function public.admin_set_service_employees(p_service_line_id uuid, p_user_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can manage Service staffing.';
  end if;
  delete from public.service_employees where service_line_id = p_service_line_id;
  insert into public.service_employees (service_line_id, user_id)
  select distinct p_service_line_id, uid from unnest(p_user_ids) as uid;
end;
$function$;

revoke all on function public.admin_set_user_service_leadership(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_user_service_leadership(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.admin_set_user_service_membership(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_user_service_membership(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.admin_set_service_team_leads(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_service_team_leads(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.admin_set_service_employees(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_service_employees(uuid, uuid[]) to authenticated, service_role;

-- Part 7 — role-change cleanup, exactly matching Stage 0 Corrections 3/4 (never editing the
-- already-hosted profiles.sql definition; this is a fresh CREATE OR REPLACE in a forward-only
-- migration). Team Lead -> Employee: delete service_team_leads only, never auto-convert to
-- service_employees. Team Lead/Employee -> Admin: delete both (Admin never holds either kind of
-- Service relationship). Employee -> Team Lead and Admin -> Team Lead/Employee: no automatic
-- change here — only explicit UI selections add new rows, handled by the RPCs above.
create or replace function public.admin_set_user_role(target_id uuid, new_role text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can change a user''s role.';
  end if;
  if new_role not in ('superadmin', 'supervisor', 'employee') then
    raise exception 'Invalid role: %', new_role;
  end if;
  update public.profiles set role = new_role where id = target_id;
  if not found then
    raise exception 'Profile % not found.', target_id;
  end if;

  if new_role = 'employee' then
    delete from public.service_team_leads where user_id = target_id;
  elsif new_role = 'superadmin' then
    delete from public.service_team_leads where user_id = target_id;
    delete from public.service_employees where user_id = target_id;
  end if;
end;
$function$;
