-- Foundation migration set, part 4/4.
--
-- Maps to src/lib/data/types/company.ts (Company), client-contact.ts (ClientContact),
-- service-line.ts (CompanyServiceLine), and User.assignedCompanyIds (normalized here into
-- user_companies rather than a uuid[] column — see the audit's reasoning: FK integrity + plain
-- joins/RLS instead of array containment checks).
--
-- ARCHITECTURE NOTE (discovered writing this migration, not anticipated by the audit): the mock
-- seed data's "Internal/Non-billable" pseudo-company is a fixed, human-readable string id
-- (INTERNAL_COMPANY_ID = "company-internal" in src/lib/data/constants.ts), always treated as
-- visible to everyone regardless of assignedCompanyIds. That string can't be a `uuid` primary
-- key. Rather than hardcode some arbitrary UUID as a magic sentinel inside every RLS
-- policy/helper function, this migration adds a real `is_internal boolean` column with a
-- partial unique index enforcing at most one such row — self-documenting, and
-- can_access_company() below checks that column instead of a hardcoded id. The eventual
-- Supabase provider implementation should look up "the" internal company by this flag rather
-- than by a specific id.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check (status in ('prospect', 'active', 'dormant', 'churned')),
  brand_id uuid not null references public.brands (id),
  -- FK to client_contacts added below, once that table exists.
  primary_contact_id uuid null,
  contract_start_date date null,
  renewal_date date null,
  active boolean not null default true,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index companies_brand_id_idx on public.companies (brand_id);
create index companies_status_idx on public.companies (status);
-- At most one company may ever be flagged internal.
create unique index companies_one_internal on public.companies (is_internal) where is_internal;

comment on column public.companies.is_internal is
  'True for exactly one seeded pseudo-company (mock: INTERNAL_COMPANY_ID = "company-internal") that''s always visible/loggable for every active staff member, without being added to anyone''s user_companies. See the migration file header for why this is a real column, not a hardcoded id.';

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  email text null,
  phone text null,
  title text null,
  is_primary boolean not null default false,
  notes text null
);

create index client_contacts_company_id_idx on public.client_contacts (company_id);
-- Mirrors the current app's own invariant ("single-primary-contact" enforced in
-- mock-companies-provider.ts's create/update contact logic) — now enforced at the DB level too.
create unique index client_contacts_one_primary_per_company
  on public.client_contacts (company_id) where is_primary;

alter table public.companies
  add constraint companies_primary_contact_id_fkey
  foreign key (primary_contact_id) references public.client_contacts (id) on delete set null;

create table public.company_service_lines (
  company_id uuid not null references public.companies (id) on delete cascade,
  service_line_id uuid not null references public.service_lines (id) on delete cascade,
  custom_fields jsonb not null default '{}'::jsonb,
  primary key (company_id, service_line_id)
);

create table public.user_companies (
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  primary key (user_id, company_id)
);

create index user_companies_company_id_idx on public.user_companies (company_id);

-- ---------------------------------------------------------------------------
-- Company-visibility helper — mirrors permissions.ts's visibleCompanyIds/canAccessCompany
-- exactly: superadmin sees all; the internal company is always visible to everyone; otherwise
-- visible via user_companies for yourself, or (for a supervisor) for any of your direct reports.
-- SECURITY DEFINER for the same recursion reason as manages_user() in the profiles migration.
-- ---------------------------------------------------------------------------
create function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.companies where id = target_company_id and is_internal
    )
    or exists (
      select 1 from public.user_companies uc
      where uc.company_id = target_company_id
        and (
          uc.user_id = auth.uid()
          or public.manages_user(uc.user_id)
        )
    );
$$;

grant execute on function public.can_access_company(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS. Company create is role-only (a company doesn't exist yet to scope against — matches
-- mock-companies-provider.ts's createCompany, which calls requireManage() with no companyId).
-- Company update requires BOTH role AND can_access_company — confirmed by reading
-- updateCompany's requireManage(viewer, id) call, which additionally runs requireAccess(id) when
-- an id is given. No DELETE policy anywhere here — Company has no hard-delete path today
-- (soft-delete via `active` only).
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;

create policy "companies_select" on public.companies
  for select using (public.can_access_company(id));

create policy "companies_insert" on public.companies
  for insert with check (public.is_supervisor() or public.is_superadmin());

create policy "companies_update" on public.companies
  for update
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(id))
  with check ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(id));

grant select, insert, update on public.companies to authenticated;

alter table public.client_contacts enable row level security;

create policy "client_contacts_select" on public.client_contacts
  for select using (public.can_access_company(company_id));

create policy "client_contacts_write" on public.client_contacts
  for all
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(company_id))
  with check ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(company_id));

grant select, insert, update on public.client_contacts to authenticated;

alter table public.company_service_lines enable row level security;

create policy "company_service_lines_select" on public.company_service_lines
  for select using (public.can_access_company(company_id));

create policy "company_service_lines_write" on public.company_service_lines
  for all
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(company_id))
  with check ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(company_id));

-- Delete is granted here (unlike companies/client_contacts) because this join table is fully
-- replaced on every save (mirrors mock-companies-provider.ts's syncServiceLines: delete this
-- company's rows, reinsert the new set) rather than ever being row-edited in place.
grant select, insert, update, delete on public.company_service_lines to authenticated;

alter table public.user_companies enable row level security;

create policy "user_companies_select" on public.user_companies
  for select using (
    user_id = auth.uid()
    or public.is_superadmin()
    or public.manages_user(user_id)
  );

create policy "user_companies_write" on public.user_companies
  for all
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(company_id))
  with check ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(company_id));

-- Same reasoning as company_service_lines — mirrors syncAssignedStaff's delete-then-reinsert.
grant select, insert, update, delete on public.user_companies to authenticated;
