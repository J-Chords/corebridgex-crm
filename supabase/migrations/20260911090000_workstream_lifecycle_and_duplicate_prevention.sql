-- ============================================================================================
-- Project Service Lifecycle & Duplicate Prevention (CD-162 post-manual-QA pass)
-- ============================================================================================
-- NOT YET APPLIED TO THE HOSTED PROJECT AS OF THIS PASS — created locally per explicit instruction
-- ("create the migration locally... do NOT apply new hosted/destructive database changes without
-- explicitly reporting the requirement first"). See the final report's migration section.
--
-- Amended in the CD-162 Final Database Hardening pass (same file, still local-only, so amending in
-- place is safe and avoids unnecessary migration fragmentation — nothing in this file has ever been
-- applied to the hosted project). Three changes now, all scoped to Project Services (Workstreams):
--
--   1. create_workstream() gains a duplicate-*active*-service guard: a Project may not have two
--      *active* Workstreams for the same Service Line at once. A Workstream whose earlier instance
--      was archived (status 'cancelled') does not count as "still active," so its Service Line is
--      free to be re-added — this mirrors the app/mock-provider check already added in this same
--      pass (mock-workstreams-provider.ts) and the UI's own exclusion list
--      (`AddProjectServiceDialog`'s `existingServiceLineIds`, now computed from active Workstreams
--      only) — so all three layers (UI, app/mock, hosted RPC) agree. Every other authorization/
--      validation branch in this function is byte-for-byte unchanged from the currently-applied
--      20260910090000 migration.
--
--   2. NEW — workstreams_project_service_line_active_unique_idx: a partial unique index on
--      (project_id, service_line_id) WHERE status <> 'cancelled'. This is the real, unconditional
--      database-level enforcement of the same invariant — the RPC-level check in create_workstream
--      only protects callers that go through the RPC; the hosted `workstreams_insert` RLS policy
--      (`is_supervisor() OR is_superadmin() OR (is_employee() AND can_access_project(...) AND
--      lead_user_id = auth.uid())`) still technically permits a raw direct-table insert that
--      bypasses create_workstream's business logic entirely, and there is no equivalent app-level
--      guard standing between a raw UPDATE (e.g. a Reactivate) and the same invalid state. A unique
--      index closes both gaps at once, for every write path (RPC, raw insert, raw update),
--      permanently, with no reliance on triggers or application code. Stable identity only — keyed
--      on service_line_id (uuid FK), never a display name. Archived (cancelled) Workstreams are
--      excluded from the index's scope entirely, so re-adding/reactivating a Service Line whose
--      prior instance was archived is never blocked by this constraint — only a genuine second
--      *active* instance is.
--
--      *** EXISTING-DATA COMPATIBILITY — READ BEFORE APPLYING ***
--      A read-only audit (2026-09-11, immediately before writing this index) found this query
--        select project_id, service_line_id, count(*) from public.workstreams
--        where project_id is not null and service_line_id is not null and status <> 'cancelled'
--        group by project_id, service_line_id having count(*) > 1;
--      returns exactly ONE conflicting pair, already known from an earlier pass's report:
--        project_id = dccf2984-b2f8-4af3-8f33-d6acc6dc886a (Alderleaf Manufacturing)
--        service_line_id = b8f5bd04-e05c-44c6-b7cf-e24d87352cd4 (Accounting)
--        workstream 9236726c-159f-4c4e-a4bc-d48a45232c6a "Accounting" (status active)
--        workstream 2f299509-59e9-4496-8294-400ff626eb27 "Accounting — Monthly Accounting" (status active)
--      Both rows carry genuine accumulated history (4 and 5 Tasks respectively, at last audit) — NOT
--      safely mergeable/deletable by an automated script (see the CD-162 Final Gap Closure report's
--      own investigation). CREATE UNIQUE INDEX below WILL FAIL AS WRITTEN if run against the
--      hosted database in its current state — this migration cannot be applied until a human
--      (Product Owner / Admin) archives one of these two specific Workstreams first, via the
--      existing Archive UI. This is a genuine pre-existing data conflict, not a defect in the index
--      definition — do not resolve it by editing this migration to special-case these two ids.
--
--   3. delete_empty_workstream — hard-delete safety re-audited: "zero Tasks" alone is NOT "zero
--      history." Every table with a workstream_id column (and the one self-referencing column) was
--      re-enumerated fresh via information_schema (not assumed from memory):
--        - tasks (ON DELETE CASCADE) — operational history, Category A, already blocked.
--        - project_issues (ON DELETE SET NULL) — a reported Issue naming this Service is a real
--          historical/operational record even though the Issue row itself would only lose its
--          Workstream reference rather than being destroyed outright; silently severing that link
--          is still data loss. Category A — NOW ALSO BLOCKED.
--        - workstreams.previous_occurrence_workstream_id (ON DELETE SET NULL, self-referencing) — if
--          some OTHER (later) Workstream records THIS one as the occurrence it continues from,
--          deleting this one would silently erase that recurrence lineage. Category A — NOW ALSO
--          BLOCKED. (This Workstream's own previous_occurrence_workstream_id, pointing at an EARLIER
--          Workstream, is irrelevant to deleting this one and needs no check.)
--        - workstream_activities (ON DELETE CASCADE) — which catalog Activities are enabled; current
--          configuration, not a record of work performed. Category B — safe to cascade, unchanged.
--        - workstream_members (ON DELETE CASCADE) — current team roster; current configuration, not
--          history. Category B — safe to cascade, unchanged.
--      No other table in the schema has a workstream_id column at all (confirmed via
--      information_schema.columns) — Comments, Reports, Documents, and Time Entries are Project- or
--      Task-scoped, never directly dependent on Workstream, so none of them are affected by this
--      function either way (Category C).
-- ============================================================================================

-- 1. create_workstream — duplicate-active-service guard added; every other line unchanged from the
--    currently-applied 20260910090000_employee_service_activity_authorization_parity.sql.
create or replace function public.create_workstream(
  p_name text,
  p_description text,
  p_company_id uuid,
  p_project_id uuid,
  p_service_line_id uuid,
  p_lead_user_id uuid,
  p_team_user_ids uuid[],
  p_activity_ids uuid[],
  p_status text,
  p_start_date date,
  p_end_date date,
  p_recurrence_frequency text,
  p_recurrence_anchor_date date,
  p_recurrence_custom_interval_days integer,
  p_previous_occurrence_workstream_id uuid
)
returns public.workstreams
language plpgsql
security definer
set search_path to ''
as $function$
declare
  company_brand_id uuid;
  effective_company_id uuid;
  effective_lead_id uuid;
  effective_team_ids uuid[];
  new_ws public.workstreams;
  project_company_id uuid;
  project_status text;
begin
  if public.is_superadmin() then
    if not exists (select 1 from public.profiles where id = p_lead_user_id and active) then
      raise exception 'Lead user not found or inactive.';
    end if;
    if exists (
      select 1 from unnest(coalesce(p_team_user_ids, '{}')) as u
      where not exists (select 1 from public.profiles where id = u and active)
    ) then
      raise exception 'One of the selected team members was not found or is inactive.';
    end if;
    effective_lead_id := p_lead_user_id;
    effective_team_ids := coalesce(p_team_user_ids, '{}');

  elsif public.is_supervisor() then
    if p_project_id is null then
      raise exception 'A project is required to create a service.';
    end if;
    if not public.can_access_project(p_project_id) then
      raise exception 'You don''t have access to that project.';
    end if;
    if not (
      p_lead_user_id = auth.uid()
      or exists (select 1 from public.profiles where id = p_lead_user_id and active and supervisor_id = auth.uid())
    ) then
      raise exception 'You can only lead this yourself or assign one of your own direct reports.';
    end if;
    if exists (
      select 1 from unnest(coalesce(p_team_user_ids, '{}')) as u
      where not exists (
        select 1 from public.profiles where id = u and active and (id = auth.uid() or supervisor_id = auth.uid())
      )
    ) then
      raise exception 'One of the selected team members is outside your team.';
    end if;
    effective_lead_id := p_lead_user_id;
    effective_team_ids := coalesce(p_team_user_ids, '{}');

  else
    -- Boss-approved final rule (MVP Gap Closure) — an Employee can never create a Service
    -- (Workstream), regardless of who they'd lead it as; only Supervisor/Superadmin may.
    raise exception 'Not authorized to create a service.';
  end if;

  if p_project_id is not null then
    select company_id into project_company_id from public.projects where id = p_project_id;
    if project_company_id is null then
      raise exception 'Project % not found.', p_project_id;
    end if;
    effective_company_id := project_company_id;
  else
    effective_company_id := p_company_id;
  end if;

  -- Boss-Aligned Project Status Restoration — a Project must be Active to receive a new Service;
  -- every other normal state blocks it with its own accurate explanation, same as Trash.
  if p_project_id is not null then
    select status into project_status from public.projects where id = p_project_id;
    if project_status is distinct from 'active' then
      raise exception '%', case project_status
        when 'archived' then 'This client is archived. Reactivate the client to add new work.'
        when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
        when 'completed' then 'This project is completed. Return it to Active to add new work.'
        when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
        when 'trash' then 'This project is in Trash — restore it first.'
        else 'This project must be Active to add new work.'
      end;
    end if;
  end if;

  -- CD-162 post-manual-QA pass — duplicate-*active*-service guard: this Project must not already
  -- have an active Workstream for this same Service Line. An archived (cancelled) prior instance
  -- doesn't block a fresh one — this is a duplicate-active rule, not a duplicate-ever rule. This is
  -- an early, friendly-message check for the sanctioned RPC path; the real, unconditional boundary
  -- is workstreams_project_service_line_active_unique_idx below, which also protects a raw insert
  -- bypassing this RPC entirely.
  if p_project_id is not null and p_service_line_id is not null then
    if exists (
      select 1 from public.workstreams w
      where w.project_id = p_project_id
        and w.service_line_id = p_service_line_id
        and w.status <> 'cancelled'
    ) then
      raise exception 'This Service is already active on this Project.';
    end if;
  end if;

  if not exists (select 1 from public.companies where id = effective_company_id) then
    raise exception 'Company not found.';
  end if;
  select brand_id into company_brand_id from public.companies where id = effective_company_id;
  if company_brand_id is null then
    raise exception 'This client has no Brand set yet — add a Brand to this client before creating a Service.';
  end if;

  insert into public.workstreams (
    name, description, company_id, project_id, service_line_id, brand_id, lead_user_id, status,
    start_date, end_date, recurrence_frequency, recurrence_anchor_date, recurrence_custom_interval_days,
    previous_occurrence_workstream_id, created_by
  ) values (
    p_name, p_description, effective_company_id, p_project_id, p_service_line_id, company_brand_id, effective_lead_id, p_status,
    p_start_date, p_end_date, p_recurrence_frequency, p_recurrence_anchor_date, p_recurrence_custom_interval_days,
    p_previous_occurrence_workstream_id, auth.uid()
  )
  returning * into new_ws;

  if coalesce(array_length(effective_team_ids, 1), 0) > 0 then
    insert into public.workstream_members (workstream_id, user_id)
    select new_ws.id, u from unnest(effective_team_ids) as u;
  end if;

  if coalesce(array_length(p_activity_ids, 1), 0) > 0 then
    insert into public.workstream_activities (workstream_id, activity_id)
    select new_ws.id, a from unnest(p_activity_ids) as a;
  end if;

  return new_ws;
end;
$function$;

-- 2. NEW — the real, unconditional database-level enforcement: no two non-archived Workstreams may
--    share the same (Project, Service Line). Protects every write path (RPC insert, raw insert, raw
--    update/Reactivate) — see the header comment above for the existing-data conflict this migration
--    cannot yet be applied over.
create unique index workstreams_project_service_line_active_unique_idx
  on public.workstreams (project_id, service_line_id)
  where project_id is not null and service_line_id is not null and status <> 'cancelled';

-- 3. delete_empty_workstream — Task-count check unchanged; two new dependency checks added
--    (project_issues, successor-workstream recurrence lineage) per the hard-delete safety re-audit
--    in the header comment above. workstream_activities/workstream_members remain unchecked
--    (Category B — configuration-only, safe to cascade).
create or replace function public.delete_empty_workstream(p_workstream_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_count int;
  v_issue_count int;
  v_successor_count int;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can remove a Service.';
  end if;

  if not exists (select 1 from public.workstreams where id = p_workstream_id) then
    raise exception 'Service not found.';
  end if;

  -- Re-verified here, never trusted from the caller — tasks.workstream_id is ON DELETE CASCADE, so
  -- this is the only thing standing between "remove an empty Service" and silently destroying real
  -- Task/Time history.
  select count(*) into v_task_count from public.tasks where workstream_id = p_workstream_id;
  if v_task_count > 0 then
    raise exception 'This Service has % task(s) and can''t be removed — archive it instead.', v_task_count;
  end if;

  -- A reported Issue naming this Service is a real historical record — project_issues.workstream_id
  -- is ON DELETE SET NULL, so without this check the Issue would silently lose which Service it was
  -- ever about, even though the Issue row itself would survive.
  select count(*) into v_issue_count from public.project_issues where workstream_id = p_workstream_id;
  if v_issue_count > 0 then
    raise exception 'This Service has % historical issue(s) on record and can''t be removed — archive it instead.', v_issue_count;
  end if;

  -- If a later Workstream records this one as the occurrence it continues from, deleting this one
  -- would silently erase that recurrence lineage (previous_occurrence_workstream_id is ON DELETE SET
  -- NULL) — this Workstream's OWN previous_occurrence_workstream_id, pointing at an earlier one, is
  -- irrelevant here and is not checked.
  select count(*) into v_successor_count from public.workstreams where previous_occurrence_workstream_id = p_workstream_id;
  if v_successor_count > 0 then
    raise exception 'Another Service''s recurrence history continues from this one and can''t be removed — archive it instead.';
  end if;

  delete from public.workstreams where id = p_workstream_id;
end;
$$;

revoke all on function public.delete_empty_workstream(uuid) from public, anon;
grant execute on function public.delete_empty_workstream(uuid) to authenticated, service_role;
