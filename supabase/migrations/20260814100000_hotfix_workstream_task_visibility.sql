-- Phase 7A-7C hotfix (Bug 2) — an Employee who is a legitimate task_assignee on a Task could read
-- that Task (can_access_task already allows it: assignee + can_access_company) but Task hydration
-- then failed trying to read the Task's own parent Workstream, because can_access_workstream had
-- no path for "I'm merely a task assignee, not a workstream lead/member." A real Task's own
-- Workstream must always be readable by anyone who can legitimately read that Task — every
-- TaskWithRelations read depends on it.
--
-- Fix: can_access_workstream() gains exactly one new branch — visible when the current user is
-- assigned (task_assignees.user_id = auth.uid()) to a Task inside that Workstream AND already
-- has company access to that Task's own company. That second condition intentionally mirrors
-- can_access_task's own compound check exactly, so this new branch is never broader than the
-- Task-level visibility it exists to support — it can't grant a Workstream merely because *some*
-- task_assignees row references the current user somewhere unrelated.
--
-- Not a recursion risk: this new branch calls can_access_company() (already SECURITY DEFINER,
-- already used elsewhere) directly, not can_access_task() — and can_access_company has no
-- dependency back on can_access_workstream or can_access_task, so there's no call cycle either way.
--
-- Does NOT change: the existing superadmin/Internal-company/lead/member branches (unchanged,
-- still exactly canAccessWorkstream's mock semantics); Supervisor's own visibility (already
-- correct via manages_user() on lead/member, since every seeded workstream's lead_user_id is the
-- Supervisor); Superadmin's org-wide access. Does NOT touch workstreams_insert/_update, or any
-- other table's RLS.

create or replace function public.can_access_workstream(target_workstream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.workstreams w
      join public.companies c on c.id = w.company_id
      where w.id = target_workstream_id and c.is_internal
    )
    or exists (
      select 1 from public.workstreams w
      where w.id = target_workstream_id and public.manages_user(w.lead_user_id)
    )
    or exists (
      select 1 from public.workstream_members m
      where m.workstream_id = target_workstream_id and public.manages_user(m.user_id)
    )
    or exists (
      select 1 from public.tasks t
      join public.task_assignees ta on ta.task_id = t.id
      where t.workstream_id = target_workstream_id
        and ta.user_id = auth.uid()
        and public.can_access_company(t.company_id)
    );
$$;

-- Re-assert explicit grants rather than relying on CREATE OR REPLACE to have preserved them
-- (Phase 7's own discovered lesson: never trust an implicit/inherited grant for a function).
revoke execute on function public.can_access_workstream(uuid) from public, anon;
grant execute on function public.can_access_workstream(uuid) to authenticated;
grant execute on function public.can_access_workstream(uuid) to service_role;
