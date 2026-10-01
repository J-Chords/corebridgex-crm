-- Phase 4 (CD-208 follow-on) — Project staffing candidate directory.
--
-- Bug found during Phase-4 interactive QA: the Additional Team Lead and Project Member pickers on
-- the Project detail page reused `listAssignableStaff`/`assignableStaffFor`, which is deliberately
-- team-scoped for a Supervisor caller ("self + your own direct reports" — correct and unchanged for
-- its existing uses: Company staff assignment, Workstream Lead/Team). That scoping is backed by
-- `profiles`' own RLS (a Supervisor's SELECT on `profiles` only returns themselves + their reports),
-- not just an app-layer filter — so simply removing the app-layer filter would have returned nothing
-- extra anyway.
--
-- This silently broke the locked Phase-4 requirement that Additional Team Lead/Project Member
-- selection have NO direct-report restriction ("any active Supervisor," "no direct-report
-- restriction for either Project-level picker") — confirmed during QA to be a full dead-end in this
-- app's actual seed org structure: with exactly two Supervisors (Priya Nair, Marcus Webb) and
-- neither managing the other, NEITHER could ever select the other as an Additional Team Lead
-- through the UI at all. The underlying mutation RPCs (`add_project_team_lead`/`add_project_member`)
-- were never restricted this way — this was purely a candidate-listing gap, confirmed by QA's direct
-- provider-call test succeeding where the UI picker could not.
--
-- Fix: a new, narrow, SECURITY DEFINER directory RPC specifically for Project-staffing pickers,
-- deliberately bypassing `profiles`' own team-scoped RLS — returns every active Employee/Supervisor
-- profile (never Superadmin, mirroring `assignableStaffFor`'s own implicit exclusion), unscoped by
-- reporting line. This is directory-level data (name/email/role) for populating a picker, not a
-- decision — the actual authorization decision stays entirely with
-- `add_project_team_lead`/`remove_project_team_lead`/`add_project_member`/`remove_project_member`,
-- which independently re-validate everything server-side regardless of what this listing returns.
-- Mirrors `listAssignableStaff`'s own "Employee caller gets nothing" precedent: an Employee can never
-- reach a Project-staffing picker in the UI anyway (not an authorized manager), so this stays
-- Supervisor/Superadmin-only as a least-privilege default, not because it's functionally required.

create or replace function public.list_project_staffing_candidates()
returns table (id uuid, full_name text, email text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.role
  from public.profiles p
  where p.active
    and p.role in ('employee', 'supervisor')
    and (public.is_superadmin() or public.is_supervisor())
  order by p.full_name;
$$;

comment on function public.list_project_staffing_candidates() is
  'Phase 4 (CD-208) — directory for the Additional Team Lead / Project Member pickers on the Project detail page. Deliberately unscoped by reporting line (unlike list_assignable_staff/assignableStaffFor, which stays team-scoped for its own existing uses). Returns every active Employee/Supervisor; never Superadmin. Read-only directory data — authorization is enforced independently by add_project_team_lead/remove_project_team_lead/add_project_member/remove_project_member, not by this function.';

revoke all on function public.list_project_staffing_candidates() from public, anon;
grant execute on function public.list_project_staffing_candidates() to authenticated, service_role;
