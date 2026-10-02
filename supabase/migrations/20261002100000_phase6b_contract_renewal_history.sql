-- Phase 6B (CD-216) — contract renewal + contract-history correction mutation RPCs.
--
-- Locked Product Owner decisions (see docs/decisions.md's Phase 6 entry for full scope):
--   A/B/C/D/E. Unchanged from Phase 6A — Project remains the durable workspace, operational
--      contracts belong to Project (not Company), Company Contract Start / Project Client Since are
--      distinct facts that never advance on renewal, and `project_contract_periods` stays the one
--      authoritative source — this migration adds no new table and no new authoritative field.
--   F/G. Every recorded period still ends December 31 of its own start year; a renewal successor's
--      `period_start` is always the January 1 immediately after its predecessor's `period_end` —
--      enforced by the Phase-6A `project_contract_periods_enforce_chain` trigger, unchanged here.
--      Rows remain actual recorded business periods, never fabricated.
--   H. Renewal is manual only — no automatic renewal, no pg_cron schedule, no hidden background
--      behavior. This migration adds nothing that runs without a direct RPC call.
--   I. Renewal has zero operational side effects — these RPCs touch `project_contract_periods`
--      only, never Projects/Templates/Services/Activities/Tasks/checklists/staffing/Partner Brand/
--      Tags/Project Group/lifecycle state.
--   J. Contract-history read is unchanged (ordinary `can_access_project`, via the Phase-6A RLS
--      SELECT policy). Mutation stays Admin/superadmin-only — Team Lead and Employee get nothing new
--      here either.
--   K. Renewal is eligible only while a Project's lifecycle is Active or On Hold; Completed/
--      Canceled/Archived/Trash are rejected outright. Reactivation never auto-creates a period.
--   L. The Phase-6A `create_initial_project_contract_period` RPC (unchanged, not touched by this
--      migration) remains the one path for a Project's FIRST period — recording history, not a
--      renewal, so it carries no lifecycle gate of its own.
--   M. "Current Contract" is still derived (`period_start <= today <= period_end`), never stored —
--      this migration adds no `is_current`/`status`/`renewal_status`/`next_renewal_date` column.
--
-- Section 2 — narrow correction semantics, locked for 6B: an Admin may remove ONLY the current leaf
-- period in a Project's chain (a non-leaf period can never be removed directly), and may correct the
-- ROOT period's `period_start` ONLY while it is still the Project's sole recorded period (no
-- successor). Neither is a lifecycle transition — lifecycle status never blocks correction. A
-- renewal successor's own dates are never independently editable (remove the mistaken leaf, then
-- renew again).

-- ============================================================================
-- 1. renew_project_contract_period — the one renewal mutation boundary
-- ============================================================================
-- Admin/superadmin-only. Renews a Project's contract by recording the successor of its current leaf
-- period (the one period nothing else has renewed from). Server-derives both dates — the caller
-- supplies only `p_project_id`, never a date. Locks the Project row for the duration of the function
-- so two concurrent renewal attempts on the SAME Project serialize rather than race (the second call
-- blocks until the first commits or rolls back, then re-reads the now-current leaf itself) — the
-- Phase-6A unique indexes/trigger remain defense-in-depth regardless. Does NOT require the current
-- leaf to have already expired — an Admin may record next year's renewal in advance; the prior
-- period stays "Current" (derived, never stored) until its own `period_end`.

create function public.renew_project_contract_period(
  p_project_id uuid
)
returns public.project_contract_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_status text;
  v_leaf public.project_contract_periods;
  v_new_start date;
  v_new_end date;
  v_new_period public.project_contract_periods;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can renew a contract period.';
  end if;

  select id, status into v_project_id, v_status from public.projects where id = p_project_id for update;
  if v_project_id is null then
    raise exception 'Project not found.';
  end if;
  if v_status not in ('active', 'on-hold') then
    raise exception 'This project must be Active or On Hold to renew its contract.';
  end if;

  select * into v_leaf
  from public.project_contract_periods
  where project_id = p_project_id
  order by period_start desc
  limit 1;

  if v_leaf.id is null then
    raise exception 'This project has no recorded contract period to renew from.';
  end if;
  if exists (select 1 from public.project_contract_periods where renewed_from_period_id = v_leaf.id) then
    raise exception 'This contract period has already been renewed.';
  end if;

  v_new_start := v_leaf.period_end + 1;
  v_new_end := make_date(extract(year from v_new_start)::integer, 12, 31);

  insert into public.project_contract_periods (project_id, period_start, period_end, created_by, renewed_from_period_id)
  values (p_project_id, v_new_start, v_new_end, auth.uid(), v_leaf.id)
  returning * into v_new_period;

  return v_new_period;
end;
$$;

comment on function public.renew_project_contract_period(uuid) is
  'Phase 6B (CD-216) — renews a Project''s contract by recording the successor of its current leaf '
  'period. Admin-only. Both dates are always server-derived (leaf.period_end + 1 day -> December 31 '
  'of that year), never accepted from the caller. Requires an existing recorded chain and a '
  'renewal-eligible lifecycle (Active or On Hold). Zero effect on any other Project data.';

revoke all on function public.renew_project_contract_period(uuid) from public, anon;
grant execute on function public.renew_project_contract_period(uuid) to authenticated, service_role;

-- ============================================================================
-- 2. delete_latest_project_contract_period — narrow mistake-correction (removal)
-- ============================================================================
-- Admin/superadmin-only. Removes ONLY the current leaf period of a Project's chain — a period that
-- already has a successor can never be removed directly (its successor must be removed first, one
-- leaf at a time), which keeps the chain always intact, never disconnected. Removing the sole root
-- period of a Project (no successor, no predecessor) is allowed. Lifecycle status is deliberately
-- NOT checked here — correcting mistaken history is independent of whether the Project is currently
-- renewal-eligible (locked model section 2.5/26). No other row is touched; the existing `on delete
-- cascade`/FK shape needs no manual cascade.

create function public.delete_latest_project_contract_period(
  p_project_id uuid,
  p_period_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_period public.project_contract_periods;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can remove a contract period.';
  end if;

  select id into v_project_id from public.projects where id = p_project_id for update;
  if v_project_id is null then
    raise exception 'Project not found.';
  end if;

  select * into v_period from public.project_contract_periods where id = p_period_id;
  if v_period.id is null then
    raise exception 'Contract period not found.';
  end if;
  if v_period.project_id is distinct from p_project_id then
    raise exception 'That contract period does not belong to this project.';
  end if;
  if exists (select 1 from public.project_contract_periods where renewed_from_period_id = v_period.id) then
    raise exception 'Only the latest recorded period can be removed — this period has already been renewed.';
  end if;

  delete from public.project_contract_periods where id = p_period_id;
end;
$$;

comment on function public.delete_latest_project_contract_period(uuid, uuid) is
  'Phase 6B (CD-216) — Admin-only narrow mistake-correction: removes ONLY the current leaf period '
  'in a Project''s chain. Rejects outright if the named period has a successor. Lifecycle status '
  'never blocks this. No cascade, no other row touched.';

revoke all on function public.delete_latest_project_contract_period(uuid, uuid) from public, anon;
grant execute on function public.delete_latest_project_contract_period(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 3. correct_initial_project_contract_period_start — narrow mistake-correction (root start date)
-- ============================================================================
-- Admin/superadmin-only. Corrects the ROOT period's `period_start` ONLY while it is still the
-- Project's sole recorded period (no successor exists yet) — an established renewal chain is never
-- rewritten. `period_end` is always recomputed server-side as December 31 of the corrected year;
-- `created_at`/`created_by` are never touched. Never changes `projects.contract_start_date`
-- ("Client Since") — a separate fact (locked model section D).

create function public.correct_initial_project_contract_period_start(
  p_project_id uuid,
  p_period_start date
)
returns public.project_contract_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_count integer;
  v_period public.project_contract_periods;
  v_new_end date;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can correct a contract period.';
  end if;

  select id into v_project_id from public.projects where id = p_project_id for update;
  if v_project_id is null then
    raise exception 'Project not found.';
  end if;

  select count(*) into v_count from public.project_contract_periods where project_id = p_project_id;
  if v_count = 0 then
    raise exception 'This project has no recorded contract period to correct.';
  end if;
  if v_count > 1 then
    raise exception 'This project already has a renewal history — the initial period can no longer be corrected.';
  end if;

  select * into v_period from public.project_contract_periods where project_id = p_project_id;
  if v_period.renewed_from_period_id is not null then
    raise exception 'Only the root (first-recorded) period can be corrected.';
  end if;
  if exists (select 1 from public.project_contract_periods where renewed_from_period_id = v_period.id) then
    raise exception 'This period already has a successor — it can no longer be corrected.';
  end if;
  if p_period_start is null then
    raise exception 'A period start date is required.';
  end if;

  v_new_end := make_date(extract(year from p_period_start)::integer, 12, 31);

  update public.project_contract_periods
  set period_start = p_period_start, period_end = v_new_end
  where id = v_period.id
  returning * into v_period;

  return v_period;
end;
$$;

comment on function public.correct_initial_project_contract_period_start(uuid, date) is
  'Phase 6B (CD-216) — Admin-only narrow mistake-correction: corrects the root period''s '
  'period_start ONLY while it is the Project''s sole recorded period. period_end is always '
  'recomputed server-side; created_at/created_by are never touched. Rejects once any renewal '
  'history exists.';

revoke all on function public.correct_initial_project_contract_period_start(uuid, date) from public, anon;
grant execute on function public.correct_initial_project_contract_period_start(uuid, date) to authenticated, service_role;
