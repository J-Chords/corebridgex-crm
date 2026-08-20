-- Phase 9B security hotfix — `finalize_client_report` (last redefined in
-- 20260820110000_client_report_finalize_fix.sql) authorized finalization as simply
-- `is_supervisor() or is_superadmin()`, with NO check that the report is actually within that
-- Supervisor's own legitimate team/view scope. Because the function is SECURITY DEFINER, that made
-- `is_supervisor()` alone an unconditional, organization-wide finalize bypass at the server layer —
-- ANY Supervisor could finalize ANY Client Report by id, not just their own team's — directly
-- violating the locked "Supervisor = Employee + legitimate direct-report/team privileges, never
-- organization-wide" rule, and conflating "is a Supervisor" with "is a Sparing Efficiency reviewer"
-- (a distinct, not-yet-built capability — see docs/product-brief.md's Phase 9 notes).
--
-- Fixed by reusing the existing, authoritative `can_view_client_report()` helper — a Supervisor may
-- now finalize a report only if they can already legitimately VIEW it (owner, or manages the
-- report's own generator), matching the same scope `canViewClientReport`/Team Updates/every other
-- Supervisor-scoped feature in this app already uses. Superadmin remains unconditional. Also adds a
-- Project-dimension defense-in-depth check (`can_access_project`) for Project-scoped reports —
-- legacy reports with `project_id is null` fall back to the view-scope check alone, so the one
-- existing seeded legacy report is unaffected.
--
-- Forward-only, via `create or replace` — none of 20260814110006_client_reports.sql,
-- 20260820090000_client_reports_project_scope.sql, or 20260820110000_client_report_finalize_fix.sql
-- is edited.

create or replace function public.finalize_client_report(target_report_id uuid)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.client_reports;
  result public.client_reports;
begin
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;

  -- Authorization is checked BEFORE the already-finalized idempotent short-circuit below (tightened
  -- ordering vs. the prior version) — an unauthorized caller must never be able to read this row's
  -- content back, even via the "already finalized, just return it" convenience path.
  if not (
    public.is_superadmin()
    or (
      public.is_supervisor()
      and public.can_view_client_report(target_report_id)
      and (existing.project_id is null or public.can_access_project(existing.project_id))
    )
  ) then
    raise exception 'You do not have permission to finalize this report.';
  end if;

  if existing.status = 'finalized' then return existing; end if;

  update public.client_reports
  set status = 'finalized', finalized_at = now(), updated_at = now(),
      history = existing.history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'type', 'finalized', 'actorId', auth.uid(),
        'actorName', (select full_name from public.profiles where id = auth.uid()), 'createdAt', now()
      ))
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

-- Re-asserted explicitly (CREATE OR REPLACE already preserves existing grants, but this hotfix
-- touches the function's own authorization body, so the privilege boundary is re-stated for
-- clarity/defense-in-depth rather than assumed).
revoke execute on function public.finalize_client_report(uuid) from public, anon;
grant execute on function public.finalize_client_report(uuid) to authenticated, service_role;
