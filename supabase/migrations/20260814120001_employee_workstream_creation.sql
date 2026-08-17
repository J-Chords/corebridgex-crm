-- Phase 7 final-acceptance hotfix (Part 2) — new boss permission rule: an Employee may create a
-- Workstream for a Company they can already access, choose its Service, select its Activities,
-- and create their own Tasks under those Activities. Previously only Supervisor/Superadmin could
-- create/manage Workstreams at all.
--
-- Smallest safe change, reasoned as follows:
-- - Task creation already needed no change: tasks_insert only ever required
--   can_access_workstream(workstream_id), with no role restriction, and task_assignees_write's
--   can_edit_task already lets a self-added task's own creator assign it — combined with the
--   existing enforce_task_assignee_scope trigger (manages_user(new.user_id)), an Employee
--   creating a Task under an accessible Workstream can already only ever self-assign it. No
--   migration needed for Task creation itself.
-- - The one real gap was workstreams_insert, which excluded Employee entirely, and
--   workstream_activities_write, which likewise required Supervisor/Superadmin.
-- - workstreams_insert now also allows an Employee, but ONLY for a company they can already
--   access (can_access_company) AND ONLY when they name themselves as the workstream's own
--   lead_user_id — this is what makes the new workstream immediately visible to them afterward
--   (can_access_workstream's existing manages_user(lead_user_id) branch, self-check), without
--   touching workstream_members at all. An Employee can never create a workstream led by someone
--   else, which would otherwise let them anonymously create org structure on another person's
--   behalf.
-- - workstream_activities_write now also allows an Employee, but ONLY on a workstream where they
--   are literally the lead_user_id — never any workstream they merely have incidental task-
--   assignee-based visibility into (the Phase 7A-C hotfix's can_access_workstream branch is
--   deliberately NOT reused here, since that would let any employee with one assigned task in
--   someone else's workstream reconfigure that workstream's Activities — far broader than
--   "select Activities for the Workstream I'm creating").
-- - workstream_members_write and workstreams_update are UNCHANGED — team/staff assignment and
--   later editing stay Supervisor/Superadmin-only, exactly as instructed ("do NOT give the
--   Employee arbitrary organization-wide staff-assignment powers merely because they may create
--   the Workstream"). An Employee-led workstream simply has zero workstream_members rows unless
--   a Supervisor/Superadmin adds some later.
-- - The Service-required-unless-Internal trigger (enforce_workstream_service_requirement) and the
--   Activity-must-belong-to-the-Workstream's-own-Service trigger
--   (enforce_workstream_activity_service_match) are both already unconditional on actor role, so
--   they continue to apply identically to an Employee-created workstream with zero changes.

drop policy "workstreams_insert" on public.workstreams;
create policy "workstreams_insert" on public.workstreams
  for insert with check (
    public.is_supervisor() or public.is_superadmin()
    or (public.is_employee() and public.can_access_company(company_id) and lead_user_id = auth.uid())
  );

drop policy "workstream_activities_write" on public.workstream_activities;
create policy "workstream_activities_write" on public.workstream_activities
  for all
  using (
    public.is_supervisor() or public.is_superadmin()
    or (public.is_employee() and exists (
      select 1 from public.workstreams w where w.id = workstream_id and w.lead_user_id = auth.uid()
    ))
  )
  with check (
    public.is_supervisor() or public.is_superadmin()
    or (public.is_employee() and exists (
      select 1 from public.workstreams w where w.id = workstream_id and w.lead_user_id = auth.uid()
    ))
  );
