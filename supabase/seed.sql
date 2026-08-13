-- Local dev seed data — reference/company data only. Loaded automatically by
-- `supabase db reset` (per supabase/config.toml's [db.seed] section) and by
-- `supabase db push --include-seed` — which means it can run more than once against the same
-- database (e.g. a future push that includes both a new migration and this file again), so
-- every statement below is written to be safely re-runnable: `ON CONFLICT DO NOTHING` where a
-- real unique constraint already exists (brands/service_lines/company_service_lines), or a
-- `NOT EXISTS` guard keyed to the same invariant the schema already enforces (is_internal for
-- the one internal company, "already has a primary contact" for contacts, company name for the
-- three demo companies, which have no DB-level uniqueness constraint of their own since real
-- company names legitimately could collide — this guard is seed-script-only, not a schema
-- change).
--
-- Deliberately contains NO auth.users/profiles rows and NO plaintext passwords. Real Auth users
-- (one Superadmin, one Supervisor, one Employee to start, matching the current manual-testing
-- convention) must be created through Supabase Auth itself — see
-- docs/current-project-state.md's "Supabase Foundation" section for exactly how, once this
-- repo is actually connected to the corebridgex-crm project. Nothing in this file attempts that.
--
-- Names loosely follow the current mock seed data (seed-brands.ts/seed-service-lines.ts) for
-- continuity, not as a byte-for-byte migration of mock data — this is throwaway dev/test data.

insert into public.brands (name) values
  ('Sparing Consulting'),
  ('EdgeNovelty'),
  ('Bill Optimum'),
  ('VeroTax Advisory'),
  ('Croki Digital'),
  ('Corebridge X (Internal)')
on conflict (name) do nothing;

insert into public.service_lines (name) values
  ('Accounting'),
  ('Payroll'),
  ('HR'),
  ('Tax'),
  ('Compliance'),
  ('File Management'),
  ('IT/Digital'),
  ('Consulting')
on conflict (name) do nothing;

-- The one internal/non-billable pseudo-company — see companies.is_internal's comment in
-- 20260813130859_companies.sql for why this is a flag, not a hardcoded id. Guarded on the same
-- "at most one is_internal row" invariant the schema's own partial unique index enforces.
insert into public.companies (name, status, brand_id, active, is_internal)
select 'Internal / Non-billable', 'active', b.id, true, true
from public.brands b
where b.name = 'Corebridge X (Internal)'
  and not exists (select 1 from public.companies where is_internal);

insert into public.companies (name, status, brand_id, active, contract_start_date)
select 'Alderleaf Manufacturing', 'active', b.id, true, '2025-01-06'
from public.brands b
where b.name = 'Sparing Consulting'
  and not exists (select 1 from public.companies where name = 'Alderleaf Manufacturing');

insert into public.companies (name, status, brand_id, active, contract_start_date)
select 'Fenwick Textiles', 'active', b.id, true, '2025-02-10'
from public.brands b
where b.name = 'Sparing Consulting'
  and not exists (select 1 from public.companies where name = 'Fenwick Textiles');

insert into public.companies (name, status, brand_id, active, contract_start_date)
select 'Junction Analytics', 'active', b.id, true, '2025-03-01'
from public.brands b
where b.name = 'EdgeNovelty'
  and not exists (select 1 from public.companies where name = 'Junction Analytics');

insert into public.client_contacts (company_id, name, title, email, is_primary)
select c.id, 'Dana Reyes', 'Operations Manager', 'dana.reyes@alderleaf.example', true
from public.companies c
where c.name = 'Alderleaf Manufacturing'
  and not exists (select 1 from public.client_contacts where company_id = c.id and is_primary);

insert into public.client_contacts (company_id, name, title, email, is_primary)
select c.id, 'Morgan Ellis', 'Finance Lead', 'morgan.ellis@fenwicktextiles.example', true
from public.companies c
where c.name = 'Fenwick Textiles'
  and not exists (select 1 from public.client_contacts where company_id = c.id and is_primary);

update public.companies c
set primary_contact_id = cc.id
from public.client_contacts cc
where cc.company_id = c.id and cc.is_primary and c.primary_contact_id is distinct from cc.id;

insert into public.company_service_lines (company_id, service_line_id)
select c.id, sl.id from public.companies c, public.service_lines sl
where c.name = 'Alderleaf Manufacturing' and sl.name = 'Accounting'
on conflict (company_id, service_line_id) do nothing;

insert into public.company_service_lines (company_id, service_line_id)
select c.id, sl.id from public.companies c, public.service_lines sl
where c.name = 'Fenwick Textiles' and sl.name = 'Accounting'
on conflict (company_id, service_line_id) do nothing;

insert into public.company_service_lines (company_id, service_line_id)
select c.id, sl.id from public.companies c, public.service_lines sl
where c.name = 'Junction Analytics' and sl.name = 'IT/Digital'
on conflict (company_id, service_line_id) do nothing;

-- No user_companies rows yet — those need real profiles.id values, which only exist once real
-- Auth users have actually been created and assigned a role/companies.
