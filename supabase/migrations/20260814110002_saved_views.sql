-- Phase 7D, part 3 — Saved Views. Maps to src/lib/data/types/saved-view.ts's `SavedView`.
--
-- `filters` is not a generic opaque blob — it's the exact flat SavedViewFilters shape
-- (search/companyId/workstreamId/status/priority/assigneeId/groupBy) the app already mirrors
-- field-for-field against TaskFilters. JSONB is still the right column type (per the phase
-- instructions' own guidance for "saved view/filter configuration") since it's a small,
-- app-owned, non-relational payload with no need for column-level querying — but the exact key
-- shape is documented here rather than treated as truly free-form.
--
-- Strictly user-owned: no sharing/team-views concept exists today (mock-saved-views-provider.ts's
-- own doc comment is explicit about this) — RLS is a pure ownership check, no role-based
-- override for supervisor/superadmin.

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- Expected shape: { search: text, companyId: text, workstreamId: text, status: text,
  -- priority: text, assigneeId: text, groupBy: text } — "all" is the app's own sentinel for
  -- "no filter" on companyId/workstreamId/status/priority/assigneeId, not sql null.
  filters jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_views_user_id_idx on public.saved_views (user_id);

comment on table public.saved_views is
  'Strictly personal — a user only ever sees/edits/deletes their own saved views, no sharing.';

-- ---------------------------------------------------------------------------
-- RLS. Full CRUD, owner-only throughout — matches the mock's requireOwner check on every
-- mutating method, and listSavedViews's own strict userId === viewer.id filter.
-- ---------------------------------------------------------------------------
alter table public.saved_views enable row level security;

create policy "saved_views_select" on public.saved_views
  for select using (user_id = auth.uid());

create policy "saved_views_insert" on public.saved_views
  for insert with check (user_id = auth.uid());

create policy "saved_views_update" on public.saved_views
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "saved_views_delete" on public.saved_views
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.saved_views to authenticated;
grant select, insert, update, delete on public.saved_views to service_role;
