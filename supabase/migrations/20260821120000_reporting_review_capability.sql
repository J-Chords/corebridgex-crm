-- Phase 9E — the "Sparing Efficiency" reporting-review capability. Deliberately NOT a fourth role:
-- Corebridge still has exactly Employee/Supervisor/Superadmin (public.profiles.role is unchanged,
-- still constrained to those three values by the existing check constraint). This is one narrow,
-- orthogonal boolean capability that grants Client Report review/finalize privileges regardless of
-- role — an Employee with it gets them, a Supervisor without it does not, even for their own direct
-- report's Draft. Only a Superadmin may grant/revoke it, and doing so never touches `role` itself.
--
-- Replaces Phase 9B's interim finalize rule (`is_superadmin() OR (is_supervisor() AND
-- manages_user(generated_by))`, scoped via can_view_client_report) with a capability-based one:
-- Superadmin always (administrative override), or anyone with the explicit capability, regardless
-- of role. Also extends can_view_client_report so a reviewer can see the org-wide Review Queue, and
-- adds a narrow "wording only" draft-edit RPC so a reviewer correcting a Draft they don't own can
-- never rewrite Task identity/Service/Activity/work date/Actual Duration — only Details text.
--
-- Forward-only; does not edit 20260813130857_profiles.sql, 20260814110006_client_reports.sql, or
-- 20260820090000_client_reports_project_scope.sql.

alter table public.profiles add column reporting_review_access boolean not null default false;

-- has_reporting_review_access — the one place "does this caller get reviewer privileges" is
-- decided: Superadmin always (administrative override, whether or not the flag itself is set), or
-- the caller's own `reporting_review_access` flag. Mirrors permissions.ts's `hasReportingReviewAccess`
-- exactly.
create function public.has_reporting_review_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or coalesce((select reporting_review_access from public.profiles where id = auth.uid()), false);
$$;

revoke execute on function public.has_reporting_review_access() from public, anon;
grant execute on function public.has_reporting_review_access() to authenticated, service_role;

-- set_reporting_review_access — the only sanctioned way to change this capability, mirroring the
-- existing admin_set_role/admin_set_supervisor/admin_set_active pattern exactly (same file,
-- 20260813130857_profiles.sql): Superadmin-only, re-checked internally rather than trusted from the
-- EXECUTE grant alone, and touches nothing but this one column — role/supervisor_id/active are
-- completely untouched, so granting/revoking this capability can never accidentally change who
-- someone's manager is or what role they hold.
create function public.set_reporting_review_access(target_user_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can grant or revoke reporting review access.';
  end if;
  update public.profiles set reporting_review_access = enabled where id = target_user_id;
  if not found then
    raise exception 'Profile % not found.', target_user_id;
  end if;
end;
$$;

revoke execute on function public.set_reporting_review_access(uuid, boolean) from public, anon;
grant execute on function public.set_reporting_review_access(uuid, boolean) to authenticated, service_role;

-- can_view_client_report — additive: a reporting reviewer sees every Client Report org-wide (needed
-- for the Review Queue), on top of the existing owner/managed-generator rule. Everything else about
-- this function (owner always, never a plain employee otherwise, managed-generator visibility) is
-- byte-for-byte unchanged from 20260814110006_client_reports.sql.
create or replace function public.can_view_client_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_reports r
    where r.id = target_report_id
      and (
        r.generated_by = auth.uid()
        or (not public.is_employee() and public.manages_user(r.generated_by))
        or public.has_reporting_review_access()
      )
  );
$$;

-- finalize_client_report — Phase 9E's replacement authorization rule (see this migration's own
-- top-of-file note). Every other precondition (must still be draft; appends a history event) is
-- unchanged from 20260820090000_client_reports_project_scope.sql, which is left untouched.
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
  -- Authorization is checked BEFORE the already-finalized idempotent short-circuit below (mirrors
  -- mock-client-report-provider.ts's own documented "tightened ordering") — an unauthorized caller
  -- must never get this report's content back, even via the "already finalized, just return it"
  -- convenience path.
  if not public.has_reporting_review_access() then
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

-- update_client_report_draft_wording — a reporting reviewer's narrower "wording only" edit lane for
-- a Draft they do NOT own (the existing update_client_report_draft stays owner-only, full-tree, for
-- the generator's own Draft — completely untouched by this migration). p_line_edits is a flat
-- [{id, details}] array; only the `details` field of a matching line item id is ever replaced —
-- date/minutes/source/taskId/taskLabel and the whole department/activity structure are walked
-- through unchanged, so a reviewer can never smuggle a factual-field rewrite through this RPC
-- regardless of what the client sends.
create function public.update_client_report_draft_wording(target_report_id uuid, p_line_edits jsonb)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.client_reports;
  result public.client_reports;
  new_departments jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'draft' then
    raise exception 'This report is finalized and can no longer be edited.';
  end if;
  if not (existing.generated_by = auth.uid() or public.has_reporting_review_access()) then
    raise exception 'You do not have permission to edit this report''s wording.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_set(
      dept,
      '{activities}',
      coalesce((
        select jsonb_agg(
          jsonb_set(
            act,
            '{lineItems}',
            coalesce((
              select jsonb_agg(
                case when edit.details is not null then jsonb_set(item, '{details}', to_jsonb(edit.details)) else item end
                order by item_ord.ord
              )
              from jsonb_array_elements(act->'lineItems') with ordinality as item_ord(item, ord)
              left join jsonb_to_recordset(p_line_edits) as edit(id text, details text)
                on edit.id = item->>'id'
            ), '[]'::jsonb)
          )
          order by act_ord.ord
        )
        from jsonb_array_elements(dept->'activities') with ordinality as act_ord(act, ord)
      ), '[]'::jsonb)
    )
    order by dept_ord.ord
  ), '[]'::jsonb)
  into new_departments
  from jsonb_array_elements(existing.departments) with ordinality as dept_ord(dept, ord);

  update public.client_reports
  set departments = new_departments, updated_at = now()
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

revoke execute on function public.update_client_report_draft_wording(uuid, jsonb) from public, anon;
grant execute on function public.update_client_report_draft_wording(uuid, jsonb) to authenticated, service_role;
