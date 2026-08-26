# Phase 13A — Client History & Operational Intelligence Audit

**Status: AUDIT / DESIGN — NOT IMPLEMENTATION.** This document is a read-only architecture audit and
design proposal. No product code, migration, RLS policy, or provider was changed to produce it
(one factual documentation correction is noted separately in the final report, not applied here
without approval). Nothing in this document should be treated as built.

> **Superseded IA recommendation, 2026-08-26.** Section 6 below recommended a new, separate
> operational Client route. That recommendation was rejected by the product owner before any of it
> was committed — see [Section 21, "Post-audit IA decision — Project-centric operational
> model,"](#21-post-audit-ia-decision--project-centric-operational-model) at the end of this
> document. Sections 1–20 are preserved unedited below as the original audit record; every
> underlying architecture/data finding in them (Parts A–C, N, and the locked constraints) remains
> valid and is exactly what the revised, Project-centric Phase 13B is built on. Only the "where does
> this live" conclusion in Sections 6 and 16–17 changed.

**Question this phase answers for the future feature:** for one Client (Company), "what have we
ever done for them" — not just what's currently open — spanning every Project/Service/Task/Time
entry/Report/Note/Visit/Handoff that has ever touched that Company, readable by the roles who
legitimately work with that Company today (not only Superadmin).

## 1. Locked constraints (carried forward, not re-litigated)

- Domain hierarchy stays exactly: Company → Project → Service (Workstream) → Activity → Task →
  Subtask (one level only) → Checklist. A Task always has exactly one Activity; a Service may
  enable many Activities (already true today, confirmed in Phase 12B).
- Exactly three roles: Employee, Supervisor (Employee experience + direct-report/team privileges,
  never org-wide), Superadmin (org-wide). No new role, no configurable permission matrix.
- Client History is an **operational** surface, not an administrative one. It must not expose
  Client Contacts or any other Superadmin-only administrative data to Employee/Supervisor. It does
  not replace `/dashboard/companies/[id]` (Company administration stays Superadmin-only, unchanged).
- No employee surveillance, screenshots, idle tracking, or geolocation — the Timeline design in
  Part L explicitly excludes anything with that character.
- No migrations, RLS changes, or provider changes in this phase. Everything recommended below is
  either already fully supported by existing data/RLS, or explicitly flagged as new backend work
  for a later slice.

## 2. Part A — Existing Client/Company surfaces (inventory)

| Surface | Route | Access | What it shows today |
|---|---|---|---|
| Company admin detail | `/dashboard/companies/[id]` | **Superadmin-only** (real redirect for anyone else) | Overview, assigned staff, workstreams, time-vs-budget rollup, Client Contacts, tasks, **Company Notes** |
| Companies list | `/dashboard/companies` | **Superadmin-only** (same redirect pattern) | Roster/filter table — name, status, health, brand, primary contact, renewal date, staff avatars. No history. |
| Project workspace | `/dashboard/projects/[id]` | Any role, row scoped by access (`canAccessProject`) | Overview/Tasks/Services/Team tabs only. Its own source comment states Time/Reports/History tabs were **deliberately deferred in Phase 8B** — direct precedent for this phase. |
| Projects list | `/dashboard/projects` | Any authenticated user, rows scoped per role | Flat table, one row per Project with a company-name subtitle and text search matching company name. No "group by Company." |
| Workstream/Service detail | `/dashboard/workstreams/[id]` | Any role, not Superadmin-gated | Current-state only: overview, team, time-vs-budget, this-service's tasks. No history section — same Phase 8B deferral. |
| Sidebar "Client work" group | `app-sidebar.tsx` | "Companies" item shown **only if `isSuperadmin`**; "Projects" item always shown | No Supervisor/Employee-visible Company-level entry point exists in the sidebar today. |
| Command palette | `command-palette.tsx` | Populated from `useCompanies()` (role-scoped) | Indexes Companies **and** Workstreams for jump-to-search; **no Projects category**. Companies results link to `/dashboard/companies/[id]`, which then immediately redirects a non-Superadmin viewer away — a latent, currently-harmless dead-end (see Part E). |
| Dashboard / My Day / Planner / Team Time / Team Updates | various | n/a | Grepped for Company content: only use `useCompanyLookups()` to resolve **assignable staff** for filters — no Client-scoped display today. |
| Client Reports list | `/dashboard/reports/client` | Role-scoped (`useClientReports`) | The closest existing thing to per-client history: searchable by client name, one row per Client+Period report. Period-based, not a continuous log. |

**Conclusion of Part A:** there is currently no route any Employee or Supervisor can reach that
shows "everything for this Client." The Project workspace is the closest operational analog but is
scoped to one Project, not the Company as a whole, and explicitly deferred its own History tab
back in Phase 8B.

## 3. Part B — Existing historical data sources (inventory)

| Data source | Direct `companyId`/`projectId`? | Existing cross-record "for this Company" method? | Read-access gate | Volume/year/company (rough) |
|---|---|---|---|---|
| Tasks | `companyId` direct | `useTasks()` is role-scoped but not currently filterable by Company in one call (filters by Project/Workstream) | `canAccessTask` (hierarchy-read) / `canAccessTaskDirectly` (mutation) | Tens–low hundreds |
| Subtasks | via parent Task | none | same as Task | Subset of Task count |
| Checklist items | via Task | none | `checklist_items_select` = `can_access_task` | Low, per-task |
| Time Entries | **neither** — only `taskId`/`userId`, company via `task.companyId` join | none — `listTimeEntriesForTask`, `listMyTimeEntries`, `listTimeEntriesForDate` only | `user_id = auth.uid() or manages_user(user_id)` — **person-hierarchy, not company-scoped** | High — hundreds–thousands |
| Client Reports | **both** `companyId` + `projectId` direct | `listReports(viewer)` is org-wide-for-viewer, no `listReportsForCompany` | `can_view_client_report` (owner/reviewer/manager) — **not** general company access | Low — dozens |
| Client Report Schedules | `projectId` only | `listSchedules(viewer)` already org-wide but reviewer-gated | `has_reporting_review_access()` — reviewer/Superadmin only | Trivial, static |
| Visit Entries | `projectId` only | `listMyVisitEntries`/`listVisitEntriesForUser` — user-scoped only | person-hierarchy, same shape as Time Entries | Low–moderate |
| Daily Updates | **neither at row root** — company/project live inside each `entries[]` item | none — date+viewer scoped only, no unnest-by-company query exists | `manages_user(user_id)` — person-hierarchy | High but diffuse across companies |
| Task Handoffs | via `taskId` only | `listHandoffsForTask` (per-task), `listRecentHandoffs` (capped recent feed, not full history) | `can_access_task`-shaped — broadest of the six data sources | Low — tens |
| Notes (Task) | via `taskId` | `listNotesForTask` | `can_access_task` | Low |
| **Notes (Company)** | `companyId` direct | **`listNotesForCompany(viewer, companyId)` already exists and is exactly the "everything for one company" shape a Client History feature needs** | `can_access_company` (RLS `notes_select`/`notes_insert`) — **general company access, not Superadmin-only** | Low |
| Activity Catalog | scoped by `brandId`/`serviceLineId`, not company | n/a (shared reference data) | ungated (`using (true)`) | Static |
| Workstreams | `companyId` + `projectId` direct | Company page's Workstreams card already lists all of a Company's Workstreams | `canAccessWorkstream` | Low — a handful, long-lived |
| Projects | `companyId` direct | Company page's data already includes all Projects for a Company | `canAccessProject` | Very low — 1/year typically |
| Client Contacts | `companyId` direct | n/a | **Superadmin-only** (`client_contacts_select`), deliberately narrowed past general company access in a dedicated migration | Static, admin data — **out of scope, must stay excluded** |

That is 14 concrete sources plus 3 structural/reference tables (Activity Catalog, and the
Project/Workstream "current roster" views already embedded in the Company page) — covering the
"17 items" scope requested; nothing else in the schema carries Company-scoped historical data today
(no generic audit log, no status-change history table, no assignment-change history table exist).

## 4. Part C — Permanent Client Note audit

**Finding: Company-level Notes already exist as a complete, working feature — not a gap.**

- `Note` (`companyId: string | null`, `taskId: string | null`, exactly one set) and
  `NotesProvider.listNotesForCompany`/`createCompanyNote` are fully implemented in both mock and
  Supabase providers.
- Supabase RLS: `notes_select`/`notes_insert` both branch `(company_id is not null and
  can_access_company(company_id))` — this is the **same general company-access gate** used
  everywhere else (Projects, Workstreams, Notes-on-tasks), confirmed directly in
  `20260814110000_notes.sql` and re-confirmed unchanged by the Phase 10 hardening migration
  (`20260821200000_...`, which explicitly left the company-scoped Notes branch untouched).
- **This means an Employee or Supervisor who already has legitimate access to a Company (via a
  Project/Workstream/Task they're on) can, today, at the data and RLS layer, read and write a
  Company-level Note — they are not Superadmin-restricted.** The only reason they can't today is
  that the *only* UI surface that renders `NotesSection` for a Company is
  `/dashboard/companies/[id]`, which is itself Superadmin-gated at the page level. The restriction
  is a UI accident of placement, not an intentional data-layer boundary.
- The `NoteType` enum (`call | meeting | internal | decision`) is identical for company- and
  task-level notes — there is no separate "client note" category to design; it already exists.
- **Design implication:** a new Client History surface can safely render `useCompanyNotes` for
  Employee/Supervisor **with zero backend change** — it is exactly as safe as any other
  already-Employee/Supervisor-visible company data, because the RLS gate is identical. The one
  thing to actively confirm during implementation (13B) is that the new page's own route guard
  matches `canAccessCompany`, not `isSuperadmin` — copy the Project workspace's access pattern, not
  the Company admin page's.

## 5. Part D — Client History access model per role

**Recommendation: reuse `canAccessCompany` / `visibleCompanyIds` — the exact gate already used by
`companies_select`, `notes` (company branch), and `listCompanies` — as the single access gate for
the new Client History surface. No new permission function needed.**

Under that gate, per role:

- **Employee**: sees Client History only for Companies they're currently or historically assigned
  to (via `assignedCompanyIds`, mirroring today's Company visibility). Same "operational, not
  administrative" scope as everywhere else — no Contacts, no company edit controls, no staff
  roster editing.
- **Supervisor**: sees Client History for any Company visible to their direct reports (today's
  `visibleCompanyIds` supervisor branch — union of their team's `assignedCompanyIds`), consistent
  with "Employee experience + direct-report privileges, never org-wide."
- **Superadmin**: sees Client History for every Company (`visibleCompanyIds` returns `"all"`),
  identical to their existing Company-admin reach — but the *page itself* stays the new operational
  one; the existing `/dashboard/companies/[id]` admin page is untouched and still their route for
  Contacts/edit/staff-assignment.

This requires **zero RLS or migration work** — every table proposed for the new surface
(Companies, Projects, Workstreams, Tasks, Company Notes, Client Reports) already enforces this
exact access pattern independently at the RLS layer; the new page is just a new read-only
aggregation view over data each role can already legitimately read.

## 6. Part E — Client workspace IA design (where does this live?)

Four options were considered:

- **(A) Reuse `/dashboard/companies/[id]`, branch its content by role.** Rejected: this route has
  been deliberately hardened Superadmin-only across multiple phases (the redirect-guard, the
  dedicated `client_contacts_superadmin_only` migration). Splitting its render by role risks a
  future edit to the admin branch leaking into the operational branch or vice versa, and blurs a
  boundary that's been intentionally kept sharp.
- **(B) A new, separate operational Client route** (e.g. `/dashboard/clients/[id]`, keyed by the
  same Company id). **Recommended.** Cleanly separates "Company administration" (existing,
  untouched, Superadmin-only) from "Client operational history" (new, all three roles, gated by
  `canAccessCompany` per Part D). Every data source it needs is already independently
  RLS-scoped correctly for this — the new page just composes existing, already-safe hooks/queries.
  Superadmin gets both: the new operational view, plus a "Manage company" link (Superadmin-only)
  across to the existing admin page for anything administrative.
- **(C) Extend the Project workspace with a cross-project Client-history tab.** Rejected as a
  primary IA: a single Project's URL doesn't naturally represent "the Client" (a Client can have
  zero currently-active Projects, or a viewer may want Client context before picking a Project from
  Dashboard/My Day). Worth doing later as a smaller "View full Client history" jump link from the
  Project workspace **into** the new (B) route, but not as the workspace itself.
- **(D) Group the Projects list page by Company.** Rejected as insufficient: still a
  current-state roster, not a history/timeline surface — doesn't answer "what have we ever done."

**Decision: Option B**, with a Superadmin-only cross-link out to the existing admin page, and a
smaller Option-C-style jump link from the Project workspace into it later.

This also resolves the Part A command-palette finding: once route (B) exists, the palette's
Companies category can link non-Superadmin viewers there instead of the admin route, turning a
currently-dead link into a working one — a small, real UX win of choosing this option, not a
justification on its own.

## 7. Part F — Overview metrics design

All computable today from already-accessible data, no new backend:

- Active Projects/Services count and status mix (from existing Projects/Workstreams lists).
- Open vs. completed Task counts, all-time and trailing 90 days (existing `useTasks` scoped by
  Company, client-side aggregated the way the Company admin page's cards already do).
- Cumulative logged hours all-time (sum of Time Entries joined through Task → Company — see Part I
  for the join cost caveat).
- Last activity timestamp (max of Task updates / Note created_at / Report generated_at).
- Client Report count and most recent report link.

## 8. Part G — Project/Service history design

List every Project (not just the active one) and every Workstream/Service ever created for the
Company, each with its own status/date range, linking into its existing detail page. Fully
supported by existing `projects`/`workstreams` tables (`companyId` direct on both) — this is purely
a "don't filter to current/active" query change in a new page, not new data.

## 9. Part H — Completed work history design

A filterable, paginated list of all Tasks (and their Subtasks) ever created under the Company,
independent of current Project/Workstream, defaulting to a reverse-chronological "most recently
completed/updated first" view. Fully supported today — `tasks.companyId` is already a direct
column; this is a new query shape (`WHERE company_id = ? ORDER BY updated_at DESC`), not new data
or new RLS, and `canAccessTask` already governs row-level visibility correctly per viewer.

## 10. Part I — Time history design

Doable but requires a **join, not a new table**: Time Entries have no direct `companyId`, only
`taskId` → `task.companyId`. A Company-scoped time rollup means querying Time Entries filtered by
`task_id IN (SELECT id FROM tasks WHERE company_id = ?)`, then applying the *existing*
`user_id = auth.uid() or manages_user(user_id)` gate per row — which raises a real design question
flagged in Part Q: today a Supervisor cannot see a non-report's logged time even for a Company they
otherwise fully administer. Client History would either (a) only show the *viewer's own reachable*
time (consistent with current authorization, weaker "client total"), or (b) require a
Company-access-based time-read exception for this one aggregate view (a genuine backend change, not
free). Recommend (a) for 13B — do not weaken the person-hierarchy time gate to get a nicer number.

## 11. Part J — Report history design

Straightforward: Client Reports already carry `companyId` directly. The only design nuance is that
`can_view_client_report` (owner/reviewer/manager) is **narrower** than `canAccessCompany` — an
Employee who can see the Company might not be the owner of every report generated for it. Client
History should show only the reports the viewer's existing `listReports(viewer)` already returns,
filtered client-side to this Company — never a new "everyone sees every report" bypass.

## 12. Part K — Team involvement history

"Who has ever worked on this Client" — derivable from distinct assignees across all-time Tasks plus
Workstream lead/team fields plus Report owners, all already Company-scoped via existing joins. No
new data needed; a simple `DISTINCT` aggregation over data already covered in Parts G–J.

## 13. Part L — Chronological Timeline design

A merged, reverse-chronological feed composed **only** from already-legitimate, non-surveillance
events the viewer can already see individually elsewhere:

- Task created / status changed to done / Subtask completed
- Company Note added
- Client Report generated
- Workstream/Service created or renewed
- Task Handoff recorded (handoffs are already an intentional, visible workflow event, not
  surveillance)

**Explicitly excluded, per the standing "no surveillance" constraint**: individual Time Entry
start/stop/pause events, Daily Update raw contents, Visit check-in/out timestamps, or anything that
reads as monitoring an individual's minute-by-minute activity. Time and Visits contribute only to
the *aggregate* Overview metrics (Part F/I), never as timeline line-items.

## 14. Part M — Performance / data-volume considerations

- Time Entries and Daily Updates are the highest-volume sources and, per Part I/B, require a join
  through Task/Project rather than a direct Company index — a naive "all Time Entries for Company"
  query without a `task.company_id` index could be slow at scale. Confirm `tasks(company_id)` is
  indexed (very likely already, as the primary Task-list query path) before building 13B's
  aggregate.
- Client Reports, Notes, Workstreams, Projects, Handoffs are all low-volume per company
  (dozens–low hundreds/year at most) — safe to query directly without pagination concerns beyond
  standard list pagination already used elsewhere (e.g. Client Reports list).
- The Timeline (Part L) should be paginated/limited (e.g. most recent 50, "load more") from day
  one — do not attempt to render a truly unbounded all-time feed in a single query.

## 15. Part N — Exists vs. new classification

| Category | Meaning | Items |
|---|---|---|
| **A — Fully exists, zero work** | Data + RLS + a working "for this Company" query already present | Company Notes (`listNotesForCompany`), Workstreams-for-Company, Projects-for-Company |
| **B — Data exists, needs a new query shape (no backend change)** | Direct `companyId` column exists; just needs a new client-side query removing today's "current/active only" filter | Tasks-for-Company (Part H), Client Reports-for-Company (Part J) |
| **C — Data exists, needs a join (no schema change, new query)** | No direct `companyId`; reachable via existing FK, acceptable query cost | Time Entries (via Task), Visit Entries (via Project), Task Handoffs (via Task) |
| **D — Data exists but structurally awkward** | Technically reachable but requires unnesting or non-trivial aggregation | Daily Updates (`entries[]` array spans multiple companies per row) |
| **E — Would need new backend work** | Not resolvable from existing schema/RLS alone | A Company-scoped time-read exception for Supervisor/Superadmin roll-ups that exceeds the person-hierarchy gate (Part I option b) — **only if** that stronger aggregate is ever required; not needed for 13B as scoped |

**No new generic audit-log table is needed for v1** — every event the Timeline (Part L) needs is
already a first-class row in an existing table with existing timestamps; a generic audit log would
duplicate data that already exists in a structured, purpose-built form.

## 16. Part O — Recommended delivery slices

- **13B — Client workspace shell + Overview + Notes.** New route (Option B), access-gated by
  `canAccessCompany`, Overview metrics (Part F), Company Notes reused as-is (Part C — genuinely
  zero backend change), Projects/Services history (Part G). Highest value, lowest risk — entirely
  Category A/B work.
- **13C — Completed work + Report history.** Task/Subtask all-time history (Part H), Client Report
  history respecting `can_view_client_report` (Part J). Category B work.
- **13D — Time & Team involvement aggregates.** Time/Visit rollups via join (Part I, option (a) —
  viewer's own reachable time only), Team involvement (Part K). Category C work; confirm index
  performance per Part M before shipping.
- **13E — Unified Timeline.** Merged chronological feed (Part L) composed from the sources already
  built in 13B–13D, paginated. Should come last since it depends on all prior slices' data shapes
  being settled.

## 17. Part P — Explicitly deferred / out of scope

- Any Company-scoped time-read exception beyond the current person-hierarchy gate (flagged
  Category E) — do not build unless explicitly requested and re-audited on its own.
- Any Timeline entry derived from Time Entry/Visit/Daily-Update raw events (surveillance-shaped).
- Exposing Client Contacts or any Company-admin field to Employee/Supervisor through this surface.
- A generic audit-log table (Part N — not justified for v1).
- Extending the Project workspace itself (Option C) beyond a simple jump link into the new route.

## 18. Part Q — Risks / open questions

1. **Time aggregate honesty**: a Company-wide "hours logged" number that's actually only the
   viewer's own reachable subset (Part I option a) could read as understated to a Supervisor. This
   should be labeled precisely in the UI (e.g. "hours you can view for this client") rather than
   presented as an authoritative company total, until/unless Category E work is explicitly
   approved.
2. **Command palette dead-link**: today, a non-Superadmin viewer can find a Company in the palette
   and land on a page that immediately redirects them away. Not a security issue (the redirect is
   correct enforcement), but worth fixing as part of 13B by repointing the palette's non-Superadmin
   link to the new route.
3. **Daily Updates** remain the one source that can't cleanly answer "everything for Company X"
   without unnesting `entries[]] — confirm during 13D whether Team-involvement/Timeline actually
   need Daily Update data at all (current design in Parts K/L does not require them).

## 19. Documentation accuracy note (reported, not applied)

While auditing, one inaccurate-if-left-uncorrected implication was found: `docs/current-project-state.md`'s
Phase 8B-era comment (mirrored in `projects/[id]/page.tsx`) describes Time/Reports/History as
"deferred" without noting that Company-level Notes (a real piece of "History") already exist and
are already fully RLS-safe for non-Superadmin viewers per Part C. No code or doc was changed to fix
this in this phase, per instruction — flagged here for the user to decide whether/when to correct
the wording; it does not block or change anything else in this audit.

## 20. Summary

Client History is overwhelmingly a **UI/aggregation problem, not a data or authorization problem.**
Every table needed (Companies, Projects, Workstreams, Tasks, Company Notes, Client Reports, Time
Entries, Visit Entries, Task Handoffs) already carries the right foreign keys and already enforces
the right RLS gate for the exact three-role model this product has had since Phase 1. The single
most important finding is that **Company Notes are not actually Superadmin-restricted at the data
layer today** — only their one UI surface is — so 13B can ship a real, previously-invisible feature
to Employee/Supervisor with zero backend work. The recommended path (Option B: a new, separate
`/dashboard/clients/[id]`-style operational route, gated by the existing `canAccessCompany`) adds no
new authorization surface, touches no existing Superadmin boundary, and can be built incrementally
across 13B–13E in the order above.

## 21. Post-audit IA decision — Project-centric operational model

**Dated 2026-08-26, after Phase 13A's Section 6 recommendation was briefly implemented
(uncommitted) as a separate `/dashboard/clients`/`/dashboard/clients/[id]` route.**

**Decision: the separate operational Client workspace is rejected.** The uncommitted
implementation was fully removed before anything from it was committed or pushed — no trace of it
remains in git history.

**Reason:** for Employee/Supervisor, Project already represents the Client work assigned to them.
Introducing a second navigation layer — Clients → Client → Project — on top of the existing
Projects → Project path creates an unnecessary extra mental model and forces a choice
(Clients-first or Projects-first) that the product doesn't need. Employee/Supervisor should not
have to decide which of two roughly-equivalent entry points to use for the same work.

**What this changes, relative to Sections 6, 16, and 17 above:**
- The new, separate Client route recommended in Section 6 ("Option B") is **rejected**. No
  `/dashboard/clients` or `/dashboard/clients/[id]` route, no new sidebar item, no command-palette
  repoint to a Client-specific route.
- Employee/Supervisor's operational entry point for Client work remains exactly what it already
  was: **Projects → Project** (`/dashboard/projects`, `/dashboard/projects/[id]`).
- **Company remains the permanent, administrative Client master** — Superadmin-only,
  unchanged, Contacts included, at `/dashboard/companies`/`/dashboard/companies/[id]`.
- **Permanent Client context (Company Notes) will be surfaced *through* the Project page**, not a
  separate workspace. The data model is unaffected: notes stay stored with `companyId`, never
  `projectId`, so the same set of notes correctly appears on every year's Project for that Client
  (Alderleaf 2025 / 2026 / 2027 all surface the same permanent Client context) without duplication
  and without losing anything across an annual Project renewal.
- **Historical/related Projects for the same Client may be surfaced within the Project page**
  (e.g. "Other Projects for this Client: 2027 — Active, 2026 — Current, 2025 — Completed"), but
  only the Projects the viewer already has legitimate Project-level access to
  (`canAccessProject`) — Company-level access must never be used as a shortcut to reveal an
  otherwise-inaccessible historical Project. This is a **stricter** gate than the rejected Client
  workspace would have used (which would have shown all Projects the viewer's Company access
  covered); it's intentionally kept at the narrower, already-established Project-authorization
  level.
- Contacts remain Superadmin-only and are still never surfaced to Employee/Supervisor anywhere,
  including through the Project page.
- Later Phase 13 work (completed-work/report history, time/team aggregates, unified Timeline)
  attaches to the **Project workspace**, not to a Client workspace — no separate route is created
  for any later slice either.

**What is unaffected — everything else in this document stays valid:** the full data-source
inventory (Section 3), the Permanent Client Note finding that Company Notes already work for
Employee/Supervisor at the RLS layer (Section 4), the access-model reasoning reusing
`canAccessCompany`/`canAccessProject` rather than inventing a new permission system (Section 5, now
applied to the Project page instead of a new route), the exists-vs-new classification (Section 15),
and the "no generic audit-log table needed" conclusion (Section 15) are all carried forward
unchanged into the revised Phase 13B–13E sequence recorded in
`docs/current-project-state.md`.
