-- Foundation migration set, part 3/4.
--
-- Maps to src/lib/data/types/brand.ts (Brand) and service-line.ts (ServiceLine). Seed/
-- migration-managed reference data — the current app has no in-app brand/service-line editor
-- (CompaniesProvider.listBrands/listServiceLines are read-only lookups), so there's no INSERT/
-- UPDATE/DELETE grant for either table in this slice.

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.service_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table public.brands enable row level security;
alter table public.service_lines enable row level security;

-- Ungated read — every authenticated staff member can see the reference catalog, matching
-- listBrands/listServiceLines taking no viewer-scoping today.
create policy "brands_select_all" on public.brands
  for select using (true);

create policy "service_lines_select_all" on public.service_lines
  for select using (true);

grant select on public.brands to authenticated;
grant select on public.service_lines to authenticated;
