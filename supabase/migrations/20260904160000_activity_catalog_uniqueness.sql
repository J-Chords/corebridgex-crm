-- Activity Level, Sections 16-17 — the architecture audit found no DB-level uniqueness protecting
-- Departments or Activities from duplication, and proved (read-only hosted queries, before this
-- migration was written) that no duplicates currently exist:
--   - departments grouped by (brand_id, service_line_id) where service_line_id is not null: 0 rows
--   - activities grouped by (department_id, lower(btrim(name))): 0 rows
-- Safe to add forward-only protection now that the hosted data is proven clean.
--
-- Partial index (service_line_id is not null) deliberately preserves the legitimate legacy case of
-- multiple Departments with service_line_id = null under the same brand (nothing about a "no
-- service line" Department needs to be unique per brand).
create unique index departments_brand_service_line_unique_idx
  on public.departments (brand_id, service_line_id)
  where service_line_id is not null;

-- Case-insensitive, trimmed: matches the exact dedup rule both existing find-or-create RPCs
-- (`create_activity_for_workstream`, `admin_create_activity_for_service_line`) already apply in
-- application logic — this makes that same rule a real DB guarantee instead of a convention only
-- enforced by those two call sites.
create unique index activities_department_name_unique_idx
  on public.activities (department_id, lower(btrim(name)));
