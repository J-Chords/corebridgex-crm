-- Phase 3A.D/E (CD-208) — true Template → Project snapshot semantics.
--
-- Audit finding this migration fixes: `workstream_activities` is a pure join table (workstream_id,
-- activity_id only) — every read live-joins the global `activities` row for its name/description/
-- default_task_titles, so editing a catalog Activity today changes what every Project using it
-- displays immediately. The Product Owner approved changing this to a true snapshot: a Project's
-- Template/Activity structure must freeze at application time and stay independent of later global
-- catalog edits, while still preserving a lineage pointer back to the source Activity.
--
-- `workstreams.name`/`workstreams.description` (the Template-instance-level identity) do NOT need
-- a schema change for this — `name` is already frozen at write-time by the client
-- (`deriveWorkstreamName`, src/lib/data/workstream-name.ts), it's only `workstreamDisplayHeading`'s
-- own read-time preference for the live-joined Service Line name that currently defeats that
-- freeze (an application-layer fix, made alongside this migration, not a schema one). This
-- migration's one-time backfill below re-freezes `workstreams.name` to its current live-displayed
-- value, so every existing Workstream's display is unaffected by this change at the moment it's
-- applied — see this migration's second data-migration block.
--
-- `tasks.activity_id`, `project_issues.activity_id` are explicitly untouched and keep pointing at
-- the global `public.activities.id` exactly as today (per CD-208's explicit "preserve existing
-- Tasks' activity links" instruction) — a Task's own Activity link is a stable identity reference,
-- not part of what needs to snapshot; only "what does the Project believe this Activity currently
-- looks like" (its display name/description/suggested Task titles) needs to freeze.

-- ---------------------------------------------------------------------------
-- 1. workstream_activities: add frozen display columns; switch from a composite PK to a surrogate
--    one (source_activity_id must become nullable so a snapshot survives even if its source
--    Activity is ever deleted — see the FK change below — and a nullable column can't be part of a
--    primary key).
-- ---------------------------------------------------------------------------
alter table public.workstream_activities
  add column id uuid not null default gen_random_uuid(),
  add column name text null,
  add column description text null,
  add column default_task_titles text[] not null default '{}',
  add column position int not null default 0,
  add column applied_at timestamptz not null default now();

-- Freeze every existing row's currently-live-joined Activity data — this is the "capture the
-- CURRENT Template/Activity state at migration time" step (CD-208 section 7). No existing
-- Workstream/Task/Time-Entry/Comment history is touched; only these new columns are populated.
update public.workstream_activities wa
set name = a.name,
    description = a.description,
    default_task_titles = a.default_task_titles,
    position = a.position
from public.activities a
where a.id = wa.activity_id;

alter table public.workstream_activities
  alter column name set not null;

alter table public.workstream_activities
  drop constraint workstream_activities_pkey;

alter table public.workstream_activities
  add constraint workstream_activities_pkey primary key (id);

-- Preserve the old "no duplicate Activity per Workstream" guarantee as a plain unique index (was
-- previously the composite primary key) — still applies whenever lineage is intact.
create unique index workstream_activities_workstream_activity_unique_idx
  on public.workstream_activities (workstream_id, activity_id)
  where activity_id is not null;

-- Lineage, not a live dependency: `activity_id` may now be null (a source Activity that was later
-- deleted — see admin_delete_activity's existing usage guard, which already refuses to delete any
-- Activity referenced here, so this is a defense-in-depth path, not an expected common case), and
-- deleting the source Activity no longer cascades away the frozen snapshot row (previously
-- `on delete cascade`, which would have destroyed real Project history) — it now just clears the
-- lineage pointer.
alter table public.workstream_activities
  drop constraint workstream_activities_activity_id_fkey;

alter table public.workstream_activities
  alter column activity_id drop not null;

alter table public.workstream_activities
  add constraint workstream_activities_activity_id_fkey
  foreign key (activity_id) references public.activities (id) on delete set null;

comment on table public.workstream_activities is
  'A Project Template (Workstream) instance''s own frozen Activity snapshot (Phase 3, CD-208) — name/description/default_task_titles/position are copied from the source Activity at application time and never live-joined again. activity_id is a lineage-only pointer to the global catalog (nullable — survives a source Activity deletion via ON DELETE SET NULL).';

comment on column public.workstream_activities.activity_id is
  'Lineage only — the source global Activity this snapshot was applied from. Never used as a live display join after Phase 3 (CD-208); may be null if the source Activity was later deleted. tasks.activity_id/project_issues.activity_id are separate, unaffected FKs that still point at the live global activities table by design.';

-- ---------------------------------------------------------------------------
-- 2. One-time freeze of workstreams.name to its current live-displayed value, so existing
--    Workstreams look identical immediately after this migration as they did immediately before it
--    (the display-logic change accompanying this migration stops preferring the live Service Line
--    join going forward — this backfill is what makes that switch invisible for already-existing
--    Workstreams at the moment of migration).
-- ---------------------------------------------------------------------------
update public.workstreams w
set name = sl.name
from public.service_lines sl
where sl.id = w.service_line_id
  and w.service_line_id is not null;

-- One-time default-description snapshot: if a Workstream has no description of its own yet and its
-- Service Line currently has one, copy it in as a starting snapshot (CD-208 section 3, "Template
-- description where currently meaningful"). Never overwrites a Workstream's own existing
-- description.
update public.workstreams w
set description = sl.description
from public.service_lines sl
where sl.id = w.service_line_id
  and w.description is null
  and sl.description is not null;
