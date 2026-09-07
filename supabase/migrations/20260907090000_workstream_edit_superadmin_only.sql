-- Boss Feedback Alignment — Project Service role correction (Section 6).
--
-- Management decision: Team Lead (Supervisor) must no longer have general "Edit Service" authority
-- (Lead/Team/recurrence/schedule/status/Service Line identity) — that becomes Admin-only. Team
-- Lead/Employee keep only the already-narrow, separate capabilities this migration does NOT touch:
--   - attaching an EXISTING active Service to a Project they can access, via create_workstream
--     (a different SECURITY DEFINER RPC, unaffected by this table's own RLS);
--   - configuring an already-enabled Service's EXISTING Activities, via the workstream_activities
--     junction table's own `workstream_activities_write` policy (a separate table/policy).
--
-- This is a pure narrowing of workstreams_update (drops the is_supervisor() branch entirely) —
-- never a widening. The app-side gate (`canManageWorkstreams`, src/lib/data/permissions.ts) is
-- narrowed to Superadmin-only in the same pass.

drop policy "workstreams_update" on public.workstreams;

create policy "workstreams_update" on public.workstreams
  for update
  using (public.is_superadmin() and public.can_access_workstream(id))
  with check (public.is_superadmin() and public.can_access_workstream(id));
