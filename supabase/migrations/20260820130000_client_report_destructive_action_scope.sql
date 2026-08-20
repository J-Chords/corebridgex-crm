-- Phase 9B security hotfix — trash_client_report/restore_client_report/
-- permanently_delete_client_report (all from 20260814110006_client_reports.sql, unchanged since)
-- authorize purely via `can_view_client_report(target_report_id)` — the same "can I see this
-- report" gate used for viewing/commenting/finalizing. That is too broad for destructive actions:
-- a Supervisor who can legitimately VIEW (and comment on, and finalize) a direct report's Client
-- Report must not automatically also get the power to trash/restore/permanently delete it — those
-- are meaningfully different, more consequential permissions than "can see it."
--
-- Fixed with the narrowest sensible interim rule (Phase 9B, not the eventual Sparing Efficiency
-- reviewer concept):
--   TRASH / RESTORE  — the report's own generator, or Superadmin. A Supervisor may trash/restore
--                      only a report they themselves generated — the direct-report/team viewing
--                      relationship alone is never enough.
--   PERMANENT DELETE — Superadmin only, always. Never the generator, regardless of role — this is
--                      an administrative retention action, not a personal "undo."
-- View/comment/finalize are untouched — still governed by can_view_client_report (this migration
-- does not touch that function or the client_reports_select RLS policy).
--
-- Forward-only, via `create or replace` — 20260814110006_client_reports.sql,
-- 20260820090000_client_reports_project_scope.sql, 20260820110000_client_report_finalize_fix.sql,
-- and 20260820120000_client_report_finalize_scope.sql are all left untouched.

create or replace function public.trash_client_report(target_report_id uuid)
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
  if not (existing.generated_by = auth.uid() or public.is_superadmin()) then
    raise exception 'Only the report''s generator or a Superadmin can move it to Trash.';
  end if;

  update public.client_reports
  set deleted_at = coalesce(deleted_at, now())
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.restore_client_report(target_report_id uuid)
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
  if not (existing.generated_by = auth.uid() or public.is_superadmin()) then
    raise exception 'Only the report''s generator or a Superadmin can restore it.';
  end if;

  update public.client_reports
  set deleted_at = null
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.permanently_delete_client_report(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.client_reports;
begin
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can permanently delete a report.';
  end if;
  if existing.deleted_at is null then
    raise exception 'Move the report to Trash before permanently deleting it.';
  end if;
  delete from public.client_reports where id = target_report_id;
end;
$$;

-- Re-asserted explicitly (CREATE OR REPLACE already preserves existing grants, but this hotfix
-- touches each function's own authorization body, so the privilege boundary is re-stated for
-- clarity/defense-in-depth rather than assumed).
revoke execute on function public.trash_client_report(uuid) from public, anon;
revoke execute on function public.restore_client_report(uuid) from public, anon;
revoke execute on function public.permanently_delete_client_report(uuid) from public, anon;

grant execute on function public.trash_client_report(uuid) to authenticated, service_role;
grant execute on function public.restore_client_report(uuid) to authenticated, service_role;
grant execute on function public.permanently_delete_client_report(uuid) to authenticated, service_role;
