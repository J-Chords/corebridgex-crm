-- Phase 7 assignee-hardening item (flagged as a known limitation in the Phase 7A-C report):
-- task_assignees' own INSERT policy only checked can_edit_task(task_id) — whether the ACTOR may
-- edit the task at all — never whether each individual assignee id is a legitimate target for
-- that actor's own role/scope. The mock enforces this via resolveAssigneeIds/assignableStaffFor
-- (employee -> self only; supervisor -> self + direct reports; superadmin -> anyone active) in
-- the provider layer only, which the real app's UI already respects but a direct API/PostgREST
-- call could bypass.
--
-- Fix: a single BEFORE INSERT trigger reusing the already-existing manages_user() helper. This
-- one check turns out to exactly reproduce assignableStaffFor's scope for all three roles at
-- once, with no new role-branching logic needed:
--   manages_user(new.user_id) = auth.uid() = new.user_id            (self       -- covers Employee
--                                                                       assigning only themselves)
--                              OR is_superadmin()                    (any active user -- Superadmin)
--                              OR (is_supervisor() AND new.user_id's supervisor_id = auth.uid())
--                                                                    (direct report -- Supervisor)
-- Small and self-contained, per the phase instructions' explicit "do not expand into a large
-- permission rewrite" guidance — this is the one narrow trigger, nothing more.
--
-- Note for future migrations: this trigger fires for every role including service_role, and
-- manages_user() depends on auth.uid() — a future migration/seed that needs to insert
-- task_assignees rows directly via SQL (outside an authenticated app session) will need to either
-- avoid task_assignees inserts or temporarily disable this trigger for that statement.

create function public.enforce_task_assignee_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.user_id and active) then
    raise exception 'Assignee must be an active user.';
  end if;
  if not public.manages_user(new.user_id) then
    raise exception 'You can only assign users within your own scope.';
  end if;
  return new;
end;
$$;

create trigger task_assignees_enforce_scope
  before insert on public.task_assignees
  for each row execute function public.enforce_task_assignee_scope();

-- Trigger-only function, same precedent as the other enforce_* trigger functions in this
-- project (enforce_workstream_service_requirement, enforce_task_invariants, etc.) — no direct
-- EXECUTE grant to any role; trigger firing never requires the triggering role to hold EXECUTE.
revoke execute on function public.enforce_task_assignee_scope() from public, anon, authenticated, service_role;
