-- Phase 8A backfill — one Project per existing Company (including Internal/Non-billable),
-- workstreams.project_id pointed at it, and project_members seeded from every current legitimate
-- operational access path. Idempotent (NOT EXISTS / re-run-safe) and non-destructive: no existing
-- Company/Workstream/Task/etc. row is ever updated or deleted, only new rows inserted and the new
-- nullable workstreams.project_id column populated.
--
-- CONTRACT DATES ARE NEVER FABRICATED. Per the explicit correction to the earlier design audit:
-- - contract_start_date is copied directly from companies.contract_start_date (null stays null).
-- - contract_end_date is copied directly from companies.renewal_date (null stays null) — it is
--   NOT computed as start + contract_months, since that would assert a historical fact (when this
--   contract actually renews) that was never actually recorded. contract_months = 12 is set
--   regardless, as a forward-looking default for future use (e.g. computing a *suggested* end
--   date when someone later edits this Project) — it does not assert any date actually happened.
-- - The Internal/Non-billable Company's Project gets contract_start_date = contract_end_date =
--   null unconditionally, preserving the canonical "internal work is not a one-year client
--   contract" rule.
--
-- NAMING: a Project name only encodes a year range when a real contract_start_date exists to
-- justify it (matching the "Alderleaf 2026-2027" style example) — otherwise the Project is simply
-- named after its Company, never a fabricated range.
--
-- owner_id / created_by: resolved dynamically, never hardcoded, from whichever real Supervisor
-- already leads that Company's own Workstreams today (falling back to the earliest-created
-- Supervisor if a Company has no Workstreams yet) — mirrors the same "resolve by role" discipline
-- every other Phase 7 seed/backfill in this repository already uses.

insert into public.projects (company_id, name, owner_id, status, contract_start_date, contract_months, contract_end_date, description, created_by)
select
  c.id,
  case
    when c.is_internal then c.name
    when c.contract_start_date is not null then c.name || ' ' || extract(year from c.contract_start_date)::int || '-' || (extract(year from c.contract_start_date)::int + 1)
    else c.name
  end,
  coalesce(
    (select w.lead_user_id from public.workstreams w where w.company_id = c.id order by w.created_at limit 1),
    (select id from public.profiles where role = 'supervisor' order by created_at limit 1)
  ),
  'active',
  case when c.is_internal then null else c.contract_start_date end,
  12,
  case when c.is_internal then null else c.renewal_date end,
  case when c.is_internal then 'Internal operational work — not an annual client contract.' else null end,
  coalesce(
    (select w.lead_user_id from public.workstreams w where w.company_id = c.id order by w.created_at limit 1),
    (select id from public.profiles where role = 'supervisor' order by created_at limit 1)
  )
from public.companies c
where not exists (select 1 from public.projects p where p.company_id = c.id);

-- Point every existing Workstream at its Company's (now-guaranteed-to-exist) Project. Only ever
-- fills a currently-null project_id — never overwrites one a later, real creation flow may have
-- already set.
update public.workstreams w
set project_id = p.id
from public.projects p
where p.company_id = w.company_id
  and w.project_id is null;

-- project_members backfill — derives legitimate current operational access from every relevant
-- relationship (at minimum the four named in the phase instructions, plus two more identified
-- during this audit as equally load-bearing for "who legitimately already works here": a Task's
-- own creator and whoever last changed its status — both real operational-work signals, not
-- incidental). Deliberately excludes Note authors / Task Handoff participants: in the current
-- dataset every such person is already captured by one of these six relationships, and treating
-- mere authorship of a note/handoff as membership-worthy would risk pulling in "arbitrary
-- unrelated staff" the instructions explicitly warn against.
with company_users as (
  select company_id, user_id from public.user_companies
  union
  select company_id, lead_user_id as user_id from public.workstreams
  union
  select w.company_id, wm.user_id
  from public.workstream_members wm
  join public.workstreams w on w.id = wm.workstream_id
  union
  select w.company_id, ta.user_id
  from public.task_assignees ta
  join public.tasks t on t.id = ta.task_id
  join public.workstreams w on w.id = t.workstream_id
  union
  select w.company_id, t.created_by as user_id
  from public.tasks t
  join public.workstreams w on w.id = t.workstream_id
  union
  select w.company_id, t.status_changed_by as user_id
  from public.tasks t
  join public.workstreams w on w.id = t.workstream_id
  where t.status_changed_by is not null
)
insert into public.project_members (project_id, user_id)
select distinct p.id, cu.user_id
from public.projects p
join company_users cu on cu.company_id = p.company_id
where not exists (
  select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = cu.user_id
);

-- Safety assertion, not a mutation: fail loudly rather than silently leaving any Workstream
-- without a Project.
do $$
declare orphan_count int;
begin
  select count(*) into orphan_count from public.workstreams where project_id is null;
  if orphan_count > 0 then
    raise exception 'Projects backfill incomplete: % workstream(s) still have a null project_id.', orphan_count;
  end if;
end $$;
