-- Activity Level, Section 5 — extends `activities` with the catalog-management metadata proven
-- missing by the architecture audit: description, active/inactive, a truthful Created By, and
-- lifecycle timestamps. Forward-only extension of `activities` (20260814090001_activity_catalog.sql)
-- — that table's own ids/rows/relationships to workstream_activities/tasks/project_issues/
-- project_template_activities are completely untouched.
--
-- created_by is nullable specifically for every pre-existing Activity row, which predates this
-- column and has no true creator to record — left null rather than fabricated; the UI shows a
-- truthful "legacy — creator not recorded" state for those. created_at/updated_at default to now()
-- for those same legacy rows purely because no earlier timestamp exists to backfill from — they
-- reflect when tracking began, not each Activity's true original creation date. Every new Activity
-- created through the Admin catalog from here on gets a real created_by/created_at.
--
-- Deliberately NOT added to `departments` (Product Owner decision — Department stays a technical
-- Brand/Service scoping container, not a catalog entity with its own lifecycle).

alter table public.activities
  add column description text null,
  add column is_active boolean not null default true,
  add column created_by uuid null references public.profiles (id),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
