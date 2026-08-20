-- Phase 9B — Client Report Project scoping + generation moved off a raw INSERT onto a SECURITY
-- DEFINER RPC. Forward-only: does not edit 20260814110006_client_reports.sql.
--
-- Company is a permanent record; Project is the annual/contract operational boundary introduced
-- in Phase 8. A Company can have several Projects over time (e.g. "Alderleaf Manufacturing
-- 2025-2026" and "...2026-2027") — a Client Report must never mix Task/time evidence across two
-- Projects just because they share a Company. `project_id` is nullable: a legacy pre-9B report has
-- none, and none is ever fabricated for it; every NEW report's generation path requires one.

alter table public.client_reports add column project_id uuid null references public.projects (id);
create index client_reports_project_id_idx on public.client_reports (project_id);

-- Deterministic-only backfill: a legacy row's project_id is set ONLY when its own Company has
-- exactly one Project at the moment this migration runs — never guessed when a Company has zero
-- or several. As of this migration every Company in this schema still has exactly one Project (the
-- Phase 8A backfill created one per Company, and no renewal has yet been exercised against any
-- historical client_reports row's own Company), so this is expected to backfill the one seeded demo
-- row (Alderleaf Manufacturing) cleanly — but the migration makes no assumption beyond what it can
-- prove per-row at apply time; a Company with zero or several Projects at that moment is left null.
update public.client_reports r
set project_id = p.id
from public.projects p
where r.project_id is null
  and p.company_id = r.company_id
  and (select count(*) from public.projects p2 where p2.company_id = r.company_id) = 1;

-- Generation moves off the plain-table INSERT policy entirely — the old policy is dropped and the
-- table's own INSERT grant revoked, since generate_client_report() (SECURITY DEFINER, below) is
-- now the only path that can ever create a row, mirroring every other mutation on this table
-- already being RPC-only (update/finalize/reopen/comment/trash/restore/delete).
drop policy if exists "client_reports_insert" on public.client_reports;
revoke insert on public.client_reports from authenticated;

-- generate_client_report — the new atomic generation RPC (Phase 9B locked rule: "Employees may
-- generate Client Report drafts"). Identifies auth.uid(), validates Project accessibility via the
-- existing can_access_project() helper (already gives Employee "Projects they belong to,"
-- Supervisor "+ their team's," Superadmin everything — exactly the target matrix for generation,
-- no per-role branching needed here), derives Company/brand from the Project server-side (never
-- trusting a client-supplied company_id — closes the "mismatched project_id + company_id" risk),
-- validates the date range, and inserts exactly one new draft row. Runs SECURITY DEFINER so this
-- never depends on INSERT ... RETURNING visibility through the caller's own RLS the way the pre-9B
-- raw insert did — the function itself is the authorization boundary.
create function public.generate_client_report(
  p_project_id uuid,
  p_range_label text,
  p_range_start date,
  p_range_end date,
  p_departments jsonb
)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_company public.companies;
  v_brand public.brands;
  v_generated_by_name text;
  result public.client_reports;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to generate a client report for that Project.';
  end if;
  if p_range_label not in ('today', 'this-week', 'custom') then
    raise exception 'Invalid range label.';
  end if;
  if p_range_start > p_range_end then
    raise exception 'Invalid date range.';
  end if;

  select * into v_company from public.companies where id = v_project.company_id;
  if not found then
    raise exception 'Project % references unknown company %', v_project.id, v_project.company_id;
  end if;
  select * into v_brand from public.brands where id = v_company.brand_id;
  if not found then
    raise exception 'Company % references unknown brand %', v_company.id, v_company.brand_id;
  end if;
  select full_name into v_generated_by_name from public.profiles where id = auth.uid();

  insert into public.client_reports (
    project_id, company_id, company_label, brand_id, brand_label,
    range_label, range_start, range_end, status, departments,
    generated_by, generated_by_name
  )
  values (
    v_project.id, v_company.id, v_company.name, v_brand.id, v_brand.name,
    p_range_label, p_range_start, p_range_end, 'draft', p_departments,
    auth.uid(), v_generated_by_name
  )
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.generate_client_report(uuid, text, date, date, jsonb) from public, anon;
grant execute on function public.generate_client_report(uuid, text, date, date, jsonb) to authenticated, service_role;

-- finalize_client_report — authorization broadened from strictly owner-only to "owner OR a
-- Supervisor/Superadmin," since an Employee may now generate (and own) a draft but must never be
-- able to finalize it themselves (Phase 9B locked rule: "do not broaden finalize to all
-- Employees"). Every other precondition (must still be draft; appends a history event) is
-- unchanged from the original definition in 20260814110006_client_reports.sql — this is a forward
-- `create or replace`; that original migration file itself is untouched. Existing EXECUTE grants on
-- this function are preserved by CREATE OR REPLACE (not dropped), so no re-grant is needed.
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
  if not (
    existing.generated_by = auth.uid()
    or public.is_supervisor()
    or public.is_superadmin()
  ) then
    raise exception 'You do not have permission to finalize this report.';
  end if;

  -- Never "re-finalized" — a true Client Report can no longer be reopened once finalized (see the
  -- reopen_client_report execute-revoke below), so a report is only ever finalized once, ever.
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

-- Locked Phase 9B rule: a finalized true Client Report is permanently immutable and can never be
-- reopened back to draft. Retired forward-only, without editing the original migration file — the
-- function's body/definition from 20260814110006_client_reports.sql is left exactly as it was;
-- only its EXECUTE privilege for ordinary users is revoked, so it becomes genuinely unreachable
-- (a real server-side rejection, not merely a hidden UI button). service_role keeps EXECUTE for
-- any legitimate internal/ops need.
revoke execute on function public.reopen_client_report(uuid) from authenticated;
