-- Phase 7, part 1/4 — Workstreams (the "Service delivered to a client" layer between Company and
-- Task). Maps to src/lib/data/types/workstream.ts's `Workstream`/`WorkstreamMember`.
--
-- `name` is stored exactly as the app computes it (derive/qualifier logic lives entirely in
-- src/lib/data/workstream-name.ts, unchanged by this migration) — this table just persists
-- whatever string the app sends, same as the mock's own `db.workstreams` array.
--
-- Locked rule (Boss Feedback Implementation A.1): a normal client company's workstream requires a
-- real `service_line_id`; only the Internal/Non-billable company (`companies.is_internal`, added in
-- Foundation A specifically for this) may have `service_line_id = null`. Enforced here with a
-- trigger rather than a plain CHECK, since it depends on a sibling table.

create table public.workstreams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  company_id uuid not null references public.companies (id) on delete cascade,
  service_line_id uuid null references public.service_lines (id),
  -- Denormalized copy of the owning company's brand_id, mirroring the mock exactly (companies
  -- don't support multi-brand association yet) — kept in sync by the provider on create only,
  -- never independently editable, same invariant as company_id on tasks.
  brand_id uuid not null references public.brands (id),
  lead_user_id uuid not null references public.profiles (id),
  status text not null check (status in ('active', 'on-hold', 'completed', 'cancelled')),
  start_date date null,
  -- Displayed as "Renewal date" in the UI — see workstream-name.ts / the workstream detail page.
  end_date date null,
  recurrence_frequency text null check (recurrence_frequency in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  recurrence_anchor_date date null,
  recurrence_custom_interval_days int null,
  previous_occurrence_workstream_id uuid null references public.workstreams (id) on delete set null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workstreams_company_id_idx on public.workstreams (company_id);
create index workstreams_service_line_id_idx on public.workstreams (service_line_id);
create index workstreams_lead_user_id_idx on public.workstreams (lead_user_id);

comment on table public.workstreams is
  'A Service delivered to one Company. service_line_id is required for a normal client company; null is only valid for the Internal/Non-billable company (companies.is_internal) — see the enforcing trigger below.';

create table public.workstream_members (
  workstream_id uuid not null references public.workstreams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (workstream_id, user_id)
);

create index workstream_members_user_id_idx on public.workstream_members (user_id);

-- ---------------------------------------------------------------------------
-- Service-required-unless-Internal enforcement.
-- ---------------------------------------------------------------------------
create function public.enforce_workstream_service_requirement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_is_internal boolean;
begin
  select c.is_internal into company_is_internal from public.companies c where c.id = new.company_id;
  if new.service_line_id is null and not coalesce(company_is_internal, false) then
    raise exception 'A workstream for a normal client company requires a service.';
  end if;
  return new;
end;
$$;

create trigger workstreams_enforce_service
  before insert or update on public.workstreams
  for each row execute function public.enforce_workstream_service_requirement();

-- ---------------------------------------------------------------------------
-- Access helper — mirrors permissions.ts's canAccessWorkstream exactly: superadmin sees all; the
-- Internal company's workstream(s) are always visible; otherwise lead/team membership, with
-- manages_user() already covering "is me," "is superadmin," and "is my direct report" in one call.
-- ---------------------------------------------------------------------------
create function public.can_access_workstream(target_workstream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.workstreams w
      join public.companies c on c.id = w.company_id
      where w.id = target_workstream_id and c.is_internal
    )
    or exists (
      select 1 from public.workstreams w
      where w.id = target_workstream_id and public.manages_user(w.lead_user_id)
    )
    or exists (
      select 1 from public.workstream_members m
      where m.workstream_id = target_workstream_id and public.manages_user(m.user_id)
    );
$$;

grant execute on function public.can_access_workstream(uuid) to authenticated;
grant execute on function public.can_access_workstream(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS. Create/update restricted to supervisor+superadmin (mirrors canManageWorkstreams); no
-- DELETE policy anywhere — a Workstream has no hard-delete path in the app today.
-- ---------------------------------------------------------------------------
alter table public.workstreams enable row level security;

create policy "workstreams_select" on public.workstreams
  for select using (public.can_access_workstream(id));

create policy "workstreams_insert" on public.workstreams
  for insert with check (public.is_supervisor() or public.is_superadmin());

create policy "workstreams_update" on public.workstreams
  for update
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_workstream(id))
  with check ((public.is_supervisor() or public.is_superadmin()) and public.can_access_workstream(id));

grant select, insert, update on public.workstreams to authenticated;
grant select, insert, update, delete on public.workstreams to service_role;

alter table public.workstream_members enable row level security;

create policy "workstream_members_select" on public.workstream_members
  for select using (public.can_access_workstream(workstream_id));

create policy "workstream_members_write" on public.workstream_members
  for all
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_workstream(workstream_id))
  with check ((public.is_supervisor() or public.is_superadmin()) and public.can_access_workstream(workstream_id));

grant select, insert, delete on public.workstream_members to authenticated;
grant select, insert, update, delete on public.workstream_members to service_role;
