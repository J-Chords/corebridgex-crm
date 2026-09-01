# Phase 14B — Storage + Metadata Security Foundation

**Status: FINAL SECURITY ACCEPTED / COMPLETE.** Reviewed and accepted in full. No Phase 14C
(Project Documents UI) or 14D (Task Attachments UI) work is included — this document covers the
security/storage foundation only. Built on top of the Phase 14A architecture lock
(`docs/phase-14a-documents-architecture-audit.md`) — see that document for the full audit/design;
this document records what was actually implemented against it, including the two hotfix sections
below (foundation contract + Storage auth, then direct Task authority + reservation ownership), each
correcting defects found on re-review before final acceptance.

## Final accepted migration set

Four migrations, all hosted, all local == remote, zero pending:

1. `supabase/migrations/20260831090000_documents_foundation.sql` — the `documents` table, RLS,
   Storage bucket + object policies, `reserve_document_upload`/`finalize_document_upload`/
   `cancel_document_upload`/`update_document_metadata`/`soft_delete_document`/`restore_document`.
2. `supabase/migrations/20260831100000_task_delete_documents_blocker.sql` — extends `delete_task`
   (forward-only; the already-hosted `20260828100000_delete_task.sql` is never edited) to also block
   on any Document referencing the Task, including Trash.
3. `supabase/migrations/20260901090000_documents_foundation_contract_hotfix.sql` — initial metadata
   moved into `reserve_document_upload` itself (no post-finalize metadata dependency); Storage
   INSERT/pending-SELECT/pending-DELETE re-check current authorization.
4. `supabase/migrations/20260901100000_documents_direct_task_authority_hotfix.sql` — Task-linked
   mutation paths (upload, ready-Document management, pending-reservation lifecycle) corrected to
   require `can_access_task_directly` instead of the broader `can_access_task`; new
   `can_manage_pending_document_row` helper removes any Supervisor-of-uploader branch from pending
   lifecycle actions.

## Known deferred functional test (not a Phase 14B security blocker)

Phase 14B's security architecture and every policy/RPC definition are accepted, but no real
authenticated binary Storage round-trip has yet been manually proven through product UI, since no
Documents UI exists yet (14C/14D haven't started). **The first Documents UI implementation (Phase
14C) must include a mandatory end-to-end hosted acceptance test**: authenticated user → reserve →
upload a harmless allowed file → finalize → list → signed download → soft delete → confirm normal
download is denied → restore → confirm download succeeds again — with complete cleanup of any test
object created. This is a Phase 14C functional-acceptance requirement, not a reason to reopen Phase
14B.

## Locked Task-authority distinction (read this first)

This schema has always distinguished, for Tasks themselves, **READ/hierarchy visibility**
(`can_access_task`/`canAccessTask` — may include one-hop parent/child Subtask visibility) from
**direct operational authority** (`can_access_task_directly`/`canAccessTaskDirectly` — introduced
specifically for mutations/side effects, zero hierarchy branches). Documents now follows the exact
same split:

- **Task-linked Document VIEW/DOWNLOAD** → `can_access_task` (broad). A hierarchy-visible Task's
  attachments stay readable exactly like its other content (Notes, Task detail) already is — this is
  intentional, not a residual gap.
- **Task-linked Document UPLOAD / metadata edit / soft-delete / restore / pending-reservation
  management** → `can_access_task_directly` (direct). Historical one-hop Subtask hierarchy
  visibility is a READ-only relationship by original design and must never become mutation
  authority — an Employee/Supervisor who can only see a Task through that hierarchy relationship
  (not a real assignee/managed-assignee relationship) must never be able to upload, rename, delete,
  or restore its attachments.

## Hotfix — foundation contract + Storage auth (forward-only, `20260901090000`)

Re-audited the actual current hosted contract (not the write-up above) via read-only introspection
(`pg_get_function_identity_arguments`, `pg_policies`) before touching anything. Neither already-
hosted Phase 14B migration (`20260831090000_documents_foundation.sql`,
`20260831100000_task_delete_documents_blocker.sql`) was edited — both remain byte-for-byte as
applied. Confirmed facts, before any fix:

- **Category/TypeScript contract**: hosted `update_document_metadata` already had the correct
  4-arg signature (`p_document_id, p_display_name, p_description, p_category`); `UpdateDocumentInput`
  already carried `category`; the mock provider already supported it. **No mismatch existed** —
  this part of the original write-up's own defect list was not actually present in current source.
- **Post-finalize metadata gap** — **confirmed present**. The Supabase provider's `uploadDocument`
  called `reserve → upload → finalize → (conditionally) update_document_metadata`, so a successful
  `finalize` could still be followed by a metadata-write failure, leaving a `ready` Document whose
  initial display name/description/category never landed.
- **Storage INSERT / pending SELECT / pending DELETE stale-access gaps** — **confirmed present** in
  all three policies (`documents_objects_insert`, `documents_select_own_pending`,
  `documents_objects_delete_own_pending`): each checked only "a matching pending row exists, owned
  by `auth.uid()`," with no re-verification that the uploader still genuinely manages the underlying
  Task/Project at the moment of use.

### Category semantics (locked)

Category is **not** security context — it never changes `project_id`/`task_id`/Service/Activity/
Task visibility, both remain immutable exactly as before. It is Project-Document organization
metadata only. A Task-linked Document's category is permanently `null` (enforced twice: the
already-hosted `documents_category_only_when_project_level` table constraint, and now also an
explicit reject at `reserve_document_upload`'s own public contract boundary — never silently
discarded). A Project-level Document's category may be edited later via `update_document_metadata`,
validated against the same fixed allowlist.

### Corrected upload lifecycle

Initial metadata (`display_name`/`description`/`category`) now travels with the **reservation**
itself — `reserve_document_upload` gained three new parameters and now writes them into the same
`insert` that creates the `pending` row. `finalize_document_upload` is unchanged and remains the
final step: a successful finalize means the complete initial Document is ready, with no metadata
mutation required afterward for a normal upload to succeed. The old 5-arg `reserve_document_upload`
overload was dropped outright (confirmed via `pg_depend` that nothing else in the schema referenced
it) rather than left stale — exactly one signature is reachable now.

### Storage/RLS re-checks

All three flagged policies now additionally compose `public.can_manage_document_row(uploaded_by,
task_id, project_id)` — the same single source of truth already used everywhere else:
- `documents_objects_insert` (Storage INSERT) — an Employee who reserves an upload and then loses
  Project/Task access before the browser's own upload call fires can no longer write the object.
- `documents_select_own_pending` (metadata SELECT) — a reservation stops surfacing through normal
  authenticated queries the instant its uploader loses the access they had when they reserved it —
  not merely stops being actionable. Deliberately not widened into a general "Superadmin sees all
  pending rows" rule — no admin cleanup UI exists yet to consume that; `can_manage_document_row`'s
  own `is_superadmin()` branch already lets a Superadmin see/manage their own pending reservations
  through this same policy, and broader administrative visibility is left an explicitly deferred,
  narrowly-designed future addition.
- `documents_objects_delete_own_pending` (Storage DELETE) — same re-check added to the ordinary-
  uploader branch; the Superadmin-unconditional branch is unchanged (a deliberate, narrow
  administrative-cleanup capability, not widened to active/ready object deletion for anyone).

### Mock provider parity

`mock-documents-provider.ts`'s `uploadDocument` now explicitly rejects (never silently discards) a
non-null `category` on a Task-scoped upload, matching the hosted RPC's own new behavior at the same
public contract boundary.

### Probes (30/30 passed, zero leftovers)

Re-ran the original 23 probes (all still passing) plus 15 new hotfix probes:
- **S1–S4**: Project-level category persists on upload and on later update by its own uploader;
  a Task-scoped upload with a category is rejected outright; a Task Attachment's category can never
  be updated.
- **S5–S7**: the shared `canManageDocument` permission logic (the exact boolean condition the hosted
  policies now also check) correctly denies management the moment Project or Task context is lost,
  and correctly denies an unrelated user from ever managing another user's reservation. (Mock mode
  has no separate reserve-only API surface — `uploadDocument` is atomic — so these are verified at
  the shared permission-logic level that both the mock provider and the hosted RLS composition are
  built from, rather than through a provider method that doesn't exist.)
- **S8**: `project_id`/`task_id` immutability remains a compile-time guarantee (no mutating API
  surface exists for either) — not runtime-probed.
- **S9–S15**: correspond to the re-run pending/ready/Trash-visibility, Supervisor/Superadmin-scope,
  and Task-delete-blocker checks (K/L/M/G–I/J/Q/R) above — all still passing unchanged.

### Hosted verification

No live hosted Storage object was created (not needed — the RLS/RPC logic itself was verified via
read-only SQL introspection plus the mock-mode probe suite, matching the same evidentiary standard
already accepted for the original 14B pass). Read back **after** apply, not merely assumed from a
successful migration:
- `reserve_document_upload`: exactly one signature — `p_project_id uuid, p_task_id uuid,
  p_original_filename text, p_mime_type text, p_size_bytes bigint, p_display_name text,
  p_description text, p_category text`.
- `update_document_metadata`, `finalize_document_upload`, `cancel_document_upload`: unchanged, one
  signature each, grants unchanged (`authenticated`/`service_role`/owner only — no `anon`/`public`).
- `documents_objects_insert`/`documents_select_own_pending`/`documents_objects_delete_own_pending`:
  read back with their new `can_manage_document_row(...)` clauses live in the actual policy
  definitions on the hosted database.

Migration: `supabase/migrations/20260901090000_documents_foundation_contract_hotfix.sql` — new,
forward-only, applied to hosted Supabase.

## Hotfix — direct Task authority + reservation ownership (forward-only, `20260901100000`)

Re-confirmed from **current live source** (`pg_get_functiondef`, not assumed) before writing this
file: `can_access_task` is still the broad READ/hierarchy helper (its two one-hop parent/child
Subtask branches intact, unchanged); `can_access_task_directly` still delegates to
`can_user_access_task(auth.uid(), target_task_id)` with zero hierarchy branches, unchanged. **Neither
Task helper was touched by this migration.**

Three confirmed defects, all involving Documents composing the wrong one of the two Task helpers:

- **Defect A — Task attachment upload used READ authority.** `reserve_document_upload`'s Task-linked
  branch called `can_access_task`, but uploading is itself a mutation/side effect on the Task. Fixed:
  now requires `can_access_task_directly`. Project-level reservation (`can_access_project`)
  unchanged.
- **Defect B — Employee Document management used READ authority.** `can_manage_document_row`'s
  Employee-own-upload branch composed `can_access_task` for its Task-linked condition — an Employee
  who uploaded a Task attachment while directly authorized, then later retained only hierarchy-only
  READ visibility (e.g. losing a direct assignment while remaining visible via a one-hop Subtask
  relationship), would have kept rename/soft-delete/restore rights indefinitely. Fixed: that branch
  now requires `can_access_task_directly`. The Supervisor branch already correctly used
  `can_access_task_directly` (confirmed via read-back, not assumed) — unchanged.
- **Defect C — pending reservation lifecycle used the wrong scope entirely.**
  `finalize_document_upload`/`cancel_document_upload` and the three pending-lifecycle policies
  (`documents_objects_insert`, `documents_select_own_pending`, `documents_objects_delete_own_pending`)
  all gated on the general `can_manage_document_row`, whose Supervisor branch would let a Supervisor
  with legitimate direct Task/Project scope finalize or cancel a **subordinate's still-in-flight
  pending upload** merely by knowing/guessing its UUID — a pending reservation is uploader-owned, not
  yet a "Document" anyone else has real standing over. Fixed with a new, narrower helper,
  `can_manage_pending_document_row(uploaded_by, task_id, project_id)` — reservation owner (while
  still directly authorized) or Superadmin only, **no Supervisor-of-uploader branch at all**. A
  Supervisor's broader legitimate management authority begins only once `upload_state = 'ready'`.
  (This is also a deliberate widening from the previous hotfix's own `documents_select_own_pending`,
  which did not grant Superadmin blanket pending-row visibility — this pass explicitly retains that
  recovery capability, since `can_manage_pending_document_row`'s Superadmin branch is unconditional
  by design.)

### Final `can_manage_document_row` semantics (READY Documents)

| Role | Task-linked | Project-level |
|---|---|---|
| Superadmin | unconditional | unconditional |
| Supervisor | `can_access_task_directly` | `can_access_project` |
| Employee (own upload only) | `can_access_task_directly` | `can_access_project` |

### Pending lifecycle (`can_manage_pending_document_row`)

| Actor | Can finalize/cancel/see-pending/delete-pending-object |
|---|---|
| Reservation owner, still directly authorized | Yes |
| Reservation owner, authority since lost | No |
| Supervisor with legitimate direct scope over the owner's Task/Project | **No** |
| Superadmin | Yes, unconditionally (explicit recovery/cleanup capability) |
| Unrelated user | No |

### Mock parity

`src/lib/data/permissions.ts`'s `canManageDocument` — Employee branch corrected from reusing
`canAccessDocumentRecord` (which composes `canAccessTask`) to composing `canAccessTaskDirectly`
directly, mirroring the SQL fix exactly. `canAccessDocumentRecord` itself (the VIEW gate) is
**unchanged** — still composes `canAccessTask`. `mock-documents-provider.ts`'s `uploadDocument`
Task-linked branch corrected from `canAccessTask` to `canAccessTaskDirectly`. Also fixed a genuine
pre-existing gap surfaced while probing: the mock's own `taskContext` helper never computed
`hierarchyAssigneeIds` at all, so a hierarchy-only reader's Document VIEW was silently narrower than
intended — added the identical one-hop hierarchy computation `mock-tasks-provider.ts` already uses,
so `listTaskAttachments`/`canAccessDocumentRecord`'s VIEW path correctly grants hierarchy-only
readers visibility (matching the hosted SQL `can_access_task`, which already computed this
internally with no separate parameter needed).

### Probes (58/58 passed, zero leftovers)

Re-ran all 30 probes from the previous hotfix (still passing) plus 8 new scenario groups built on
synthetic parent/child Task pairs (created and torn down per run, never touching real seed data):

- **T1 (Employee hierarchy read)**: a hierarchy-only Employee can VIEW an existing Task-linked
  Document, but cannot upload a new one, rename, or delete the existing one.
- **T2 (Supervisor hierarchy read)**: same pattern for a Supervisor whose only relationship to the
  Task is a one-hop hierarchy read (not managing the Task's real assignee).
- **T3/T4 (direct Employee/Supervisor)**: unchanged behavior confirmed — upload/edit/delete/restore
  all succeed for genuinely direct authority.
- **T5 (lost direct access, retained hierarchy read)**: an Employee uploads while directly assigned;
  her direct assignment is then removed while she remains hierarchy-visible via a Subtask
  relationship — the Document stays readable, but rename/soft-delete/new-upload all now correctly
  fail.
- **T6/T7 (pending reservation ownership)**: verified against the exact boolean shape
  `can_manage_pending_document_row` implements (mock mode has no separate reserve/finalize/cancel API
  surface — `uploadDocument` is atomic — so this is proven at the shared permission-logic level) —
  the uploader (while still scoped) and Superadmin succeed; a legitimately-scoped Supervisor and an
  unrelated user both fail.
- **T8 (view regression)**: hierarchy-readable ready Task attachments remain readable — read
  visibility was not accidentally narrowed to direct-only anywhere.
- **Task-delete regression**: active and Trash attachments both still block Task hard-delete,
  unchanged.

### Hosted verification

Read back **after** apply: `can_manage_document_row`, `can_manage_pending_document_row`,
`reserve_document_upload`, `finalize_document_upload`, `cancel_document_upload` (all via
`pg_get_functiondef`); `documents_select`/`documents_select_own_pending`/`documents_select_trash` and
`documents_objects_insert`/`documents_objects_select`/`documents_objects_delete_own_pending` (via
`pg_policies`) — confirming live: VIEW paths (`documents_select`, `documents_objects_select`) still
call `can_access_document` (→ `can_access_task` for Task-linked rows) unchanged; the three
pending-lifecycle policies now call `can_manage_pending_document_row`; `can_access_task`/
`can_access_task_directly` themselves read back byte-identical to Part 1's pre-migration capture —
neither was touched.

Migration: `supabase/migrations/20260901100000_documents_direct_task_authority_hotfix.sql` — new,
forward-only, applied to hosted Supabase. All four Phase 14B-era migrations (`20260831090000`,
`20260831100000`, `20260901090000`, `20260901100000`) confirmed local == remote, zero pending.

**Phase 14B status: FINAL SECURITY ACCEPTED / COMPLETE** — reviewed and accepted in full, covering
all three implementation/hotfix passes. No Phase 14C work started; Phase 14C is on hold pending boss
presentation feedback review and roadmap re-prioritization (see `docs/current-project-state.md`).

## Part B1 — Project access audit (performed before writing any SQL)

Re-read the current, live schema (not assumed) before designing any Document authorization:

1. **What determines whether Employee can open Project P?** `public.can_access_project(P)` —
   already defined once, in `20260815090000_projects.sql`, never redefined since. True when the
   Employee is the Project's `owner_id`, or a `project_members` row, or the Project belongs to the
   Internal/Non-billable Company.
2. **Supervisor?** Same function — true additionally when `manages_user(owner_id)` or
   `manages_user(member.user_id)` for any member, i.e. the Supervisor's own direct reports own or
   belong to the Project. Never broader than that (no organization-wide branch).
3. **Superadmin?** Same function — unconditional `is_superadmin()` branch.
4. **Is `can_access_company` equivalent to Project access? No.** `can_access_company` is strictly
   broader — true for anyone with *any* relationship to *any* Project under that Company. Reusing
   it for a Project-level Document would leak visibility across sibling Projects within the same
   Company.
5. **Could one Company contain Projects with different membership? Yes** — nothing in the schema
   constrains a Company to one Project, and `project_members` is a genuinely per-Project membership
   table.
6. **Is a new `can_access_project` helper required? No** — it already exists and already matches
   current Project workspace visibility exactly (confirmed by reading `projects_select`/
   `project_members_select` RLS, which already call it).
7. **Exact logic preserved:** unchanged — every Document check composes the existing function
   verbatim, never a re-derived approximation.

This is Correction 1 from the Phase 14A lock, re-verified here with the actual current source
before any table/policy was written.

## Document Model

One table: `public.documents`. `project_id` mandatory, immutable. `task_id` optional, immutable
after creation (no "change context" — Correction 3). `upload_state` (`pending`/`ready`) gates every
normal read path. `deleted_at` is a soft-delete/Trash flag only — no automatic purge.

```sql
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  task_id uuid null references public.tasks (id),
  uploaded_by uuid not null references public.profiles (id),
  original_filename text not null,
  display_name text null,
  storage_path text not null unique,          -- server-generated only
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  description text null,
  category text null check (category in (...)),  -- only when task_id is null
  upload_state text not null check (upload_state in ('pending','ready')) default 'pending',
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_category_only_when_project_level check (category is null or task_id is null)
);
```

Indexes: `project_id`, `task_id`, a partial index on `(project_id) where upload_state = 'ready' and
deleted_at is null` (the one shape every normal read path shares). No `workstream_id`/`activity_id`
columns — derived from `task_id` when needed, never duplicated.

**Task/Project invariant** — enforced twice: `reserve_document_upload` derives `project_id` from
`task_id`'s own Workstream server-side (never trusts a caller-supplied pair); a `before insert or
update` trigger (`enforce_document_invariants`) re-validates the same relationship and additionally
rejects any attempt to change `project_id`/`task_id`/`storage_path`/`uploaded_by`/
`original_filename`/`mime_type`/`size_bytes` after creation — defense-in-depth against even a
hypothetical future `service_role` write bypassing the RPC.

## Upload Lifecycle (reserve → upload → finalize)

1. **`reserve_document_upload(project_id, task_id, original_filename, mime_type, size_bytes)`** —
   authenticated only; exactly one of `project_id`/`task_id`; derives/validates the Project from the
   Task server-side when Task-scoped; validates the extension↔MIME allowlist (Part 12 — extension
   and declared MIME must agree exactly, not independently); validates size (1 byte–25MB); generates
   the immutable `storage_path` (`projects/{project_id}/{document_id}.{extension}` — the original
   filename is never part of the object key); inserts a `pending` row; returns `(document_id,
   storage_path)`. The caller can never choose `storage_path`.
2. **Browser upload** — the caller's own authenticated Supabase client uploads directly to the
   private `documents` bucket at the exact reserved path, gated by the Storage INSERT policy (only
   the caller's own pending reservation's exact path).
3. **`finalize_document_upload(document_id)`** — confirms the matching `storage.objects` row
   actually exists (read-only inspection, not a Storage mutation), then flips `pending → ready`.

**Cancel** — `cancel_document_upload(document_id)`: idempotent (an already-gone or already-finalized
row is a silent no-op); hard-deletes the row (a pending row was never visible, no evidence to
protect); does not touch Storage itself — the provider's own orchestration removes the Storage
object *first* (while the row is still pending, satisfying the DELETE policy), then calls this to
remove the metadata row.

**Interrupted upload / finalize failure** — handled honestly, not claimed to be transactional:
- Reserve succeeds, browser upload fails → `cancel_document_upload` releases the reservation.
- Upload succeeds, finalize fails → best-effort `storage.remove([path])` then
  `cancel_document_upload`. Neither cleanup call is retried automatically; a failure at this exact
  moment can leave a genuinely orphaned pending row/object — a known, documented residual gap in
  14B, not silently claimed impossible (no reconciliation job exists yet).
- Browser refresh mid-upload → the reservation simply stays `pending` and invisible forever unless a
  future cleanup path addresses it; not a security issue (never visible, never downloadable), just an
  accepted storage-hygiene gap.

**Pending visibility** — a `pending` row is invisible to `listProjectDocuments`, `listTaskAttachments`,
`getDocumentDownloadUrl`, and any Task Quick View count, by construction (`can_access_document`
requires `upload_state = 'ready'`). A caller can still see their *own* pending rows via a narrow,
separate RLS policy (`documents_select_own_pending`) — for future retry/cleanup UI, not used by
anything in 14B itself.

## Storage

One private bucket: `documents`. 25MB file-size limit and the full MIME allowlist configured at the
bucket level (a second, independent enforcement layer, not a substitute for `reserve_document_
upload`'s own validation). Object path: `projects/{project_id}/{document_id}.{safe_extension}` —
server-generated, immutable, never containing the original filename. No UI calls `supabase.storage`
directly anywhere — only `supabase-documents-provider.ts` does.

## Authorization

`can_access_document(document_id)` — Superadmin unconditional; Task-linked uses `can_access_task`
(broad read visibility, matching `notes_select`'s own precedent); Project-level uses
`can_access_project` (Correction 1 — **not** `can_access_company`); also requires `upload_state =
'ready' and deleted_at is null`.

`can_manage_document_row(uploaded_by, task_id, project_id)` — the single source of truth composed by
everything else: Superadmin unconditional; Supervisor via `can_access_task_directly` (Task-linked) or
`can_access_project` (Project-level), never role-global; Employee only their own upload, and only
while they still genuinely have Task/Project access (an uploader who has since lost access does not
retain management rights).

`can_edit_document(document_id)` — `can_manage_document_row` plus `upload_state = 'ready' and
deleted_at is null` (an active row specifically — restore composes `can_manage_document_row`
directly instead, since a Trash row fails this state check by design).

**Recursion graph:** `can_access_document` / `can_manage_document_row` / `can_edit_document` →
`can_access_task`, `can_access_task_directly`, `can_access_project`, `is_superadmin`, `is_supervisor`
— all already-proven leaf helpers with no path back into `documents` or any of these three
functions. Clean DAG, same tracing discipline as the Phase 13 Supervisor Task-mutation hardening.

## Row-Level Security

`public.documents`: no direct `insert`/`update`/`delete` grant to `authenticated` at all — every
mutation goes through the SECURITY DEFINER RPCs above (this is what actually makes `storage_path`/
`project_id`/`task_id` immutability enforceable; a raw INSERT policy would let a client choose an
arbitrary `storage_path`). Three SELECT policies (permissive, OR'd): `documents_select`
(`can_access_document`), `documents_select_trash` (`deleted_at is not null and
can_manage_document_row(...)`), `documents_select_own_pending` (`upload_state = 'pending' and
uploaded_by = auth.uid()`).

`storage.objects` (bucket `documents`): INSERT only into the caller's own matching pending
reservation's exact path; SELECT delegates to `can_access_document` via a `storage_path` lookup
(the *same* function the metadata table uses — the two layers can never drift apart); no UPDATE
policy at all (object paths/content immutable in v1); DELETE only the reservation owner's own
still-pending object, or Superadmin unconditionally (a deliberate, narrow admin capability ahead of
any dedicated purge workflow — not exposed anywhere in the provider's public API in 14B).

## Signed URLs

The normal authenticated Supabase client (`supabase.storage.from('documents').createSignedUrl(...)`)
— no service-role credential anywhere client-reachable. 300-second expiry. Never persisted on the
`documents` row. Minted only on a specific Preview/Download call, never for a whole list.

## Soft Delete / Restore

`soft_delete_document(document_id)` — sets `deleted_at`, requires `can_edit_document` (active+ready
+ manage-authorized). `restore_document(document_id)` — clears `deleted_at`, requires the row is
actually in Trash and `can_manage_document_row`. **Neither ever touches the Storage object.** No
automatic purge job exists in 14B (would need background-job infrastructure this codebase doesn't
have) — permanent purge is deferred to a later, narrowly-designed Superadmin-only workflow.

## Task Delete Dependency

`supabase/migrations/20260828100000_delete_task.sql` (already hosted) was **not edited** —
`supabase/migrations/20260831100000_task_delete_documents_blocker.sql` `create or replace`s the same
function with one added blocker: `exists (select 1 from public.documents where task_id =
p_task_id)` — **no `deleted_at` filter**, so a Trash (soft-deleted) attachment blocks Task deletion
exactly like an active one (Correction 5 — a soft-deleted Document is still physically present and
restorable; only a future permanent-purge workflow could ever let the Task become deletable). Every
other accepted property of `delete_task` was preserved byte-for-byte: the auth check, `SECURITY
DEFINER`, `search_path = ''`, the `FOR UPDATE` row lock (acquired first, closing the same TimeEntry/
Note/Subtask/Document insert race the original migration proved), the TimeEntry/Subtask/Note
blockers, the `can_edit_task` boundary, the existence-then-permission error ordering, and the
grants/revokes. No new broad table DELETE grant. The equivalent blocker was also added to
`mock-tasks-provider.ts`'s `deleteTask` for mock/hosted parity.

## Provider Architecture

`src/lib/data/providers/documents-provider.ts` — the `DocumentsProvider` interface
(`listProjectDocuments`, `listTaskAttachments`, `getDocumentDownloadUrl`, `uploadDocument`,
`updateDocumentMetadata`, `deleteDocument`, `restoreDocument`). `mock-documents-provider.ts` — full
in-memory implementation against `mock-db.ts`'s new `documents` array (no seed rows — no UI exists
yet to demonstrate; probes create their own throwaway fixtures). `supabase-documents-provider.ts` —
the only place `supabase.storage` is called; orchestrates the full reserve/upload/finalize lifecycle
behind `uploadDocument`. Wired into `providers/index.ts` as `documentsProvider`, gated on
`usesSupabaseData` (real only under full `supabase` mode — matching every other brand-new-feature
provider's own precedent: Projects, Visit Entries, Client Report Schedules). The old, dead,
pre-Phase-8 `Document` type stub (`src/lib/data/types/document.ts`) was replaced cleanly with the
real Phase 14 shape — no two conflicting models exist.

## Mock Security Probes

23/23 rollback-safe mock probes passed (created via `mockDocumentsProvider` directly, cleaned up
from `mock-db`'s in-memory `documents` array immediately after, confirmed absent afterward):

- **A–D (Employee/Alicia)**: sees a Project Document in her own accessible Project; does not see one
  in an inaccessible Project; sees a Task attachment on her own assigned Task; does not see one on an
  inaccessible Task (a different Company entirely, via Marcus's report Dana) even though Alicia's own
  Project context is otherwise visible elsewhere.
- **E–F**: can rename/soft-delete/restore her own upload while still legitimately scoped; cannot
  edit or delete a Document she can see but did not upload (Priya's, in the same Project).
- **G–I (Supervisor/Priya)**: can manage her own team's (Alicia's) Task-linked Document; cannot
  manage Dana's (Marcus's report) Task-linked Document; cannot manage a Document in a wholly
  unrelated Project either (confirms no org-wide branch).
- **J (Superadmin/Jordan)**: sees Documents in any Project; can manage Dana's Task-linked Document
  unconditionally.
- **K–N (state)**: a `pending` row is neither listed nor downloadable; a `ready`+active row is
  downloadable; a soft-deleted row disappears from normal lists and downloads fail; an authorized
  manager (Priya, Alicia's supervisor) can restore it.
- **O**: `uploadDocument` rejects supplying both `projectId` and `taskId` at once (the
  cross-context-mismatch case, at the one place a caller could even attempt it).
- **P**: `task_id` immutability is a compile-time guarantee — `UpdateDocumentInput` has no `taskId`
  field at all; no runtime probe applies.
- **Q–R (Task delete)**: deleting a Task with an active attachment is blocked; deleting a Task with a
  Trashed-but-not-purged attachment is *also* blocked (restored the Task-linked Document, soft-deleted
  it again, confirmed the block still holds).

`can_log_time_on_task`/`canLogTime` were not touched at any point this pass — confirmed by file diff,
not merely asserted.

## Hosted Storage Probe

**No live hosted Storage object was created.** Per the explicit instruction — "if complete cleanup
cannot be guaranteed, do not create the hosted object" — a genuine authenticated end-to-end upload
probe would need a real user session/JWT and a UI or scripted Storage client call this pass has
neither the surface nor a safely-guaranteed cleanup path for (no Project Documents UI exists yet;
scripting a raw authenticated call would need real user credentials this session doesn't hold
safely). Verified instead through:
- Read-only bucket listing (`supabase storage ls --linked --experimental`) before and after apply —
  confirmed zero buckets existed beforehand, and the `documents` bucket exists (empty — no objects)
  immediately after the migration applied.
- The migration's own successful apply against the real hosted Postgres — proves the table, indexes,
  trigger, functions, RLS policies, and bucket-insert statement are all syntactically and
  semantically valid against the actual live schema, not merely conceptually sound.
- The full 23-probe mock-mode suite, which exercises the *identical* authorization logic (same
  helper composition, same conditions) now hosted.

## Migrations

- `supabase/migrations/20260831090000_documents_foundation.sql` — new. `documents` table, invariant
  trigger, `can_access_document`/`can_manage_document_row`/`can_edit_document`, RLS, the `documents`
  Storage bucket, Storage object policies, `reserve_document_upload`/`finalize_document_upload`/
  `cancel_document_upload`/`update_document_metadata`/`soft_delete_document`/`restore_document`.
- `supabase/migrations/20260831100000_task_delete_documents_blocker.sql` — new, forward-only.
  `delete_task` (`20260828100000`, unedited) redefined via `create or replace` with the added
  Document blocker.
- Both reviewed, dry-run verified, and **applied to hosted Supabase** — confirmed local == remote,
  zero pending, "Remote database is up to date," both before and after apply.

## Validation

`npx tsc --noEmit` — 0 errors. `npx eslint src` — 0 errors, same 2 pre-existing warnings. All four
provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) — clean (one stale `.next`
build-cache artifact from switching providers mid-session was cleared and did not recur). Single
normal dev server restarted on port 3000 (`supabase` provider); no 3901/3001 competitor left running.

## Not Included in 14B

No Project Documents tab, no Task Attachments UI, no Quick View count, no preview/download UI, no
search UI, no Timeline integration, no permanent-purge workflow, no categories/filters UI. All
deferred to 14C/14D/14E per the Phase 14A slice plan.
