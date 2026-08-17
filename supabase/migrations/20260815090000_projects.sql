-- Phase 8A — Project / Annual Contract Foundation. Maps to the new locked hierarchy:
-- Company (permanent administrative client record) -> Project (operational client engagement /
-- annual contract) -> Workstream (=Service) -> selected Activities -> Task -> Checklist.
--
-- UI TERM IS "Project" — never "Engagement." "Engagement" was this repository's own original
-- name for what later became Workstream, and it tested poorly with stakeholders; reusing it here
-- for a different concept would resurrect a retired, confusing term. This migration's own
-- identifiers ("projects", "project_members") deliberately avoid the word too.
--
-- Purely additive, transitional schema: workstreams.company_id is NOT removed, workstreams gains
-- a nullable project_id (backfilled, but not yet NOT NULL — see the follow-up backfill
-- migration), and user_companies is untouched (project_members coexists with it, per the
-- explicit instruction not to remove it this phase).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  owner_id uuid not null references public.profiles (id),
  status text not null check (status in ('active', 'on-hold', 'completed', 'cancelled')) default 'active',
  -- Both nullable — a normal client Project's contract dates are usually known, but a backfilled
  -- Project from a Company with no recorded contract_start_date/renewal_date must NOT fabricate
  -- one (see the backfill migration's own header comment). contract_end_date is always STORED,
  -- never a generated/computed column — a real contract can be extended or ended early, and that
  -- edit must never be silently overwritten by a start+duration recomputation.
  contract_start_date date null,
  contract_months int not null default 12,
  contract_end_date date null,
  description text null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_end_after_start check (
    contract_start_date is null or contract_end_date is null or contract_end_date >= contract_start_date
  )
);

create index projects_company_id_idx on public.projects (company_id);
create index projects_owner_id_idx on public.projects (owner_id);

comment on table public.projects is
  'The operational client engagement / annual contract layer between Company and Workstream. UI term: "Project" — never "Engagement." Internal/Non-billable gets its own Project with null contract dates (no annual-contract concept applies to internal work).';

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------------
-- can_access_project — mirrors can_access_workstream's exact shape: superadmin sees all; the
-- Internal company's Project is always visible (preserving the canonical Internal/Non-billable
-- access behavior — no fake annual contract, no reduced visibility); otherwise owner/member,
-- with manages_user() already covering "is me," "is superadmin," and "is my direct report" in one
-- call, giving Supervisor exactly "Projects they personally belong to + Projects containing their
-- team's legitimate scope" without any organization-wide broadening.
--
-- Deliberately NOT extended (yet) with a Task-assignee-implies-access branch the way
-- can_access_workstream was in the Phase 7A-C hotfix — Project membership is meant to be the
-- real, explicit operational relationship here, and the backfill migration seeds it from every
-- current legitimate access path (user_companies, workstream lead, workstream members, task
-- assignees, task creator/status-changer) precisely so this narrower model doesn't strand
-- anyone's existing access on day one. Revisit only if real testing finds a genuine gap, the same
-- way the Workstream one was found.
-- ---------------------------------------------------------------------------
create function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = target_project_id and c.is_internal
    )
    or exists (
      select 1 from public.projects p
      where p.id = target_project_id and public.manages_user(p.owner_id)
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = target_project_id and public.manages_user(pm.user_id)
    );
$$;

revoke execute on function public.can_access_project(uuid) from public, anon;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS. Reads follow can_access_project. Writes are deliberately conservative this slice —
-- Superadmin only. Project creation/edit UX (and any broader write model) is explicitly out of
-- scope for 8A; this is backend + read-only surface only. Boss-approved Employee creation is for
-- Service/Activities/Tasks INSIDE a Project, never for the Project (annual contract) record
-- itself — those are not the same permission.
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;

create policy "projects_select" on public.projects
  for select using (public.can_access_project(id));

create policy "projects_insert" on public.projects
  for insert with check (public.is_superadmin());

create policy "projects_update" on public.projects
  for update using (public.is_superadmin()) with check (public.is_superadmin());

grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.projects to service_role;

alter table public.project_members enable row level security;

create policy "project_members_select" on public.project_members
  for select using (public.can_access_project(project_id));

create policy "project_members_write" on public.project_members
  for all using (public.is_superadmin()) with check (public.is_superadmin());

grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.project_members to service_role;

-- ---------------------------------------------------------------------------
-- workstreams.project_id — nullable transitional FK. workstreams.company_id is NOT removed.
-- Backfilled in the follow-up migration; NOT NULL is deferred to a future cleanup phase once
-- providers/UI have fully transitioned, per the explicit instruction not to force it yet.
-- ---------------------------------------------------------------------------
alter table public.workstreams add column project_id uuid null references public.projects (id);
create index workstreams_project_id_idx on public.workstreams (project_id);

comment on column public.workstreams.end_date is
  'Displayed as "Renewal date" today — that label is being retired in a later Phase 8 UI slice. Annual client contract renewal now lives on projects.contract_end_date. If this column keeps a UI label at all going forward, it must mean "Service end date," never "annual contract renewal."';
