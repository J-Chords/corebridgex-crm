-- Service Level Phase B, Section 3 — Project Service Lead reassignment security correction.
--
-- The audit found an inconsistency: `create_workstream` already validates who may become
-- lead_user_id (Employee: self only; Supervisor: self or a direct report; Superadmin: anyone), but
-- `workstreams_update`'s WITH CHECK never re-validated the *new* lead_user_id on an edit — a
-- Supervisor with `can_access_workstream` on a row could reassign its lead to an arbitrary,
-- unmanaged user. Employees cannot reach this policy at all (`workstreams_update`'s USING already
-- requires is_supervisor()/is_superadmin()), so only the Supervisor path needed closing.
--
-- Fix: add `manages_user(lead_user_id)` to WITH CHECK. `manages_user` already returns true
-- unconditionally for a Superadmin actor (see its own definition), so Superadmin stays fully
-- unrestricted — this is a pure narrowing of the Supervisor path, mirroring create_workstream's own
-- "self or a direct report" rule exactly. USING (which governs which existing rows may be touched at
-- all) is intentionally left unchanged — the eligibility check only applies to the *new* value.

drop policy "workstreams_update" on public.workstreams;

create policy "workstreams_update" on public.workstreams
  for update
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_workstream(id))
  with check (
    (public.is_supervisor() or public.is_superadmin())
    and public.can_access_workstream(id)
    and public.manages_user(lead_user_id)
  );
