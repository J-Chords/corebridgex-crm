-- Phase 9B hotfix — `finalize_client_report` (introduced earlier in this same slice, in
-- 20260820090000_client_reports_project_scope.sql) incorrectly kept an
-- `existing.generated_by = auth.uid()` clause alongside the new `is_supervisor() or
-- is_superadmin()` check. Since an Employee may now own (generate) a Client Report draft, that
-- leftover owner clause let an Employee-owner satisfy the check on their own — exactly the
-- "broaden finalize to all Employees" outcome the locked business rule explicitly forbids.
-- Caught by a rollback-safe role-simulated probe before this was ever exposed in the app.
--
-- Fixed by dropping the owner clause entirely: finalizing is now Supervisor/Superadmin only,
-- unconditionally, regardless of who generated the draft — a Supervisor/Superadmin who happens to
-- own their own draft still passes via the role check, so nothing legitimate is lost. Forward-only,
-- via `create or replace` — neither 20260814110006_client_reports.sql nor
-- 20260820090000_client_reports_project_scope.sql is edited.

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
  if existing.status = 'finalized' then return existing; end if;
  if not (public.is_supervisor() or public.is_superadmin()) then
    raise exception 'You do not have permission to finalize this report.';
  end if;

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
