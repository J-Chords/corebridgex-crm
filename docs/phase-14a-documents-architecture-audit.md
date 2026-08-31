# Phase 14A — Documents & Attachments Architecture Audit

**Status: PHASE 14A — COMPLETE / ACCEPTED / ARCHITECTURE LOCKED.** This document is the corrected,
locked architecture for **Phase 14 — Documents & Client File Management**. Phase 14B (Storage +
Metadata Security Foundation) is implemented on top of this lock; Phase 14B's own status is tracked
separately in `docs/current-project-state.md`/`docs/phase-14b-documents-security-foundation-spec.md`
and is **not** marked accepted by this document. No Phase 14C (UI) work is included here.

## Locked defaults (read this first)

- Phase 14 = **Documents & Client File Management** (locked, not merely proposed).
- Locked IA: `Project → Documents` (a first-class Project tab) and `Full Task → Attachments` (a
  section inside Full Task) — **one** underlying `documents` model for both.
- One private Storage bucket (`documents`).
- 25MB max file size; a fixed extension/MIME allowlist (Part 12).
- Signed URLs only, 300-second expiry, minted just-in-time, never persisted, never public.
- Soft delete / Trash only in 14B — **no automatic purge job** (Correction 4). Permanent purge is
  deferred to a later, narrowly-designed Superadmin-only workflow.
- `project_id` is mandatory and immutable. `task_id` is optional and **immutable after creation**
  (Correction 2/3) — Project/Task consistency for a Task-linked Document is derived and validated
  **server-side**, never trusted from caller input.
- **No "change context" action in v1** (Correction 3) — a Document can never be moved between
  Task-linked and Project-level scope after creation. A wrong-context file is deleted and
  re-uploaded instead.
- Client Reports remain fully separate (Part 19), unchanged.
- No Task Create/Edit upload (Part 5). Quick View gets a compact count later (14D). Full Task gets
  real management later (14D).
- No folders, no versioning, no OCR, no AI, no external storage integrations, no client portal, no
  external sharing (Part 27) — none of these are v1.

## Baseline

HEAD == origin/main == `aa73d324f80f62afdc4c0267e31cc26f2019004d` (confirmed, matches expected).
All 60 existing migrations local == remote; `db push --dry-run` reports "Remote database is up to
date"; zero pending migrations.

## Correction log (Stage 1 amendments to the original audit)

The original audit (below) is accepted in overall direction but is corrected on nine specific points
before Phase 14B implementation:

1. **Project-level authorization.** The original audit's Part 9/10 used `can_access_company` as the
   gate for a Project-level Document. This is **wrong** — re-auditing the actual schema
   (`supabase/migrations/20260815090000_projects.sql`) found that a canonical
   `public.can_access_project(target_project_id uuid)` helper **already exists**, defined once,
   never redefined, and is the exact function `projects_select`/`project_members_select` RLS already
   use as the real "may this viewer open Project P" gate. `can_access_company` is strictly broader —
   it returns true for anyone with *any* relationship to *any* Project under that Company, which
   would leak visibility across Projects within the same Company if reused here. **Corrected: every
   Project-level Document authorization check now uses `can_access_project`, not
   `can_access_company`.** Full re-audit in Part 9/B1 below.
2. **Upload lifecycle.** The original audit implied a single-step "insert a row + upload the file."
   Corrected to a locked three-step **reserve → upload → finalize** lifecycle (Part 6/B4/B7) so a row
   only becomes visible once its Storage object is confirmed to exist, and the browser never needs a
   service-role key.
3. **No "change context."** The original audit's Part 20 UX list included a "Change context" kebab
   action. **Removed.** `task_id` is immutable after creation; a Task-linked attachment can never be
   detached into broader Project-level visibility. A wrong-context file is deleted and re-uploaded.
4. **Storage delete is not a DB transaction.** The original audit's Part 14 said the DB row and
   Storage object are "deleted together, in the same step," implying atomicity. **Corrected** — they
   are two separate systems (Postgres vs. the Storage API); 14B implements **soft delete only**
   (`deleted_at`) plus **restore**, with **no automatic purge job** (that needs background-job
   infrastructure this codebase doesn't have yet). Permanent purge is explicitly deferred to a later,
   narrow, Superadmin-only workflow.
5. **Task delete dependency.** Corrected from "blocks only while `deleted_at is null`" to **blocks on
   any `documents` row referencing the Task at all, soft-deleted or not** — because a soft-deleted
   Document still physically exists and is restorable; only a *permanently purged* Document (a later,
   not-yet-built workflow) can ever let the Task become deletable.
6. **File path.** Corrected from `documents/{project_id}/{document_id}/{sanitized_original_filename}`
   to `projects/{project_id}/{document_id}.{safe_extension}` inside the `documents` bucket — dropping
   the original filename from the object key entirely (kept only as `original_filename` metadata),
   so the key depends on nothing about user input beyond a short, allowlisted extension.
7. **File validation claims.** No wording in this document claims magic-byte/cryptographic malware
   validation — 14B validates extension + declared MIME + size server-side and configures the bucket's
   own MIME/size restrictions; that boundary is stated honestly as "accepted for v1 internal-only
   usage," not as a malware scanner.
8. **Signed URL model.** Confirmed the normal authenticated Supabase client (user JWT + RLS) is
   sufficient for `createSignedUrl` against a private bucket with correct object policies — no
   service-role bypass is introduced anywhere client-reachable.
9. **Document states.** Locked `upload_state` (`pending`/`ready`) as a real column, not just a
   narrative — `pending` rows are invisible to every normal read path (list, count, download);
   Trash (`deleted_at is not null`) is a distinct, separately-queried state, never merged into the
   normal list.

## Part 1 — Existing Document/File Infrastructure

**None exists as a working feature.** Concretely:

- **A `Document` TypeScript type already exists** (`src/lib/data/types/document.ts`) — `{ id,
  companyId, taskId, noteId, fileName, storagePath, uploadedById, createdAt }`, re-exported from
  `types/index.ts`. Grepping the entire `src/` tree for any import of `Document` from that module
  found **zero usages** — no provider, no component, no hook references it. It predates the current
  Company → Project → Service → Activity → Task hierarchy (no `projectId`/`workstreamId`/
  `activityId` field at all) and is not backed by any migration, table, RLS policy, or UI. It is
  dead code — a stub sketch, never wired up. Phase 14 should not assume this shape is load-bearing;
  it can be superseded outright.
- **No `documents`/`attachments` table exists in any of the 60 migrations.** Confirmed by grep
  across `supabase/migrations/` for `document`/`attachment`/`storage`/`bucket` — the only hits were
  substring false positives (the English word "documented" inside comments).
- **No upload/download/signed-URL code exists anywhere in `src/`.** The only real "file output"
  behavior in the app is `downloadReportCsv`/`downloadClientReportCsv`
  (`src/components/reports/report-export.ts`, `src/components/client-reports/
  client-report-export.ts`): both build a CSV string **client-side, in the browser, on demand**, wrap
  it in a `Blob`, and trigger a download via a throwaway `<a download>` link + `URL.
  createObjectURL`/`revokeObjectURL`. Nothing is ever persisted server-side; there is no file to
  authorize access to — the authorization already happened when the underlying `AccomplishmentsReport`/
  `ClientReport` record was fetched.
- **Avatars/logos are explicitly "no upload" today, by product decision, already documented in the
  code itself.** `src/components/settings/profile-section.tsx` renders a disabled-in-spirit "Upload
  photo" button next to the copy: *"Photo uploads arrive with the real backend's file storage — every
  avatar in the app is initials-only for now."* `src/components/companies/company-project-avatar.tsx`
  carries the identical note for Company/Project identity avatars ("initials-only (no image upload in
  v1..."). This confirms the product has already, deliberately, been waiting on exactly the
  capability Phase 14 would build — but it is currently zero, not partially built.
- `@supabase/supabase-js` (`^2.112.3`) and `@supabase/ssr` are installed — both include a Storage
  client (`supabase.storage.from(bucket)`), so the SDK capability exists in `package.json` already;
  it is simply unused today.

## Part 2 — Supabase Storage

Read-only inspection only; nothing was created, altered, or uploaded.

1. **Is Storage currently in use?** No.
2. **Which buckets exist?** Ran `npx supabase storage ls --linked --experimental` (the CLI's own
   read-only object-listing command; `--experimental` was required only because this CLI subcommand
   is flagged experimental, not because it does anything destructive) against the live hosted
   project. Result: `{"paths":[],"message":""}` — **zero buckets exist** on hosted Supabase.
3. **Public or private?** Moot — there are none.
4. **Existing `storage.objects` policies?** None could exist meaningfully with zero buckets. I did
   not attempt to query `storage.objects`/`storage.buckets` RLS policy definitions directly (no SQL
   console/psql access is wired into this environment, and doing so would risk exceeding "read-only,
   safe tooling only"); this is the one item Part 2 asks me to flag explicitly if it can't be safely
   inspected — **stated here explicitly.** Given zero buckets exist, this is very unlikely to matter,
   but a full policy audit should be the first concrete step of 14B regardless (see Part 10).
5. **Naming conventions?** None — nothing has ever been uploaded.
6. **Represented in migrations?** No.
7. **Remote-only config missing from repo history?** No evidence of any — `supabase/config.toml`'s
   `[storage]` block is the CLI's own unmodified local-dev template (`enabled = true`, default 50MiB
   local file-size cap, the example `[storage.buckets.images]` block still commented out).
8. **Public URLs / signed URLs / service-role access?** None of these patterns appear anywhere in
   `src/`.

**Conclusion: this is a genuinely clean slate.** There is nothing to migrate, reconcile, or
deprecate — Phase 14 designs a new capability, not a fix to an existing one.

## Part 3 — Existing File-Like Product Behavior

- Client Reports and Accomplishments Reports are **structured DB records only** — `client_reports`
  stores immutable JSONB snapshots (`departments`/`history`) once finalized; nothing about a report
  is ever a file on disk or in Storage.
- Generated CSVs are **ephemeral, browser-side, on-demand** — never persisted, never given a
  `storage_path`, never re-downloadable later except by regenerating from the same live record.
- **Would Documents duplicate an existing Report artifact model? No** — there is no artifact to
  duplicate; a Report's "file" only exists for the seconds between a click and the browser's own
  download.
- **Should Client Reports appear in Documents automatically? No.** Recommend keeping the two systems
  fully decoupled in v1 (see Part 19) — Reports remain separate product records with an optional,
  independent, already-working exported-file *action* (the existing CSV download), not merged into
  a Documents table or lifecycle.

## Part 4 — Project Workspace IA Audit

Read directly from `src/app/dashboard/projects/[id]/page.tsx` (current source, not assumed):

- **Current top-level Project tabs:** `Overview`, `Tasks`, `Services`, `Team`, `History` — a simple
  underline tab bar (`flex items-center gap-1 border-b`), no horizontal-scroll wrapper on mobile
  (existing, accepted behavior, out of scope to change here).
- **Current History sub-navigation** (a pill row inside the `History` tab): `Context`,
  `Completed Work`, `Client Reports`, `Time & Team`, `Timeline`.
- **Current route:** `/dashboard/projects/[id]?tab=<key>` (tab state is a query param, deep-linkable).
- **Current mobile behavior:** the tab bar and every section inside it are already responsive
  (confirmed in the Phase 13 visual-polish pass); no separate mobile IA exists.

**Where should Documents live?** Comparing the five candidates:

- **A. First-class Project tab ("Documents")** — matches the weight of the feature (files are a
  primary, ongoing artifact of client work, not a footnote), gets its own toolbar/filters/list
  without competing for space inside an already-five-section History tab, and is trivially
  deep-linkable (`?tab=documents`) the same way every other tab already is.
- B. Section inside History — plausible (Documents *are* historical artifacts), but History today is
  specifically "what happened and when" (Completed Work, Client Reports, Timeline) — Documents is an
  active, frequently-touched *workspace*, not a read-mostly record. Cramming a search/filter/upload
  toolbar into History's existing pill-nav pattern would make History overloaded.
- C. Section inside Services — wrong default scope: many real documents (engagement letters,
  Company-wide compliance files) aren't Service-specific at all; forcing every Document under a
  Service tab would misrepresent Project-level documents as if they belonged to one Service.
- D. Separate global Documents route — breaks the Project-scoped mental model every other Task/
  Service surface already uses; would need its own Project-picker, duplicating navigation that
  already exists.
- E. Combination (Project Documents tab + Task attachments inside Full Task) — this is not actually
  an alternative to A, it's a refinement of it: Task attachments are simply Documents where
  `task_id` is set (Part 6), surfaced contextually inside the Task itself **in addition to** the
  Project-level tab, not a separate system.

**Recommendation: A + E together** — a first-class `Documents` Project tab (`TABS` gains one entry,
after `Services`, before `Team` — Documents is core client work, not an administrative afterthought)
as the canonical place to browse everything, *and* a compact attachment section inside Full Task
(Part 5) that shows/manages the subset scoped to that one Task. No `/dashboard/clients` route is
introduced — Company administration stays exactly where it is.

## Part 5 — Task Attachment UX Audit

Read directly from `task-drawer.tsx` (Quick View), `task-detail-content.tsx` +
`task-properties-rail.tsx` (Full Task), and `task-form-dialog.tsx` (Create/Edit) — all current
source, not assumed (these are the exact files rebuilt in the Phase 13 visual-polish pass):

- **Quick View** is deliberately lightweight — Header/Details-property-grid/Description/Checklist-
  count/Time/Subtasks/Footer, explicitly documented as "just enough to decide 'do I need to open
  this.'" It never reproduces Full Task's rich sections.
- **Full Task** has an established two-column shape: a main work-area column (Description,
  Checklist, Subtasks, Handoffs, Notes, Time Activity, in that order) and a compact right property
  rail (Status/Priority/Start/Due/Assignees).
- **Create/Edit Task** (the `FormDrawer`) is explicitly metadata/workflow-focused — Task/Context/
  Workflow/Checklist/Footer — and is optimized to be fast (the form's own doc comments repeatedly
  emphasize this).
- **Task Checklist/Notes/Time** each own their section inside Full Task's main column, with their own
  compact "add" affordance — an established, consistent pattern to extend.

**Recommendation: D — Quick View + Full Task, never Create/Edit.**

- **Quick View**: a compact `Attachments — 3 files` line (count only, maybe the first 1-2 filenames
  truncated) inside the existing property/section list — read-only, matching Quick View's own
  "inspector, not manager" principle. No upload control here.
- **Full Task**: a proper `Attachments` section in the main content column (after Checklist, before
  Notes — files are closer to "the work" than to "commentary about the work") with a real file list,
  an upload affordance (drag-and-drop + browse), and per-file Preview/Download/Rename/Delete via the
  same `TaskActionsMenu`-style `⋯` kebab pattern already used everywhere else.
- **Create/Edit Task stays untouched.** A Task's own creation should never wait on a file picker —
  this matches the explicit product principle stated in the instructions, and nothing in the current
  Task-creation flow suggests real demand for "attach a file while creating the Task" over "attach it
  right after, once the Task exists." Uploading requires a real `task_id` to attach to anyway (Part
  6), which a not-yet-saved Create form doesn't have.

## Part 6 — Document Information Model

**One table: `documents`.** Not two (`Document` + `FileAttachment`) — a Task Attachment is simply a
Document row where `task_id` is set; a Project Document is the same row shape with `task_id` null.
This directly mirrows the existing, already-proven `notes` table pattern (`company_id`/`task_id`,
nullable dual-parent, one table, no polymorphic `parent_type`/`parent_id` design) — see
`supabase/migrations/20260814110000_notes.sql`. Reusing that exact, already-battle-tested shape
(rather than inventing a new polymorphic schema) is the "prefer simple model" instruction applied
concretely.

Recommended v1 schema (conceptual, not a migration):

```
documents
  id                uuid primary key
  project_id        uuid not null references projects(id)         -- mandatory anchor, immutable
  task_id           uuid null   references tasks(id)               -- optional, IMMUTABLE after creation
  uploaded_by        uuid not null references profiles(id)
  original_filename  text not null      -- as the browser reported it, for display + extension inference
  storage_path       text not null unique -- server-generated, immutable, set once at reservation
  mime_type          text not null
  size_bytes         bigint not null
  display_name       text null          -- optional user-facing rename; falls back to original_filename
  description        text null
  category           text null check (category in (...))          -- only meaningful when task_id is null
  upload_state       text not null check (upload_state in ('pending','ready')) default 'pending'
  deleted_at         timestamptz null   -- soft delete / Trash (Part 14, Correction 4)
  created_at         timestamptz not null default now()
  updated_at         timestamptz not null default now()
```

`project_id` and `task_id` are both **immutable** — set once by the reservation step (Part B4) and
never updated afterward by any provider method or RPC (Correction 3: no "change context"). If
`task_id` is supplied, `project_id` is *derived* from that Task server-side, never trusted as an
independent caller input (Correction 2 — see Part 9/B1's exact enforcement).

Answers to the ten explicit questions:

1. **Which parent is mandatory?** `project_id`.
2. **Should Project be mandatory? Yes.** Every real example in the prompt (engagement letters,
   working papers, payroll/tax files, client-provided files, deliverables) is inherently
   client-work-scoped, and Project is already the canonical operational client-work workspace every
   other entity (Workstream, Task) anchors to. There is no legitimate "file with no Project at all"
   case in this product.
3. **Should Service/Activity/Task associations be optional metadata? Yes — and only Task should be a
   real FK.** Service/Activity context, when relevant, is **derived** by joining through
   `task_id → tasks.workstream_id/activity_id` — never duplicated as separate columns on
   `documents`. Duplicating them would let a Document's displayed Service/Activity drift from the
   Task's own current tagging the moment someone retags the Task (a real, avoidable inconsistency).
4. **Can one file belong to multiple Tasks? No.** v1 keeps a strict one-object-to-one-row
   relationship. If a person genuinely needs the same file attached to two Tasks, they upload it
   twice (two Storage objects, two rows) — this avoids shared-ownership deletion semantics ("if the
   file is shared, what happens when only one of its two Tasks is deleted?") for a case with no
   stated real demand yet.
5. **Should the same physical file be referenced multiple times? No**, for the same reason — no
   content-hash dedup in v1. A future phase could add it as a pure storage-cost optimization without
   touching the authorization model at all.
6. **One table or separate tables? One** (justified above).
7. **Should a Task attachment automatically appear in Project Documents? Yes, by construction, not
   by duplication** — since every row already carries `project_id` regardless of `task_id`, the
   Project Documents list is simply "all documents where `project_id = X`," which already includes
   every Task attachment in that Project. No second write, no sync job.
8. **Should a Project Document optionally link to a Task? Yes** — exactly what nullable `task_id`
   provides; a person can tag an already-uploaded Project-level Document to a specific Task later, or
   pick a Task at upload time from the Project Documents page.
9. **Should Activity ever own a file directly? No** — see point 3; Activity context is always
   derived through a linked Task, never a direct FK.
10. **Should Service ever own a file directly? No, not in v1** — the same reasoning: no example in the
    prompt actually needs "attached to this Service but no specific Task and no Project-wide scope
    either"; if a real need for a Service-level anchor emerges later, it can be added as one more
    nullable FK without disturbing the rest of the model.

Indexes: `documents(project_id)`, `documents(task_id)`, partial index on `deleted_at is null` for the
common "list active documents" query path.

## Part 7 — Storage Path Design

**Locked v1 path (Correction 6):** `projects/{project_id}/{document_id}.{safe_extension}` — inside
the one `documents` bucket. The original filename is **not** part of the object key at all (a change
from the original audit's draft, which suffixed a sanitized filename onto the path).

- `project_id` and `document_id` are immutable UUIDs — renaming the Document's `display_name`,
  renaming the Company, or renaming the Project itself never touches `storage_path` (it is
  server-generated once, at reservation time (Part B4), and never updated).
- `document_id` alone already guarantees uniqueness and prevents enumeration/collision; `project_id`
  is included as a path *prefix* purely for coarse operational convenience (bulk-listing/exporting/
  scoping a future retention workflow by Project) — it adds no authorization meaning (authorization
  is always the DB row + RLS, never the path shape itself).
- `safe_extension` is derived server-side from the validated, allowlisted file type (Part 12) — never
  copied verbatim from the user-supplied filename. This means the object key depends on nothing about
  user input except a short, closed set of extensions (`pdf`, `doc`, `docx`, `xls`, `xlsx`, `csv`,
  `txt`, `png`, `jpg`/`jpeg`).
- `original_filename` (the full, unsanitized, Unicode-safe display name) and `display_name` (an
  optional user rename) are both kept **only as metadata columns**, never as part of the Storage
  path — this is what makes rename a metadata-only operation that **never moves the Storage object**
  (Correction 6's explicit requirement).
- **Duplicate uploads/filename collisions**: impossible by construction — the path always contains the
  fresh `document_id`.
- **Unicode filenames**: fully preserved in `original_filename`/`display_name` (plain text columns);
  the Storage object's own key never contains them at all, so there is no encoding/sanitization
  concern on the path side whatsoever.
- **Moving Tasks between contexts**: not a feature (Tasks don't move between Projects, and `task_id`
  is immutable per Correction 3 regardless), so moot.
- **Project/Company rename**: no effect — nothing in the path is a human-readable name.

No repository/Supabase mechanic argues for a different format — this is a strict simplification of
the original draft (fewer moving parts in the path, not more), so no alternative is proposed.

## Part 8 — Bucket Strategy

**Recommendation: ONE private bucket** (e.g. `documents`) for all Corebridge documents — Project
Documents and Task Attachments alike (they're the same table/concept, Part 6).

- **Policy simplicity**: one bucket means one `storage.objects` policy set to write, review, and keep
  in sync with the metadata table's own RLS — multiplying buckets (per-Company or per-Project) would
  multiply policies with zero additional security benefit, since authorization is already enforced by
  a DB-row lookup, not by bucket boundaries.
- **Operational maintenance/scale**: Supabase Storage buckets don't need to be pre-sized or
  provisioned; a single bucket scales the same way a single Postgres table does. Per-Company/
  per-Project buckets would require *provisioning a new bucket on every Company/Project creation* —
  real operational complexity for zero gain.
- **Backups/lifecycle**: a lifecycle/retention job (Part 14's purge routine) can already scope by
  `project_id`/`deleted_at` inside one bucket via the path prefix (Part 7) — no need for bucket-level
  separation to achieve that.
- **Privacy boundaries**: enforced by RLS on `storage.objects` (Part 10), not by bucket choice — a
  private bucket with correct object policies is exactly as private as ten private buckets with the
  same policies, just with 1/10th the maintenance.

**The bucket must be private** — never public, never made public "for convenience." Do not create
separate Project-Documents/Task-Attachment buckets either (Part 6 already unified them into one
table; splitting the bucket would reintroduce the very duplication that decision avoided).

**Locked bucket name: `documents`.** Configured (where the Supabase Storage bucket API supports it)
with a 25MB per-file size limit and the same MIME allowlist as Part 12, as defense-in-depth alongside
the server-side reservation/finalize validation (Part B4/B7) — the bucket-level restriction is a
second, independent enforcement point, not a substitute for validating in the RPC.

## Part 9 — Access / Authorization Model

Built entirely on the canonical helpers this schema already has — no parallel role system.

| Operation | Employee | Supervisor | Superadmin |
|---|---|---|---|
| VIEW/DOWNLOAD | Legitimate Project/Task access only | Hierarchy/team-scoped only, never org-wide | Unconditional |
| UPLOAD | Within legitimate Project/Task scope | Within hierarchy/team scope | Unconditional |
| RENAME/metadata edit | Only a Document they uploaded | Hierarchy/team-scoped | Unconditional |
| DELETE | Only a Document they uploaded | Hierarchy/team-scoped | Unconditional |

- **VIEW/DOWNLOAD gate** — reuses `can_access_task(task_id)` (the existing broad, **read**-visibility
  helper — the same one `notes_select` already uses for exactly this "is this attached-to-a-Task
  thing visible" question) when `task_id is not null`; falls back to **`can_access_project(project_id)`**
  (Correction 1 — **not** `can_access_company`; see the correction log and Part B1 for the full
  re-audit of why) when the Document is Project-level only. Also requires `upload_state = 'ready'
  and deleted_at is null` — a `pending` or soft-deleted row is never visible through the normal VIEW
  path regardless of Task/Project access (Correction 9; Trash has its own separate, still-authorized
  query path for restore/manage). **Deliberately not** `can_access_task_directly` for VIEW — that
  helper is this codebase's own documented **mutation**-authorization gate (freshly hardened this
  session for exactly this reason); reusing it for VIEW would silently under-grant read access
  relative to what the same viewer can already see on the Task itself elsewhere in the app (Quick
  View, Full Task, Notes).
- **UPLOAD gate** — the same Task/Project access check, plus `uploaded_by = auth.uid()` on insert —
  mirrors `notes_insert`'s `author_id = auth.uid()` pattern exactly. Anyone who can already see the
  Task/Project may add a file to it, matching "Employee can upload within legitimate Project/Task
  scope." (The reservation step, Part B4, is where this is actually enforced end to end — see
  Correction 2's Task/Project consistency rule.)
- **RENAME/DELETE gate** — modeled directly on this session's own just-completed `can_edit_task`/
  `canDeleteTask` hardening: Superadmin unconditional; Supervisor via `can_access_task_directly`
  (when `task_id` is set) or a hierarchy-scoped `can_access_project`-based check (when it isn't);
  Employee only when `uploaded_by = auth.uid()` **and** they still legitimately have Task/Project
  access — an uploader who has since lost all access to the Task/Project (e.g. reassigned) does
  **not** retain management rights merely because they uploaded it once. Mirrors the Employee
  "self-added creator" Task-edit rule exactly. **Recommended answer to the explicit Employee-delete
  question: only files they uploaded themselves** — the safest default for an accounting-services
  product, fully consistent with the precedent this session just hardened for Tasks.

### Document visibility question — locked

**A Task-linked Document must never be visible to someone who has Project access but not access to
that specific Task.** Default principle confirmed: **NO**, general Project access does not imply
Task-linked Document access. This falls directly out of the VIEW gate above: when `task_id` is set,
the gate is `can_access_task(task_id)`, not `can_access_project`/generic Project membership — a
Supervisor with no legitimate relationship to that particular Task (per this session's own freshly-
hardened Supervisor scope) sees neither the Task nor its attachments, even if they can otherwise open
that same Project and browse its other, Project-level Documents. A pure Project-level Document
(`task_id is null`) uses the narrower-than-Company `can_access_project` gate (Correction 1), which is
correct — it was never Task-scoped to begin with, but it must also never be broader than genuine
Project membership.

## Part 10 — Database RLS vs Storage RLS

Both layers are required; neither substitutes for the other; the UI never becomes an authorization
boundary.

**Layer 1 — `public.documents` RLS.** A `documents_select`/`documents_insert`/`documents_update`/
`documents_delete` policy set, structured exactly like `notes`' own policies, but built on top of one
new **single source of truth** helper:

```sql
create or replace function public.can_access_document(target_document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.documents d
      where d.id = target_document_id
        and d.upload_state = 'ready' and d.deleted_at is null
        and (
          (d.task_id is not null and public.can_access_task(d.task_id))
          or (d.task_id is null and public.can_access_project(d.project_id))
        )
    );
$$;
```

(Corrected from the original draft's `can_access_company` to `can_access_project` — Correction 1 —
and now also gates on `upload_state`/`deleted_at` — Correction 9.) `documents_select` calls
`can_access_document(id)` directly. Mutation policies (`update`/`delete`) compose a second, narrower
helper (`can_edit_document`, mirroring `can_edit_task`'s exact shape — Superadmin OR Supervisor-via-
`can_access_task_directly`/hierarchy-`can_access_project`-check OR `uploaded_by = auth.uid()` with a
live access re-check). A separate, explicitly-authorized path (not the normal `can_access_document`)
is used for Trash listing/restore, since that must remain reachable by the same manage-authorized
viewer even though the row fails the normal `upload_state`/`deleted_at` gate (Part B3).

**Layer 2 — `storage.objects` RLS.** A policy on `storage.objects` for the `documents` bucket that
looks up the matching `public.documents` row **by `storage_path = storage.objects.name`** and calls
the *exact same* `can_access_document`/`can_edit_document` functions — never a second, independently
written check. This is the concrete answer to "do not rely on the UI hiding the file, or only one of
the two layers": even a request that goes straight at the Storage REST API (bypassing the app
entirely) is still gated by a real Postgres RLS policy on `storage.objects`, and that policy can never
silently drift out of sync with the metadata table's own rule, because both call the same function.

**Recursion safety.** `can_access_document` → `can_access_task` / `can_access_project` → already-
proven leaf helpers (`is_superadmin`, `manages_user`, base tables — `can_access_project` itself calls
only `is_superadmin`/`manages_user`, never `can_access_document` or anything downstream of it) —
a clean DAG, no path back into `documents` or `can_access_document` itself. Same tracing discipline
this session already applied to the Supervisor Task-mutation hardening; no new recursion risk
introduced.

## Part 11 — Signed URL / Download Model

**Recommendation: short-lived signed URLs, minted just-in-time, server-side-authorized — never a
permanently public URL, and no need for a custom authenticated-proxy server given Supabase Storage's
own signed-URL mechanism already provides time-boxed, unforgeable access.**

- The signed-URL-minting call itself (an RPC or a thin server action) must re-check
  `can_access_document`/`can_edit_document` (as relevant) **before** calling
  `storage.createSignedUrl` — the mint step is the real enforcement point for that specific request;
  the Storage object policy (Part 10) is defense-in-depth if a URL is ever generated through another
  path.
- **Recommended expiration: 300 seconds (5 minutes)**, uniformly for both preview and download links.
  Long enough for a normal click-to-open/download to complete (including a slow connection or a large
  file), short enough that a leaked/forwarded/logged URL stops working almost immediately. No
  permanent or long-lived link is generated in v1; there is no "share externally" feature (Part 27).
- Caching: signed URLs should not be cached client-side beyond the single interaction that requested
  them — request a fresh one on every Preview/Download click rather than storing one on the Document
  row. Never persisted on the `documents` row itself.
- **No service-role credential in browser code (Correction 8).** The normal authenticated Supabase
  client (the user's own JWT, subject to `storage.objects` RLS, Part 10) is sufficient to call
  `createSignedUrl` against a private bucket with correct object policies — Supabase Storage's signed-
  URL minting itself still respects the caller's RLS-scoped access. No server/service-role proxy is
  introduced for this in 14B.

## Part 12 — File Types and Limits

**Allowlist, not denylist** — client-side MIME/extension checks are a UX nicety only; the
authoritative check must happen server-side (validated in the same RPC/edge function that accepts the
upload, checking both the declared MIME type and a magic-byte/content sniff where practical — a
browser-supplied `Content-Type` header is not trustworthy on its own, exactly per the instruction).

- **v1 allowlist**: PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, PNG, JPG/JPEG.
- **Explicitly excluded from v1**: ZIP (can smuggle arbitrary content past type validation entirely),
  SVG (can embed executable script, a real XSS vector if ever rendered inline), HTML/HTM (executable
  in a browser), macro-enabled Office formats (DOCM/XLSM — capable of running code), and of course
  EXE/JS/BAT/CMD/PS1 (blocked both by not appearing on the allowlist and, as defense-in-depth, by an
  explicit denylist check checked in the same reservation step).
- **No claim of magic-byte/cryptographic content validation (Correction 7).** 14B validates the
  declared extension, the declared MIME type, and their mutual agreement, server-side, plus the
  bucket's own MIME/size restriction as a second layer — it does **not** sniff file contents at the
  byte level. This is stated here honestly as the v1 boundary, not oversold as malware-proof (Part 13).
- **Max size: 25MB per file** — generous for scanned schedules/PDFs, comfortably under the Storage
  project's own 50MiB default ceiling, leaving headroom for a future limit change without touching
  infrastructure.
- **Multiple-file upload: yes** — genuinely useful (batching several scanned pages/schedules), kept
  simple: independent per-file uploads through one drag-and-drop zone, not a single multi-file
  transaction.
- **Drag-and-drop: yes** — standard, low-risk, expected UX; pairs with a plain "Browse files" button
  for the same drop zone.

## Part 13 — Malware / File Safety

- **Does Supabase automatically scan for malware? No** — Supabase Storage is a thin, S3-compatible
  object store; it performs no content/antivirus scanning of any kind.
- **Residual risk without scanning**: a malicious file could sit in Storage undetected; the realistic
  exposure is limited, though, since Corebridge never executes an uploaded file server-side — the only
  execution risk is a staff member downloading and manually opening it on their own machine, the same
  risk profile as any email attachment.
- **Required for v1**: enforce the type allowlist (Part 12) strictly — this is the mitigation that
  actually matters (it removes the formats capable of executing anything in the first place).
- **Recommended later, not required now**: external malware-scanning integration (e.g. on-upload
  scan-before-store) — worth adding only if/when a client-facing upload surface is ever introduced
  (Part 27 keeps that out of scope entirely for now).
- **Unnecessary for v1**: a generic "only open trusted files" UI warning — internal-only staff usage
  with an enforced allowlist makes this noise rather than a real safeguard.

## Part 14 — Delete / Retention Semantics

**Recommendation: soft delete (Trash) ONLY in 14B — not immediate hard delete, and explicitly NOT an
atomic DB+Storage delete (Correction 4).** A single nullable `deleted_at` timestamp on `documents`,
not a separate Trash table and not full version history. This matches the product's own
already-established caution around losing financial/evidence records (the exact reason `delete_task`
currently blocks on logged TimeEntries/Notes/Subtasks).

- **Storage objects and DB rows are never claimed to be deleted "together, atomically."** They are
  two independent systems — Postgres (the `documents` row) and the Supabase Storage API (the physical
  object) — and no single transaction spans both. 14B's `deleteDocument` sets `deleted_at` only; the
  physical Storage object is left untouched. A "deleted" Document disappears from every normal
  list/filter/count/download path but remains physically present and fully **restorable**
  (`restoreDocument` clears `deleted_at`, same authorization as edit/delete) via a distinct Trash
  query path.
- **No automatic purge job in 14B (Correction 4).** A background 30-day retention purge would need
  background-job infrastructure this codebase does not have yet — building one prematurely, just for
  this, would be exactly the kind of speculative infrastructure this project's own principles warn
  against. 30 days remains the *intended future* retention policy, recorded here for the record, but
  no scheduled/automatic deletion exists in 14B. Permanent purge is deferred to a later, narrowly
  designed **Superadmin-only** workflow (a real UI/RPC explicitly built for it, not built silently as
  a side effect of 14B) — until that exists, a soft-deleted Document simply stays in Trash
  indefinitely, taking Storage space but posing no security or data-loss risk.
- **Task deletion relationship — attachments BLOCK Task deletion, including Trash (Correction 5).**
  Corrected from "blocks only while `deleted_at is null`" — since a soft-deleted Document still
  physically exists and is restorable, `delete_task` must block whenever **any** `documents` row
  references the Task **at all**, regardless of `deleted_at`:
  `exists (select 1 from public.documents where task_id = p_task_id)`. A Task only becomes
  hard-deletable once every one of its Documents has gone through the future permanent-purge
  workflow (which does not exist in 14B) — this is a stricter, safer rule than the original audit's
  draft. This requires a small, forward-only follow-up migration (`delete_task.sql` itself,
  `20260828100000`, is never edited again — Correction 5's own explicit instruction, matching this
  session's established "forward-only" rule) that re-`create`s `delete_task` with the one added
  check, preserving every other accepted behavior (auth check, `SECURITY DEFINER`, `search_path=''`,
  the `FOR UPDATE` lock, the TimeEntry/Note/Subtask blockers, grants/revokes). **Do not** auto-convert
  a Task's attachments into plain Project Documents on Task deletion — blocking with a clear,
  truthful message ("remove/permanently purge Task attachments first") is simpler and safer than an
  implicit mutation, and matches the fact that no permanent-purge UI exists yet to actually act on
  that message today (a known, accepted rough edge — not misleading, since the message describes a
  real future capability, not a button that doesn't work).
- **Project archival**: Documents are unaffected either way — archival is a visibility/status concern
  on the Project, not a deletion trigger; Documents keep exactly the access rules already tied to
  their Project/Task.
- **Company archival/deletion**: not a real feature today (Companies are the permanent internal
  master, never deleted) — moot for v1.

## Part 15 — Document Versioning

**Recommendation: Option A — no versioning, upload separate files** (e.g. "VAT Return", "VAT Return
revised", "VAT Return final" as three independent Document rows). Simplest option, avoids
replace-semantics complexity (stale signed URLs, what happens to the old object, audit-trail
ambiguity about "which version did the client actually receive"). Defer real versioning
(explicit supersede-links or full history) to a later phase only if real business demand for it
appears — nothing in the stated use cases requires it today.

## Part 16 — Document Categories / Folders

**No physical folder hierarchy** — explicitly avoiding a "Windows Explorer clone." Recommended v1
organization for the Project Documents page: a filter bar, not a folder tree —

`All` · `Service` (derived via linked Task) · `Activity` (derived) · `Task` · `Uploaded By` ·
`File Type` · `Date`

plus one small, optional `category` field (free-choice from a short fixed list — e.g. Engagement
Letter, Working Paper, Client-Provided, Deliverable, Compliance, Other) that only matters for
Project-level Documents (a Task-linked Document already has richer, derived Service/Activity/Task
context and doesn't need a separate category to be findable).

## Part 17 — Search

**v1 search scope: `original_filename`, `display_name`, `description`** — a simple `ilike`/basic
text search across those three columns. No document-content search, no OCR — no infrastructure for
either exists, and none should be promised in Phase 14.

## Part 18 — Preview

- **PDF**: browser-native inline preview (`<embed>`/`<iframe>` against a signed URL) — every modern
  browser already renders PDFs natively.
- **Images (PNG/JPG)**: inline `<img>` preview.
- **Plain text (TXT/CSV)**: simple inline text preview.
- **DOC/DOCX/XLS/XLSX**: download only in v1 — no embedding of Google Docs Viewer or Microsoft Office
  Online, which would mean sending a client's accounting file's URL to a third-party service. That is
  a real, avoidable privacy exposure for this product category and is explicitly not worth it for a
  preview convenience.

## Part 19 — Client Report Relationship

Client Reports stay exactly where they are — **History → Client Reports**, their own table, their
own already-locked Draft/Finalized lifecycle, completely decoupled from `documents`. A finalized
Client Report's immutability is untouched because there is no FK, no shared table, and no code path
by which a `documents` row could reference or alter a `client_reports` row. Recommend **not**
auto-registering the existing CSV export as a Document in v1 either — keep the two systems fully
independent until (if ever) a real user need for that specific bridge appears.

## Part 20 — UX Recommendation

Following the exact Phase 13 visual language (compact, whitespace over cards, one action-menu
position, consistent Dialog/Drawer families, light/dark, responsive):

**Project Documents tab.** Header ("Documents" / "All client-work files for this Project"). Toolbar:
search input, Service filter, Activity filter, File-type filter, an "Upload" button (opens a compact
Dialog — not a `FormDrawer`; this is a lightweight action, matching `CreateActivityDialog`'s own
established "small operations get a small Dialog" precedent). Default view: **list** (matching
`TaskListRow`'s own dense-row precedent), columns: Name (with type icon) · Context ("Accounting · VAT"
or "Task: Prepare VAT Return" when Task-linked, else just the `category` when set) · Uploaded by ·
Date · Size · Actions (a `⋯` kebab: Preview / Download / Rename / Delete — **no "Change context"
action**, per Correction 3; `project_id`/`task_id` are immutable, so a wrong-context file is deleted
and re-uploaded rather than moved — reusing the exact `TaskActionsMenu` shape, including this
session's own `ReservedActionSlot` fix so rows stay aligned regardless of per-row permission). A
14C-only concern (no UI exists yet in 14B).

**Task attachments.** Quick View: a single compact "Attachments — N files" line. Full Task: a real
`Attachments` section (drag-and-drop + Browse, file list with the same kebab actions, inline
Preview/Download).

**Upload UX**: a drop zone plus "Browse files" button; per-file rows during upload showing filename,
size, and a simple progress/success/failure state — no large upload "card," just a compact list that
collapses once done.

## Part 21 — Provider Architecture

New `DocumentsProvider` interface, matching the existing `tasks-provider.ts`/`notes-provider.ts`
shape exactly:

```ts
interface DocumentsProvider {
  listProjectDocuments(user: User, projectId: string, filters?: DocumentFilters): Promise<Document[]>;
  listTaskAttachments(user: User, taskId: string): Promise<Document[]>;
  getDocumentDownloadUrl(user: User, documentId: string): Promise<string>; // mints a fresh signed URL
  // uploadDocument orchestrates the full reserve -> browser upload -> finalize lifecycle (Part B4/B7)
  // behind one call — callers never see the three steps individually.
  uploadDocument(user: User, input: UploadDocumentInput): Promise<Document>;
  updateDocumentMetadata(user: User, documentId: string, input: UpdateDocumentInput): Promise<Document>;
  deleteDocument(user: User, documentId: string): Promise<void>; // soft delete only
  restoreDocument(user: User, documentId: string): Promise<Document>; // clears deleted_at
}
```

This is the Phase 14B deliverable itself (Part B10) — no UI consumes it yet; 14C/14D build the
Project Documents tab and Task Attachments section against this exact interface.

`mock-documents-provider.ts` and `supabase-documents-provider.ts` implement it, matching every other
domain's mock/supabase pair. Raw Storage calls live **only** inside
`supabase-documents-provider.ts` — no UI component ever imports `supabase.storage` directly. No
separate generic `StorageProvider` abstraction in v1 — Documents is the only Storage consumer today;
introducing a generic layer now would be premature (Part 9's "avoid premature generic schemas"
principle applies equally to code architecture).

## Part 22 — Mock Mode

Metadata-only fake Documents, seeded like every other mock entity (a new `seed-documents.ts`
referencing existing seeded Projects/Tasks). `getDocumentDownloadUrl` in mock mode returns a fixed,
bundled sample asset (no real Storage call). A simulated "upload" fabricates a new in-memory row
after a short artificial delay and returns success — no real bytes are ever written to disk merely to
demo mock mode.

## Part 23 — Performance

- Paginate the Documents list once a Project's file count grows past roughly 50 rows (simple
  `limit`/`offset` is sufficient for v1 — no need for keyset pagination at this scale).
- **Never pre-generate signed URLs for a whole list** — mint one only when a specific Preview/
  Download is clicked (Part 11).
- Quick View's attachment count should be a cheap `count(*)` (or piggybacked on data the Task query
  already joins), never a full file-list-plus-signed-URL fetch just to show a number.

## Part 24 — Timeline / Audit

**Deferred to a later slice (14E), not built in 14B–14D.** Document upload/delete events *could*
reuse the exact same "aggregate from already-fetched data, sort by real timestamp, group by local
day" pattern the Timeline already uses for Task/Report/Note/Service events — so this is a deliberate
scoping choice to keep each slice small, not a sign of real difficulty. No generic audit table is
introduced for this or any other reason.

## Part 25 — Security Threat Model

| # | Risk | v1 Mitigation |
|---|---|---|
| 1 | Unauthorized user guesses an object path | Path uses immutable, unguessable UUIDs (Part 7); `storage.objects` RLS (Part 10) still blocks direct access even if a path were guessed correctly |
| 2 | Signed URL leaks (forwarded, logged, cached) | 300-second expiration (Part 11); no permanent/public URLs ever generated |
| 3 | Supervisor tries an unrelated Project/Task's file | `can_access_task`/`can_access_project` gate (Part 9, Correction 1) — identical scope already enforced for Tasks/Projects themselves, no broader |
| 4 | Employee attempts to delete another user's file | Delete gate requires `uploaded_by = auth.uid()` for Employee (Part 9) |
| 5 | Malicious filename (path traversal, control characters) | `storage_path` is server-generated from immutable IDs, never from user input directly (Part 7); `original_filename` is display-only, never interpreted as a path |
| 6 | Executable upload | Blocked by the type allowlist (Part 12) |
| 7 | Oversized file | 25MB server-enforced limit (Part 12) |
| 8 | MIME spoofing (fake `Content-Type`) | Server-side validation, not client-declared MIME alone (Part 12) |
| 9 | Task attachment becomes visible through the Project file list | The Project Documents list still evaluates `can_access_document` per row — a Task-linked row stays gated by `can_access_task`, never demoted to plain Project-level visibility just because it's listed alongside Project-level rows (Part 9/10) |
| 10 | Orphaned Storage object (row soft-deleted, object remains) | Expected and accepted in 14B — soft delete never touches the object; the object is only ever truly orphaned once a future permanent-purge workflow removes the row, and that workflow is scoped to remove both together (Part 14, Correction 4) |
| 11 | DB row deleted but object remains | Not possible in 14B — 14B never hard-deletes a row at all (soft delete only) |
| 12 | Object deleted but DB row remains | Not possible in 14B — no code path in 14B calls Storage delete on an active object at all (Part B6/B8) |
| 13 | Duplicate upload | No collision possible — every path includes a fresh `document_id` (Part 7) |
| 14 | Project archived | Documents keep their existing access rules unchanged (Part 14) — archival isn't a deletion trigger |
| 15 | User deactivated | Falls out of existing `is_supervisor`/`is_superadmin`/`manages_user`/profile-active checks the same way it already does for Task access today — no new mechanism needed |

## Part 26 — Recommended Phase 14 Slices

- **14B — Storage + Metadata Security Foundation.** Schema: `documents` table (with `upload_state`),
  RLS (`can_access_document`/`can_edit_document`, built on `can_access_project`/`can_access_task`),
  the `documents` Storage bucket + object policies, `reserve_document_upload`/
  `finalize_document_upload`/`cancel_document_upload` RPCs, a forward-only follow-up migration adding
  the attachment-blocks-delete check (including Trash) to `delete_task`'s dependency list. Provider:
  `documents-provider.ts` + mock/supabase implementations orchestrating the reserve/upload/finalize
  lifecycle, no UI beyond a minimal internal smoke-test path. Security: full mock-mode probe suite
  (visibility/upload/rename/delete/restore across all three roles, Task-linked vs. Project-level,
  pending/ready/Trash states, cross-Project mismatch rejection). Migration risk: low-medium (new
  table + new Storage policies + new RPCs + one small edit to an RPC's dependency list, not its
  authorization). Manual acceptance: security-probe results reviewed before any hosted apply, same
  discipline as every prior Phase 13 migration.
- **14C — Project Documents Workspace.** UI: the new `Documents` Project tab, list/filters/search/
  upload/rename/delete, using the provider from 14B. No schema change. Security: re-confirm RLS/UI
  parity (no "UI hides it" reliance). Manual acceptance: visual + functional walkthrough across roles.
- **14D — Task Attachments.** UI: Quick View count line, Full Task Attachments section. No schema
  change (same `documents` table, `task_id` set). Manual acceptance: attachment/Task-deletion
  interaction (blocked correctly), visibility boundary re-verified.
- **14E — Preview / Search / Polish / Timeline (if justified).** Inline preview components (PDF/
  image/text), search wiring, mobile/dark final pass, and — only if still wanted after 14B–14D ship —
  Timeline integration for upload/delete events. Manual acceptance: final visual acceptance, matching
  the Phase 13 final-visual-polish precedent.

## Part 27 — Out of Scope / Deferred

| Item | Classification |
|---|---|
| Client portal document upload | **Rejected for now** — clients don't log in; a locked product decision |
| External share links | Deferred |
| Document approval workflow | Deferred/rejected — would duplicate Client Report's own review lifecycle with no stated need |
| E-signatures | Rejected — a different product category entirely |
| OCR | Deferred |
| Full-text search inside PDFs | Deferred |
| AI document analysis | Deferred |
| Automatic document classification | Deferred |
| Malware scanning service integration | Deferred (Part 13) |
| Version history | Deferred (Part 15) |
| Folder hierarchy | Rejected — explicitly avoiding an Explorer clone |
| Comments on Documents | Deferred — Notes already exist at Task/Company level |
| Office-style collaborative editing | Rejected — out of category for this product |
| Google Drive / OneDrive / SharePoint / Dropbox sync | Rejected — major scope/security expansion with no stated need |

## Part 28 — Phase 14 vs. Alternatives

Compared against batch Task creation, bulk Task operations, workflow automation, recurring-work
improvements, and Notifications:

- **Business value**: Documents addresses a capability gap that is currently exactly zero (Part 1/2)
  in a product whose entire vertical (accounting/tax/payroll services) is inherently document-heavy —
  engagement letters, working papers, and tax files are core deliverables, not a nice-to-have.
- **Employee daily usefulness**: high — staff already handle client files outside the app today (by
  necessity); bringing that into Corebridge removes a real, current workaround.
- **Architectural readiness**: high — the hierarchy, RLS helper set, provider pattern, and UI
  primitives (FormDrawer/Dialog/ActionsMenu/List row) this feature needs already exist and are
  proven; nothing about Documents requires new architecture, only new application of existing
  patterns.
- **Risk**: moderate but well-understood — file storage/authorization is a known, solvable problem
  with an established two-layer RLS answer (Part 10), not a novel or speculative design.
  Notifications or workflow automation would each introduce genuinely new architectural questions
  (delivery channels, background job infrastructure) this codebase hasn't solved yet.
  Batch/bulk Task operations are lower-risk but also lower business-differentiation.
- **Demo value**: high — "upload the engagement letter, see it attached to the right client's Project"
  is immediately legible to a prospective client of Corebridge X itself.
  Notifications' demo value is comparatively invisible without a live audience over time.
- **Dependency on future features**: low — Documents doesn't block or get blocked by Notifications,
  automation, or bulk operations; any of those could still be built next regardless.

**Should Phase 14 be Documents & Client File Management? Yes.**

## Deferred

See Part 27 — the full classification table above stands as the answer for this section.

## Risks / Open Questions

- Direct SQL inspection of `storage.objects`/`storage.buckets` policy state was not performed in this
  audit (no safe SQL-console tool was available); confirmed instead via the CLI's own read-only
  bucket listing that zero buckets exist, which makes this a non-issue today but is re-verified as the
  literal first step of Phase 14B before any policy is written (Part B1).
- **Resolved by Correction 1**: the original audit's Project-level gate (`can_access_company`) was
  coarser than intended and has been replaced with the already-existing, already-correctly-scoped
  `can_access_project` helper — no remaining open question on this point.
- The 25MB size limit and 300-second signed-URL lifetime are reasonable defaults, not hard
  architectural constraints, and are now locked for 14B. The 30-day Trash retention window remains an
  **intended future** number only — no purge job of any kind exists in 14B (Correction 4), so this
  number has no immediate implementation consequence yet; it should be confirmed against real
  business expectations only once the later permanent-purge workflow is actually designed.

## Git

- Source files changed: **No.**
- Migrations created: **No.**
- Packages changed: **No.**
- Committed: **No.**
- Pushed: **No.**
