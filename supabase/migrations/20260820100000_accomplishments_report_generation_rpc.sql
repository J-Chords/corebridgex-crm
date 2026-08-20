-- Phase 9B — Accomplishments Report generation moved off a raw INSERT onto a SECURITY DEFINER
-- RPC, for consistency with every other mutation on this table and to close the same raw-insert/
-- RETURNING-vs-RLS-visibility architectural inconsistency addressed for Client Reports in this
-- same slice. Content model/evidence-gathering logic is completely unchanged — this migration only
-- relocates the final write. Forward-only: does not edit 20260814110005_accomplishments_reports.sql.
--
-- Authorization is unchanged from the original INSERT policy: person kind is always self (no role
-- restriction — it's always about your own tracked work); client kind requires ordinary company
-- access, still with no role restriction, preserving the existing "legitimate internal
-- Client-summary generation" behavior exactly (this is the internal, fully-attributed report —
-- distinct from the true, name-free Client Report, which is the one gaining a Project-scoped,
-- explicitly role-checked RPC in 20260820090000_client_reports_project_scope.sql).

drop policy if exists "accomplishments_reports_insert" on public.accomplishments_reports;
revoke insert on public.accomplishments_reports from authenticated;

create function public.generate_accomplishments_report(
  p_kind text,
  p_subject_id uuid,
  p_subject_label text,
  p_range_label text,
  p_range_start date,
  p_range_end date,
  p_brand_sections jsonb
)
returns public.accomplishments_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_user_id uuid;
  v_subject_company_id uuid;
  v_generated_by_name text;
  result public.accomplishments_reports;
begin
  if p_kind not in ('person', 'client') then
    raise exception 'Invalid report kind.';
  end if;
  if p_range_label not in ('today', 'this-week', 'custom') then
    raise exception 'Invalid range label.';
  end if;
  if p_range_start > p_range_end then
    raise exception 'Invalid date range.';
  end if;

  if p_kind = 'person' then
    -- A person report is always about yourself — the caller-supplied subject id is never trusted
    -- for this branch, mirroring the existing mock provider's own server-side override exactly.
    v_subject_user_id := auth.uid();
    v_subject_company_id := null;
  else
    if not public.can_access_company(p_subject_id) then
      raise exception 'You do not have access to generate a report for that company.';
    end if;
    v_subject_user_id := null;
    v_subject_company_id := p_subject_id;
  end if;

  select full_name into v_generated_by_name from public.profiles where id = auth.uid();

  insert into public.accomplishments_reports (
    kind, subject_user_id, subject_company_id, subject_label,
    range_label, range_start, range_end, status, brand_sections,
    generated_by, generated_by_name
  )
  values (
    p_kind, v_subject_user_id, v_subject_company_id, p_subject_label,
    p_range_label, p_range_start, p_range_end, 'draft', p_brand_sections,
    auth.uid(), v_generated_by_name
  )
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.generate_accomplishments_report(text, uuid, text, text, date, date, jsonb) from public, anon;
grant execute on function public.generate_accomplishments_report(text, uuid, text, text, date, date, jsonb) to authenticated, service_role;
