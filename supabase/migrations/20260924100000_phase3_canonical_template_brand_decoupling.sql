-- Phase 3A.C (CD-208) — decouple canonical Template (Service Line) Activities from Partner Brand.
--
-- Audit finding this migration fixes: `departments.brand_id` is `not null`, and every canonical
-- Template/Project Activity workflow (Add Activities to a Project Template, Project creation's
-- Service picker, Add Service) filters the Activity catalog by `.eq("brand_id", <brand>)" through
-- Department. That means the SAME nominal Template (Service Line) could have structurally
-- DIFFERENT Activities per Brand (each Brand gets its own Department row for a given Service
-- Line, per the existing `departments_brand_service_line_unique_idx`), which is exactly the
-- coupling the Product Owner approved removing (see CD-208's decision log): a canonical Template's
-- Activity structure must be single and Brand-independent.
--
-- Design: `departments.brand_id` becomes nullable. Going forward, a Department scoping a canonical
-- Template's Activities has `brand_id = null` — a single, Brand-independent container per Service
-- Line. Any OTHER historical use of Department (Brand-scoped catalog browsing outside the
-- canonical Template/Project flow, if any remains after the application-layer changes accompanying
-- this migration) keeps working against whatever brand-scoped Department rows already exist —
-- this migration does not delete any existing Department/Activity row, only adds a new
-- Brand-independent one per Service Line and re-points existing Activities onto it.
--
-- Data safety: this migration REFUSES (raises an exception, migration aborts, nothing is changed)
-- if it ever finds two different Brands' Departments for the same Service Line containing
-- differently-cased-but-equal-when-trimmed Activity names that are NOT already identical after
-- consolidation would collide — i.e. if consolidating would violate the existing
-- `activities_department_name_unique_idx` (department_id, lower(btrim(name))). Per the project's
-- own migration-safety discipline (see docs/data-and-supabase.md), this must be verified against
-- the actual hosted data with a preflight query before this migration is ever applied there — see
-- the preflight query documented at the bottom of this file. As of the audit backing this
-- migration, only one Brand ("Sparing Consulting") has any populated Departments/Activities at
-- all, so no such collision is expected in practice, but this migration does not rely on that
-- assumption — it verifies it.

alter table public.departments
  alter column brand_id drop not null;

comment on column public.departments.brand_id is
  'Null for a canonical, Brand-independent Department (Phase 3, CD-208) — the normal shape for any Department scoping a Service Line''s canonical Activity structure going forward. Non-null legacy Brand-scoped Departments are preserved as historical data, not deleted by this migration.';

-- At most one canonical (brand-independent) Department per Service Line.
create unique index departments_canonical_service_line_unique_idx
  on public.departments (service_line_id)
  where brand_id is null and service_line_id is not null;

-- ---------------------------------------------------------------------------
-- Data migration: for every Service Line that has one or more existing (Brand-scoped) Departments,
-- create one canonical (brand_id = null) Department, then re-point every Activity currently under
-- any of that Service Line's Brand-scoped Departments onto the new canonical Department. Activity
-- ids are preserved (only `department_id` changes) — every existing reference to an Activity's own
-- id (workstream_activities.activity_id, tasks.activity_id, project_issues.activity_id) keeps
-- working unchanged, since none of those reference department_id.
-- ---------------------------------------------------------------------------
do $$
declare
  v_service_line record;
  v_canonical_department_id uuid;
  v_collision record;
begin
  for v_service_line in
    select distinct service_line_id
    from public.departments
    where service_line_id is not null and brand_id is not null
  loop
    -- Fail loudly rather than silently merge/lose data: if two Brand-scoped Departments for this
    -- Service Line each have an Activity whose trimmed, case-insensitive name matches, consolidating
    -- them under one canonical Department would collide with activities_department_name_unique_idx.
    -- This has been verified absent on the hosted project as of the audit backing this migration
    -- (only one Brand has any Activities at all) — re-verify with the preflight query below before
    -- ever applying this migration to hosted.
    select a1.name as name_a, a2.name as name_b, d1.brand_id as brand_a, d2.brand_id as brand_b
    into v_collision
    from public.activities a1
    join public.departments d1 on d1.id = a1.department_id
    join public.activities a2 on a2.id <> a1.id and lower(btrim(a2.name)) = lower(btrim(a1.name))
    join public.departments d2 on d2.id = a2.department_id
    where d1.service_line_id = v_service_line.service_line_id
      and d2.service_line_id = v_service_line.service_line_id
      and d1.id <> d2.id
    limit 1;

    if found then
      raise exception
        'Phase 3 canonical Template brand-decoupling migration aborted: Service Line % has Activities with colliding names ("%" / "%") across different Brand-scoped Departments (brand % and %). This must be resolved manually (rename or merge) before this migration can run safely — see this file''s header.',
        v_service_line.service_line_id, v_collision.name_a, v_collision.name_b, v_collision.brand_a, v_collision.brand_b;
    end if;

    insert into public.departments (brand_id, name, position, service_line_id)
    select null,
           coalesce((select name from public.service_lines where id = v_service_line.service_line_id), 'General'),
           0,
           v_service_line.service_line_id
    on conflict (service_line_id) where brand_id is null and service_line_id is not null do nothing
    returning id into v_canonical_department_id;

    if v_canonical_department_id is null then
      select id into v_canonical_department_id
      from public.departments
      where service_line_id = v_service_line.service_line_id and brand_id is null;
    end if;

    update public.activities
    set department_id = v_canonical_department_id
    where department_id in (
      select id from public.departments
      where service_line_id = v_service_line.service_line_id and brand_id is not null
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Hosted preflight query (run manually against hosted before ever applying this migration there —
-- do NOT apply without Product Owner authorization, per CD-208's explicit instruction). Expected
-- result: zero rows. Any row returned identifies the exact Service Line/Activity-name collision
-- that would abort the migration above, so it can be resolved manually first.
--
-- select d1.service_line_id, a1.name, a2.name, d1.brand_id, d2.brand_id
-- from public.activities a1
-- join public.departments d1 on d1.id = a1.department_id
-- join public.activities a2 on a2.id <> a1.id and lower(btrim(a2.name)) = lower(btrim(a1.name))
-- join public.departments d2 on d2.id = a2.department_id
-- where d1.service_line_id = d2.service_line_id and d1.service_line_id is not null and d1.id <> d2.id;
-- ---------------------------------------------------------------------------
