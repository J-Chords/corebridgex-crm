-- Phase 8E — Superadmin-only Project creation and annual renewal.
--
-- `projects_insert`/`projects_update`/`project_members_write` are ALREADY Superadmin-only at the
-- RLS layer (unchanged since Phase 8A) — this migration does not touch that policy shape at all.
-- Two new SECURITY DEFINER RPCs are added anyway, for the same reason `create_workstream`/
-- `create_task` exist: creating a Project plus its initial members (and, for renewal, plus N
-- carried-forward Services and their own members/Activities) is a genuinely multi-table write that
-- must not partially succeed if a later step fails. Each function independently re-verifies
-- `is_superadmin()` itself — SECURITY DEFINER bypasses table RLS entirely for its own writes, so
-- the function body IS the authorization boundary here, not a redundant restatement of it.
--
-- Ordinary Project *editing* (`update_project`, no new Services/renewal involved) is deliberately
-- NOT an RPC — a plain `.update()` + `project_members` resync is already atomic enough for that
-- narrower case (worst case on a partial failure is stale members, trivially recoverable by
-- re-editing), matching the existing `updateWorkstream` provider pattern exactly. Do not
-- over-engineer what's already safe.

create function public.create_project(
  p_company_id uuid,
  p_name text,
  p_owner_id uuid,
  p_status text,
  p_contract_start_date date,
  p_contract_months int,
  p_contract_end_date date,
  p_description text,
  p_member_user_ids uuid[]
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_project public.projects;
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin may create a project.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found.';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner_id and active) then
    raise exception 'Owner not found or inactive.';
  end if;

  insert into public.projects (
    company_id, name, owner_id, status, contract_start_date, contract_months, contract_end_date, description, created_by
  ) values (
    p_company_id, p_name, p_owner_id, p_status, p_contract_start_date, coalesce(p_contract_months, 12), p_contract_end_date, p_description, auth.uid()
  )
  returning * into new_project;

  if coalesce(array_length(p_member_user_ids, 1), 0) > 0 then
    insert into public.project_members (project_id, user_id)
    select new_project.id, u from unnest(p_member_user_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
  end if;

  return new_project;
end;
$$;

revoke execute on function public.create_project(uuid, text, uuid, text, date, int, date, text, uuid[]) from public, anon;
grant execute on function public.create_project(uuid, text, uuid, text, date, int, date, text, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- renew_project — creates the NEXT annual Project for the SAME Company. The source Project is
-- never mutated; nothing historical (Tasks, checklist completion, time entries, Notes, Handoffs,
-- status-change history, Reports, notifications, correction history) is ever copied — the source
-- Project remains the sole historical record, exactly as `docs/product-brief.md`'s Company →
-- Project → Service hierarchy already intends.
--
-- Only the source Project's Services explicitly listed in `p_workstream_ids_to_carry` are carried
-- forward, each as a genuinely NEW workstreams row (never re-parenting the old one):
--   - copied: name, description, service_line_id, brand_id, its own selected workstream_activities
--   - lead: the source Service's own lead if still active, else the new Project's owner (never an
--     inactive/removed user silently left as lead)
--   - team members: only the ones still active
--   - dates: start_date is set to the NEW Project's own contract_start_date (never the prior year's
--     stale start), end_date is left null (a prior year's end date is specifically the kind of
--     stale value Section 29 asks not to silently carry forward) — Superadmin can set a real one
--     afterward via normal Service editing
--   - recurrence_frequency/custom_interval_days carry forward (genuine ongoing service
--     configuration), but recurrence_anchor_date is reset to the new contract_start_date rather
--     than kept as a specific historical date — same "fresh over stale" reasoning as start/end date
--   - previous_occurrence_workstream_id is deliberately left null: that field is reserved for the
--     existing intra-Project "Generate Next Occurrence" recurrence-chain feature, a different
--     concept from cross-Project annual renewal, and conflating the two would misrepresent the
--     recurrence UI's own chain display
--   - status always starts 'active' regardless of the source Service's own status — carrying a
--     'completed'/'cancelled' status into a brand-new annual period the Service is by definition
--     being continued into would be incoherent
--
-- Every `p_workstream_ids_to_carry` id is filtered to `project_id = p_source_project_id` — an id
-- that doesn't genuinely belong to the source Project is silently excluded, never processed, which
-- closes any "carry forward a Service from an unrelated Project" risk.
create function public.renew_project(
  p_source_project_id uuid,
  p_name text,
  p_contract_start_date date,
  p_contract_months int,
  p_contract_end_date date,
  p_owner_id uuid,
  p_member_user_ids uuid[],
  p_workstream_ids_to_carry uuid[]
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_project public.projects;
  new_project public.projects;
  ws record;
  new_ws_id uuid;
  effective_lead uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin may renew a project.';
  end if;

  select * into source_project from public.projects where id = p_source_project_id;
  if not found then
    raise exception 'Source project not found.';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner_id and active) then
    raise exception 'Owner not found or inactive.';
  end if;

  insert into public.projects (
    company_id, name, owner_id, status, contract_start_date, contract_months, contract_end_date, description, created_by
  ) values (
    source_project.company_id, p_name, p_owner_id, 'active', p_contract_start_date, coalesce(p_contract_months, 12),
    p_contract_end_date, source_project.description, auth.uid()
  )
  returning * into new_project;

  if coalesce(array_length(p_member_user_ids, 1), 0) > 0 then
    insert into public.project_members (project_id, user_id)
    select new_project.id, u from unnest(p_member_user_ids) as u
    where exists (select 1 from public.profiles where id = u and active);
  end if;

  for ws in
    select * from public.workstreams
    where id = any(p_workstream_ids_to_carry) and project_id = p_source_project_id
  loop
    effective_lead := ws.lead_user_id;
    if effective_lead is null or not exists (select 1 from public.profiles where id = effective_lead and active) then
      effective_lead := p_owner_id;
    end if;

    insert into public.workstreams (
      name, description, company_id, project_id, service_line_id, brand_id, lead_user_id, status,
      start_date, end_date, recurrence_frequency, recurrence_anchor_date, recurrence_custom_interval_days,
      previous_occurrence_workstream_id, created_by
    ) values (
      ws.name, ws.description, source_project.company_id, new_project.id, ws.service_line_id, ws.brand_id,
      effective_lead, 'active',
      p_contract_start_date, null,
      ws.recurrence_frequency,
      case when ws.recurrence_frequency is not null then p_contract_start_date else null end,
      ws.recurrence_custom_interval_days,
      null, auth.uid()
    )
    returning id into new_ws_id;

    insert into public.workstream_members (workstream_id, user_id)
    select new_ws_id, wm.user_id from public.workstream_members wm
    where wm.workstream_id = ws.id
      and exists (select 1 from public.profiles where id = wm.user_id and active);

    insert into public.workstream_activities (workstream_id, activity_id)
    select new_ws_id, wa.activity_id from public.workstream_activities wa
    where wa.workstream_id = ws.id;
  end loop;

  return new_project;
end;
$$;

revoke execute on function public.renew_project(uuid, text, date, int, date, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.renew_project(uuid, text, date, int, date, uuid, uuid[], uuid[]) to authenticated, service_role;
