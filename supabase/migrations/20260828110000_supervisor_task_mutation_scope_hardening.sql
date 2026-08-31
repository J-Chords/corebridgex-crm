-- Phase 13 final security hardening — Supervisor Task-mutation scope correction.
--
-- Audited finding (re-reading the CURRENT, never-redefined source, not assumed): `can_edit_task`
-- and `can_progress_task` (both defined once, in 20260814090002_tasks.sql, never touched by any
-- later migration) are:
--   can_edit_task:     is_supervisor() OR is_superadmin() OR (self_added creator)
--   can_progress_task: is_supervisor() OR is_superadmin() OR (assignee)
-- Both are role-global for Supervisor — ANY Supervisor may edit/progress ANY Task in the entire
-- org, including one they have no legitimate relationship to at all (not their own, not a direct
-- report's, not even in a Company they can access). This directly conflicts with the locked
-- product model ("Supervisor = Employee experience + legitimate direct-report/team privileges,
-- NEVER org-wide") and is a genuine authorization gap, not merely a UI-completeness gap: every RLS
-- policy and RPC gated on these two functions (`tasks_update`, `task_assignees_write`,
-- `checklist_items_write`, `update_task_status`, `toggle_checklist_item`,
-- `add_task_checklist_item`, and this phase's own `delete_task`) inherited the same over-broad
-- Supervisor scope, regardless of what the UI ever renders or lets a Supervisor click.
--
-- Fix: Supervisor's branch in both functions is narrowed from an unconditional `is_supervisor()` to
-- `is_supervisor() AND can_access_task_directly(target_task_id)` — reusing the exact existing,
-- already-documented mutation-safe helper (`20260821210000_subtask_direct_access_canonical_fix.sql`:
-- "Use this (never can_access_task) as the authorization gate for any MUTATION or side-effect on a
-- Task"). `can_access_task_directly` is a thin wrapper over `can_user_access_task(auth.uid(), id)`:
-- Superadmin unconditional; Supervisor via a direct-report/self assignee match, or an unassigned
-- Task in an accessible Company; a direct assignee with Company access. Deliberately NOT
-- `can_access_task` (the broader, hierarchy-inclusive READ-visibility function that also grants
-- one-hop parent/child Subtask visibility) — using that instead would have let a Supervisor gain
-- EDIT/PROGRESS rights over a Subtask they can merely *see* for context (because they manage the
-- parent Task's own assignee) despite having no direct relationship to the Subtask's own assignee,
-- exactly the kind of over-grant this hardening exists to close. `can_access_task_directly` already
-- carries this same distinction on its own — it is the pre-existing, correct choice, not a new
-- concept invented for this migration.
--
-- Superadmin and Employee behavior are completely UNCHANGED: Superadmin's branch is untouched;
-- Employee never had a `is_supervisor()`-gated branch to begin with, so narrowing that branch alone
-- cannot affect them. Employee full-edit remains exactly the existing self-added-creator rule
-- (`can_edit_task`'s third branch, untouched); Employee progress remains exactly the existing
-- direct-assignee rule (`can_progress_task`'s third branch, untouched) — an ordinary assigned
-- Employee still cannot full-edit a Supervisor-created Task's metadata merely because they can
-- progress it, exactly as already locked.
--
-- Recursion analysis (required before composing any helper into these two functions): read the
-- CURRENT bodies of `can_access_task`, `can_access_task_directly` (-> `can_user_access_task`),
-- `can_access_company` (-> `can_user_access_company`), `manages_user`, and `is_supervisor`/
-- `is_superadmin` in full. None of them reference `can_edit_task` or `can_progress_task` anywhere,
-- directly or transitively — the dependency graph is a clean DAG (can_edit_task/can_progress_task
-- -> can_access_task_directly -> can_user_access_task -> {profiles, task_assignees, tasks,
-- can_user_access_company} -> {companies, project_members, profiles}), never a cycle back to
-- either function being replaced here. All of these are `language sql security definer`, the same
-- proven-safe composition pattern already used throughout this schema (e.g. can_access_workstream
-- already calls manages_user; can_access_task already calls can_access_company) — composing another
-- already-existing SECURITY DEFINER helper is not a new risk category.
--
-- can_log_time_on_task is untouched by this migration (not referenced, not redefined) — time
-- logging remains its own, separate, explicit assignee-only rule for every role, exactly as locked.
--
-- delete_task (20260828100000, already hosted) is NOT edited by this migration — it calls
-- `public.can_edit_task(p_task_id)` by name, so it automatically inherits this corrected, scoped
-- boundary the moment this migration replaces that function. Its own FOR UPDATE lock, TimeEntry/
-- Note/Subtask blockers, and every other already-reviewed property are completely unaffected.
--
-- No new RLS, no new table grant, no new role. `tasks_update`/`task_assignees_write`/
-- `checklist_items_write` (which reference `can_edit_task(id)`/`can_edit_task(task_id)` by name in
-- their own `using`/`with check` clauses) and `update_task_status`/`toggle_checklist_item`/
-- `add_task_checklist_item` (which call `can_progress_task` by name) all automatically pick up the
-- new definitions via `create or replace function` — none of them need to be touched directly.

create or replace function public.can_edit_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or (public.is_supervisor() and public.can_access_task_directly(target_task_id))
    or exists (
      select 1 from public.tasks t
      where t.id = target_task_id and t.self_added and t.created_by = auth.uid()
    );
$$;

create or replace function public.can_progress_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or (public.is_supervisor() and public.can_access_task_directly(target_task_id))
    or exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = auth.uid());
$$;

-- Re-assert explicit grants rather than relying on CREATE OR REPLACE to have preserved them
-- (the same discipline every prior grant-touching migration in this schema already follows).
revoke all on function public.can_edit_task(uuid) from public, anon;
revoke all on function public.can_progress_task(uuid) from public, anon;
grant execute on function public.can_edit_task(uuid) to authenticated, service_role;
grant execute on function public.can_progress_task(uuid) to authenticated, service_role;
