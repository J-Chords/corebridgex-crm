-- Phase 6A (CD-215) — Project contract-period data foundation.
--
-- Locked Product Owner decisions (see docs/decisions.md's Phase 6 entry for full scope):
--   A. Operational/current contracts belong to PROJECT, not Company. No Company-level annual-
--      period table is created here.
--   B/C. `companies.contract_start_date` (original client relationship start) and
--      `projects.contract_start_date` ("Client Since" — the original Project/engagement start)
--      are DISTINCT facts on DISTINCT tables, despite the identical column name — neither advances
--      on renewal. Post-creation correction of either is Admin-only (see sections below).
--   D. `companies.renewal_date` is preserved for compatibility — NOT dropped, NOT read as the
--      Project's current contract.
--   E. `projects.contract_months`/`projects.contract_end_date` are preserved, untouched — no
--      longer the authoritative annual-contract model. `project_contract_periods` is authoritative
--      going forward.
--   F. Every recorded period ends December 31 of its own start year; a renewal period always
--      starts the January 1 immediately after its predecessor's period_end.
--   G/H. Contract-period rows represent ACTUAL RECORDED periods, never mathematically-generated
--      guesses. This migration inserts ZERO rows — the audited hosted baseline (4 Projects, 0 with
--      contract_end_date, 0 Companies with renewal_date) has no provable historical period to
--      backfill, and none is fabricated.
--   I/J. Renewal (recording a successor period) is Phase 6B/CD-216 — not implemented here. The
--      locked "never duplicate a Project to represent another contract year" invariant
--      (`20260908140000_project_lifecycle_authoritative_hardening.sql`'s own `renew_project`
--      removal) is unchanged and not revisited.
--   K. Contract-period storage has zero automatic effect on Templates/Services/Activities/Tasks/
--      checklists/staffing/Partner Brand/Tags/Project Group/lifecycle status — metadata only.
--   L. No `UNIQUE(projects.company_id)` is added — the architecture stays capable of one Company
--      with many genuinely distinct Projects; annual renewal must simply never be the reason
--      another Project is created.
--   M. Contract-period writes are Admin/superadmin-only. Post-creation correction of
--      `companies.contract_start_date`/`renewal_date` and `projects.contract_start_date`/
--      `contract_months`/`contract_end_date` is likewise Admin-only (sections 3-4 below).

-- ============================================================================
-- 1. project_contract_periods
-- ============================================================================

create table public.project_contract_periods (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  renewed_from_period_id uuid null references public.project_contract_periods(id),
  constraint project_contract_periods_start_before_end check (period_start <= period_end),
  -- Section F — every period ends December 31 of its own start year.
  constraint project_contract_periods_end_is_dec31 check (
    period_end = make_date(extract(year from period_start)::integer, 12, 31)
  )
);

comment on table public.project_contract_periods is
  'Phase 6A (CD-215) — actual recorded annual contract periods for a Project. Never mathematically '
  'backfilled; a legacy Project''s first truthfully-recorded period may start long after its own '
  '"Client Since" date. "Current" is always derived (period_start <= today <= period_end), never '
  'stored. See src/lib/data/contract-periods.ts.';

-- Row-local invariants (start<=end, end=Dec-31) are the two CHECK constraints above. Cross-row
-- invariants (chain continuity, no self-reference, same-project predecessor) need a trigger —
-- Postgres CHECK constraints cannot reference other rows.
create or replace function public.enforce_project_contract_period_chain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_predecessor public.project_contract_periods;
begin
  if new.renewed_from_period_id is not null then
    if new.renewed_from_period_id = new.id then
      raise exception 'A contract period cannot renew from itself.';
    end if;
    select * into v_predecessor from public.project_contract_periods where id = new.renewed_from_period_id;
    if not found then
      raise exception 'Predecessor contract period not found.';
    end if;
    if v_predecessor.project_id is distinct from new.project_id then
      raise exception 'A contract period can only renew from a period belonging to the same project.';
    end if;
    if new.period_start is distinct from (v_predecessor.period_end + 1) then
      raise exception 'A renewal period must begin exactly one day after its predecessor''s period end (January 1).';
    end if;
  end if;
  return new;
end;
$$;

create trigger project_contract_periods_enforce_chain
  before insert or update on public.project_contract_periods
  for each row execute function public.enforce_project_contract_period_chain();

revoke execute on function public.enforce_project_contract_period_chain() from public, anon, authenticated, service_role;

-- "Periods belonging to the same Project must never overlap": since every period is forced to span
-- exactly one calendar year ending Dec 31 (the CHECK constraint above), two periods for the same
-- Project can only ever overlap if they target the SAME calendar year — a plain unique index on
-- (project_id, year-of-period_start) rules that out entirely, with no EXCLUDE constraint (and no
-- new extension) required.
create unique index project_contract_periods_project_year_uidx
  on public.project_contract_periods (project_id, (extract(year from period_start)));

-- "One predecessor must not branch into multiple successors."
create unique index project_contract_periods_renewed_from_uidx
  on public.project_contract_periods (renewed_from_period_id)
  where renewed_from_period_id is not null;

-- "A Project must not develop multiple disconnected root chains" — at most one root (no
-- predecessor) period per Project.
create unique index project_contract_periods_one_root_per_project_uidx
  on public.project_contract_periods (project_id)
  where renewed_from_period_id is null;

-- Access-path indexes only — Phase 6 currently has a handful of records; no speculative reporting
-- indexes added.
create index project_contract_periods_project_id_idx on public.project_contract_periods (project_id);
create index project_contract_periods_project_id_period_start_idx
  on public.project_contract_periods (project_id, period_start);

alter table public.project_contract_periods enable row level security;

-- Read mirrors ordinary Project access — never widened. No INSERT/UPDATE/DELETE policy exists for
-- `authenticated` at all (not merely a restrictive `using (false)` — the privilege itself is never
-- granted below), so a direct-table write is impossible regardless of RLS; all mutation goes
-- through the narrow SECURITY DEFINER RPC in section 2.
create policy "project_contract_periods_select" on public.project_contract_periods
  for select using (public.can_access_project(project_id));

grant select on public.project_contract_periods to authenticated;
grant select, insert, update, delete on public.project_contract_periods to service_role;

-- ============================================================================
-- 2. create_initial_project_contract_period — the one Phase-6A mutation boundary
-- ============================================================================
-- Admin/superadmin-only. Records the FIRST period known to this subsystem for a Project that
-- doesn't already have one — never a proof that this was the client's historically-first-ever
-- contract (a legacy Project's Client Since may be years earlier; that gap is intentional, never
-- fabricated — see the table comment above). period_end is always computed server-side; the caller
-- cannot supply it. Zero effect on any operational structure (Services/Activities/Tasks/checklists/
-- staffing/Partner Brand/Tags/Project Group/lifecycle status) — metadata only, no Project
-- duplication. Successor/renewal RPCs are explicitly Phase 6B/CD-216, not implemented here.

create function public.create_initial_project_contract_period(
  p_project_id uuid,
  p_period_start date
)
returns public.project_contract_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.project_contract_periods;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can record a contract period.';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found.';
  end if;
  if p_period_start is null then
    raise exception 'A period start date is required.';
  end if;
  if exists (select 1 from public.project_contract_periods where project_id = p_project_id) then
    raise exception 'This project already has a recorded contract period.';
  end if;

  insert into public.project_contract_periods (project_id, period_start, period_end, created_by, renewed_from_period_id)
  values (
    p_project_id,
    p_period_start,
    make_date(extract(year from p_period_start)::integer, 12, 31),
    auth.uid(),
    null
  )
  returning * into v_period;

  return v_period;
end;
$$;

comment on function public.create_initial_project_contract_period(uuid, date) is
  'Phase 6A (CD-215) — records the first period known to the contract-history subsystem for a '
  'Project with no existing chain. Admin-only. period_end is always computed server-side (December '
  '31 of p_period_start''s year), never accepted from the caller. Does NOT assert this was the '
  'client''s historically-first-ever contract. Renewal (a successor period) is Phase 6B/CD-216.';

revoke all on function public.create_initial_project_contract_period(uuid, date) from public, anon;
grant execute on function public.create_initial_project_contract_period(uuid, date) to authenticated, service_role;

-- ============================================================================
-- 3. update_project_record — Admin-only protection for Project contract fields
-- ============================================================================
-- Based on the CURRENT/LATEST hosted definition (20260930170000_phase4_project_staffing_
-- foundation.sql) — byte-for-byte identical except the new non-admin rejection guard inserted
-- before the UPDATE, and the existing "select owner_id" probe widened to a full-row select so the
-- guard has something to compare against. A non-admin caller attempting to change
-- contract_start_date/contract_months/contract_end_date is rejected outright (never silently kept
-- at the old value while the rest of the edit quietly succeeds) — ordinary Team Lead edits to every
-- OTHER field continue to work exactly as before, since re-sending the unchanged contract values
-- (what the UI now always does for a non-admin) passes the guard trivially.

create or replace function public.update_project_record(
  p_project_id uuid,
  p_name text,
  p_owner_id uuid,
  p_contract_start_date date,
  p_contract_months integer,
  p_contract_end_date date,
  p_description text,
  p_project_group_id uuid,
  p_tags text[],
  p_partner_brand_id uuid
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_row public.projects;
  v_new_owner_id uuid;
  v_existing public.projects;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to edit this project.';
  end if;

  v_is_admin := public.is_superadmin();

  select * into v_existing from public.projects where id = p_project_id;
  if v_existing.id is null then
    raise exception 'Project not found.';
  end if;
  v_new_owner_id := v_existing.owner_id;
  if p_project_group_id is not null and not exists (select 1 from public.project_groups where id = p_project_group_id) then
    raise exception 'Project Group not found.';
  end if;

  if v_is_admin then
    v_new_owner_id := coalesce(p_owner_id, v_new_owner_id);
  end if;

  -- Phase 6A (CD-215), locked model section M — post-creation correction of the Project's
  -- original engagement date ("Client Since") and the legacy contract-term pair is Admin-only.
  if not v_is_admin then
    if p_contract_start_date is distinct from v_existing.contract_start_date
       or p_contract_months is distinct from v_existing.contract_months
       or p_contract_end_date is distinct from v_existing.contract_end_date then
      raise exception 'Only an admin can change this project''s contract dates.';
    end if;
  end if;

  update public.projects p set
    name = case when v_is_admin then trim(coalesce(nullif(p_name, ''), p.name)) else p.name end,
    owner_id = v_new_owner_id,
    partner_brand_id = case when v_is_admin then p_partner_brand_id else p.partner_brand_id end,
    contract_start_date = p_contract_start_date,
    contract_months = coalesce(p_contract_months, p.contract_months),
    contract_end_date = p_contract_end_date,
    description = p_description,
    project_group_id = p_project_group_id,
    tags = coalesce(p_tags, p.tags),
    updated_at = now()
  where p.id = p_project_id
  returning * into v_row;

  -- Phase 4 — Primary TL normalization: a redundant Additional-TL row for the new owner is removed
  -- atomically in the same transaction as the owner change itself.
  if v_is_admin and v_row.owner_id is not null then
    delete from public.project_team_leads where project_id = p_project_id and user_id = v_row.owner_id;
  end if;

  return v_row;
end;
$$;

-- Signature is unchanged from the currently-hosted function, so existing privileges are preserved
-- by CREATE OR REPLACE alone; re-asserted explicitly here for auditability.
revoke all on function public.update_project_record(uuid, text, uuid, date, integer, date, text, uuid, text[], uuid) from public, anon;
grant execute on function public.update_project_record(uuid, text, uuid, date, integer, date, text, uuid, text[], uuid) to authenticated, service_role;

-- ============================================================================
-- 4. companies — Admin-only protection for contract_start_date / renewal_date
-- ============================================================================
-- Current Company screens are already Superadmin-only in practice; hosted RLS still has broader
-- legacy Supervisor update capability (companies_update), which this migration does NOT re-
-- architect. A narrow BEFORE UPDATE trigger adds the one additional, specific guard the locked
-- model requires: a non-superadmin caller cannot change contract_start_date or renewal_date, even
-- though they may still be permitted to update other Company fields. No other Company field is
-- touched or restricted by this trigger.

create or replace function public.enforce_company_contract_date_protection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    if new.contract_start_date is distinct from old.contract_start_date
       or new.renewal_date is distinct from old.renewal_date then
      raise exception 'Only an admin can change this company''s contract start or renewal date.';
    end if;
  end if;
  return new;
end;
$$;

create trigger companies_enforce_contract_date_protection
  before update on public.companies
  for each row execute function public.enforce_company_contract_date_protection();

revoke execute on function public.enforce_company_contract_date_protection() from public, anon, authenticated, service_role;
