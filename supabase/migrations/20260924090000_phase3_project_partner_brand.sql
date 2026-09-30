-- Phase 3A.A/B (CD-208) — Project-specific Partner Brand.
--
-- Product Owner decision: Partner Brand becomes a true Project-specific field, not just an
-- inherited Company-level attribute. Two Projects under the same Company may carry different
-- Partner Brands going forward. `companies.brand_id` is untouched and keeps its existing meaning
-- (Company-level master data) — this migration does not repurpose it and does not change its
-- semantics for any existing consumer (Workstream's own denormalized `brand_id`, the Activity
-- Catalog's brand scoping, etc. are all separate, unaffected by this file).
--
-- One-time backfill only: every existing Project's `partner_brand_id` is seeded from its owning
-- Company's current `brand_id` at migration time, to preserve exactly what's displayed today
-- (Project Overview's "Partner Brand" reads through the Company currently — see CD-207's
-- Administrative Details card). After this migration, there is NO ongoing synchronization in
-- either direction: editing a Company's Brand never touches any Project's `partner_brand_id`, and
-- editing a Project's `partner_brand_id` never touches its Company's `brand_id`. A Company with no
-- Brand set backfills to `null` — a Project's Partner Brand is optional, same as Company's is.

alter table public.projects
  add column partner_brand_id uuid null references public.brands (id);

comment on column public.projects.partner_brand_id is
  'Project-specific Partner Brand (Phase 3, CD-208) — independent of companies.brand_id. Backfilled once from the owning Company''s brand_id at migration time; no ongoing sync in either direction after that. Null is valid (no Brand set).';

update public.projects p
set partner_brand_id = c.brand_id
from public.companies c
where c.id = p.company_id
  and c.brand_id is not null
  and p.partner_brand_id is null;

create index projects_partner_brand_id_idx on public.projects (partner_brand_id);
