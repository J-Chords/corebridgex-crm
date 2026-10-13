# Developer Handover

This document is written to let a replacement engineer — or a fresh AI/coding-agent session with zero prior conversation history — pick up Corebridge X and continue immediately, without needing access to any prior chat log.

## 1. What Corebridge X is

An internal Project Management / PSA (Professional Services Automation) web app for Croki Digital. It tracks client work through **Project → Service → Activity → Task → Checklist**, with role-based visibility across three roles (Admin, Team Lead, Employee). Built on Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, and Supabase (Postgres + Auth).

## 2. Current repository state

- Repo: `J-Chords/corebridgex-crm`
- Working branch conventions: `feature/CD-<number>-<short-slug>` (e.g. `feature/CD-190-team-activity`)
- Commit convention: `feat(CD-###): ...` / `fix(CD-###): ...` — imperative, ticket-scoped. **Never** add `Co-Authored-By: Claude`/`ChatGPT`/any AI attribution trailer — this repo's history is deliberately human-authorship-only. See `decisions.md`.
- No automated CI/CD exists (see `deployment.md`) — validation is manual (see `testing.md`).

## 3. Current `main` head

```
997c3ce8bae10af859f20c4b525f0c3d9700d352
```

Re-verify with `git rev-parse origin/main` — this file goes stale the moment another PR merges. See `current-state.md` for the live picture.

## 4. Recently completed tickets

- **CD-162** — Boss Feedback MVP Simplification (Dashboard naming, My Day/Planner merge, Project tab consolidation 9→7, Service/Task hierarchy UI polish, employee-service-activity authorization parity). PR #1, merged.
- **CD-190** — Merge Team Updates + Team Time into Team Activity, plus a local-calendar-date time-entry stabilization fix. PR #2, merged.
- **CD-194** — Technical documentation and developer handover (this document set). PR #3, merged.
- **CD-196** — Clarify Dashboard and My Day information architecture, plus a Product Owner-approved follow-up polish pass (Team Workload layout fix, Services-inspired Notifications redesign, notification safe-routing fix). PR #4, merged. Locks Dashboard = role-scoped overview/attention, My Day = personal execution/planning (personal by default for every role); see `decisions.md` for the full placement decisions.
- **CD-205** — Retire the legacy "Project Template" bundle architecture at the schema/source level (`project_templates`/`project_template_services`/`project_template_activities`, their RPCs/triggers/RLS/grants, and dead provider/hook/type source). PR #5, merged. Hosted migration `20260921090000_retire_project_template_bundle.sql` applied and independently re-verified live. The separate, still-live Service-recipe system (`templates`/`template_tasks`/`template_checklist_items`, `apply_template`, Company-detail "Apply template") is explicitly preserved and confirmed unaffected. Phase 0 of the Template terminology redesign. See `decisions.md` and `data-and-supabase.md`.
- **CD-206** — Phase 1 Template workspace and terminology: the visible product term for the Service catalog becomes "Template" (Admin nav + new `/dashboard/admin/templates` list/detail routes, Project-facing "Templates" tab with "Global Service Staffing" removed, Task List column changes — Assignee column removed, Start Date column added — staffing-terminology relabel, Activity catalog "Suggested Tasks"→"Tasks"). PR #7, merged. `service_lines`/`workstreams` persistence and all authorization/RLS/RPCs are unchanged; no migration needed. The separate, still-live Service-recipe system (Company-detail "Apply template" and the Accomplishments Report's own unrelated "Add service" Activity-picker) is explicitly preserved and confirmed unaffected. Product Owner Try-It-Yourself review approved. See `decisions.md`'s "Phase 1 — Template workspace and terminology" entry.
- **CD-207** — Phase 2 Project Overview redesign + KPI navigation: one shared Overview structure for every role, a locked 5-tile clickable KPI row (Templates/Open Tasks/Attention/Due/Members), Attention/Due definitions reusing existing Task/date helpers, the former "Project Details"/"Administrative Details" cards consolidated into one with zero field loss, a real Project tab/URL desync bug fixed, and Projects list rows converted to real `<Link>` navigation. PR #9, merged (merge commit `997c3ce`). Permissions unchanged, no database migration. Blocked→Waiting retirement remains Phase 5 — Blocked exists globally, unchanged. Product Owner manual review approved (2026-09-23). See `decisions.md`'s "Phase 2 — Project Overview redesign + KPI navigation" entry.
- **CD-208** — Phase 3 Project creation + unified editing: Admin and Team Lead can create Projects (0/1/multiple canonical Templates, applied atomically); `Project.ownerId` is now the Project-management authorization boundary (`canManageProjectRecord`/`can_manage_project`, app + backend enforced); a Team Lead creator always becomes owner; Name/Partner Brand/Owner protected after creation for Team Lead; canonical Template→Project application is now a true snapshot (frozen at application time, independent of later catalog edits); Partner Brand is now Project-specific (`projects.partner_brand_id`, independent of Company Brand); canonical Template Activities are now Brand-independent. **Implemented on branch `feature/CD-208-project-creation-unified-editing`, NOT committed/pushed, no PR — awaiting Product Owner review.** 5 migrations drafted locally, not hosted-applied. See `decisions.md`'s Phase 3 entry.

## 5. Open ticket(s)

None tracked as open at this snapshot — this section of the document predates several
later tickets (CD-211 through CD-218, CD-193) and has not been kept fully current; see
`current-state.md` for the live picture. CD-193 (local-date normalization across task
and dashboard date surfaces) is no longer open — merged, see the full record further
below in this file and in `current-state.md`/`decisions.md`.

## 6. Current Jira states

This section is stale (predates CD-211 onward) — see `current-state.md`'s own "Jira
workflow states" section for the live picture. CD-193 specifically: `pending
deployment` (merged — see below), not `New`.

## 7. Current deployment state

**Not configured.** No hosting provider, no CI/CD, hosted Supabase exists and is live. Full audit: `deployment.md`. Don't assume anything is publicly reachable.

## 8. Important architectural decisions

See `decisions.md` in full. The ones most likely to trip up new work: the locked hierarchy has no Subtask level; "Service" is the only visible term ("Workstream" is internal-only); global staffing never implies Project-level authority; Comments is the one canonical discussion mechanism; Team Activity merged UI only, not the underlying `daily_updates`/`time_entries` models; local-date handling must use `planner-dates.ts`, never raw UTC slicing.

## 9. Data-provider architecture

Every domain is accessed through a provider interface (`src/lib/data/providers/<domain>-provider.ts`), selected between a mock and a Supabase implementation by `NEXT_PUBLIC_DATA_PROVIDER` (`mock` / `supabase-auth` / `supabase-core` / `supabase`). Full detail + diagram: `architecture.md`.

## 10. Roles/permissions summary

Three roles: Employee, Team Lead (`supervisor` in code), Admin (`superadmin` in code). The recurring pattern: Admin sees everything; Team Lead sees self + direct reports (`managesUser`, a plain org-chart relationship); Employee sees only their own. Full function-by-function catalog: `authorization.md`.

## 11. Database/Supabase state

Hosted Supabase is real and live. `main` is fully compatible with it — CD-190 added zero migrations, and CD-162's migrations (including two with misleadingly-stale "not yet applied" headers) are confirmed applied. Full detail: `data-and-supabase.md`.

## 12. Important migrations

Full chronological table with one-line purpose each: `data-and-supabase.md`. The ones most relevant to recent work: `20260908090000_task_status_model_phase1.sql` (current Task status model), `20260908130000_remove_subtask_architecture.sql` (Subtasks fully removed), `20260908150000_restore_project_status_lifecycle.sql` (current Project status model), `20260910090000_employee_service_activity_authorization_parity.sql`, `20260911090000_workstream_lifecycle_and_duplicate_prevention.sql`, `20260911100000_archived_workstream_task_guard.sql` (the three most recent, all applied to hosted).

## 13. Local development commands

```bash
npm install
cp .env.example .env.local   # fill in real values, never commit
npm run dev
```

Full detail (including provider-specific setup): `development.md`.

## 14. Validation commands

```bash
npx tsc --noEmit
npm run lint
git diff --check
NEXT_PUBLIC_DATA_PROVIDER=mock npm run build
NEXT_PUBLIC_DATA_PROVIDER=supabase-auth npm run build
NEXT_PUBLIC_DATA_PROVIDER=supabase-core npm run build
NEXT_PUBLIC_DATA_PROVIDER=supabase npm run build
```

Plus manual role-based QA (Admin/Team Lead/Employee, mobile, console-clean) — see `testing.md`.

## 15. Important routes

Full table: `architecture.md`. Everything authenticated lives under `/dashboard` (one shared auth-guarded shell). The two most recently-changed: `/dashboard/team-activity` (merged Team Updates+Time) and the two legacy redirects that point to it.

## 16. Known gotchas

Full list: `troubleshooting.md`. Read it before touching: date/time handling, the mock provider's reset-on-reload behavior, migration file headers, or anything involving "Global Team Lead"/"Works In Services" vs. Project-level staffing.

## 17. Files to read first (in a fresh clone, before writing any code)

1. `docs/README.md` — this index
2. `docs/current-state.md` — what's true right now
3. `docs/domain-model.md` + `docs/authorization.md` — the two files that prevent the most common mistakes
4. `src/lib/data/permissions.ts` — the actual authorization source of truth
5. `src/lib/data/provider-mode.ts` + `src/lib/data/providers/index.ts` — how data access is wired
6. `src/lib/planner-dates.ts` — before writing any date-handling code

## 18. What NOT to change casually

- Don't reintroduce a Subtask concept, a standalone Planner nav item, separate Team Updates/Team Time pages, or the pre-consolidation Project tab list — all were deliberately removed/merged.
- Don't widen `managesUser`/role-check logic without re-reading `authorization.md` — the three-tier visibility pattern is load-bearing across the whole app.
- Don't write a new "what day is this" check with raw `.toISOString().slice(0, 10)` — use `planner-dates.ts`.
- Don't apply a migration to hosted Supabase without explicit verification afterward (parity check, and ideally a rollback-only proof of the new guarantee) — there's no CI safety net.
- Don't add `Co-Authored-By` (or any) AI attribution to a commit.
- Don't stage `.claude/settings.local.json` or `references/` — standing local-only exclusions.
- Don't assume the app is deployed anywhere, or that merging to `main` does anything beyond updating the repo.

## 19. Next recommended work

1. **A hosting decision** for the frontend, followed by a first real deployment and production verification (`deployment.md` has the smoke test). This is the actual current bottleneck — every merged ticket is otherwise done, including CD-193 (local-date normalization, merged — see `current-state.md`/`decisions.md`).
2. Two smaller, non-urgent items surfaced during recent audits, worth a look whenever someone's in that area: the `Project.status === "completed"` code/comment disagreement, and the `canConfigureWorkstreamActivities` app-layer/RLS parity gap (both in `troubleshooting.md`).
3. Project/contract-date provider parity (the mock-vs-hosted architecture divergence CD-193's own audit found and deliberately did not expand into) remains a genuinely open, not-yet-scoped question.

## 20. If you are a new developer, start here — checklist

- [ ] Read `docs/README.md`, then `docs/current-state.md`
- [ ] `npm install`, set up `.env.local` from `.env.example`
- [ ] `npm run dev` with `NEXT_PUBLIC_DATA_PROVIDER=mock` — log in with a quick-login button, click around as each role
- [ ] Read `docs/domain-model.md` and `docs/authorization.md` fully before writing code that touches permissions or the Project/Service/Task hierarchy
- [ ] Skim `src/lib/data/permissions.ts` and `src/lib/planner-dates.ts` directly — they're short enough to read in full and are the actual source of truth
- [ ] Before starting any ticket, check `docs/current-state.md` for what's already in flight
- [ ] Run the full validation suite (`docs/testing.md`) before considering any change done

---

## Continuation Context for a New AI/Chat Session

*Copy everything below this line into a fresh AI/coding-agent conversation to continue work on Corebridge X without replaying prior history.*

```
PROJECT: Corebridge X — internal Project Management/PSA web app for Croki Digital.
REPO: J-Chords/corebridgex-crm (GitHub). Local path convention: a Windows checkout, e.g. D:\corebridge-x.
STACK: Next.js 16.2.11 (App Router — has real breaking changes vs. older Next.js; check
  node_modules/next/dist/docs/ before assuming an API), React 19, TypeScript (strict),
  Tailwind CSS, Supabase (Postgres + Auth).

CURRENT MAIN HEAD: 997c3ce8bae10af859f20c4b525f0c3d9700d352 (re-verify — this drifts)

RECENTLY COMPLETED (merged to main):
- CD-162: Boss Feedback MVP Simplification (PR #1)
- CD-190: Merge Team Updates + Team Time into Team Activity, + a local-calendar-date
  time-entry stabilization fix (PR #2)
- CD-194: Technical documentation and developer handover (PR #3)
- CD-196: Clarify Dashboard and My Day information architecture, plus a Product
  Owner-approved polish pass (Team Workload layout fix, Services-inspired
  Notifications redesign, notification safe-routing fix) (PR #4)
- CD-205: Retire the legacy "Project Template" bundle architecture
  (project_templates/project_template_services/project_template_activities + their
  RPCs/triggers/RLS/grants + dead provider/hook/type source) at the schema and source
  level (PR #5). Hosted migration 20260921090000_retire_project_template_bundle.sql
  applied and independently re-verified live (object absence/presence, exact
  function-body match on admin_delete_activity/create_project/create_client_project,
  unaffected operational row counts). The separate, still-live Service-recipe system
  (templates/template_tasks/template_checklist_items, apply_template, Company-detail
  "Apply template") is explicitly preserved and confirmed unaffected.
- CD-206: Phase 1 Template workspace and terminology (PR #7, merge commit ab9aa8f).
  Visible product term for the Service catalog becomes "Template" (Admin nav + new
  /dashboard/admin/templates list/detail routes; Project-facing "Templates" tab with
  "Global Service Staffing" removed; Task List columns become Task/Priority/
  Project-Template/Start Date/Due Date, Assignee column removed; staffing terminology
  Employees->Members/Services Led->Templates Led/Works In Services->Works In
  Templates; Activity catalog "Suggested Tasks"->"Tasks"). service_lines/workstreams
  persistence and all authorization/RLS/RPCs are unchanged; no migration needed. The
  separate, still-live Service-recipe system (Company-detail "Apply template" and the
  Accomplishments Report's own unrelated "Add service" Activity-picker) is explicitly
  preserved and confirmed unaffected. Product Owner Try-It-Yourself review approved.
  See decisions.md's "Phase 1 — Template workspace and terminology" entry for full
  scope.
- CD-207: Phase 2 Project Overview redesign + KPI navigation (PR #9, merge commit
  997c3ce). One shared Overview structure for every role; locked 5-tile clickable KPI
  row (Templates/Open Tasks/Attention/Due/Members); Attention = deduplicated
  overdue-or-Waiting Tasks (Blocked excluded from this one KPI only, untouched
  everywhere else — Blocked exists globally, unchanged, and its retirement to Waiting
  remains Phase 5, not touched here); Due gets a Today/Week/Month period selector
  reusing planner-dates.ts; former "Project Details"/"Administrative Details" cards
  consolidated into one with zero field loss; a real Project tab/URL desync bug fixed;
  Projects list rows converted to real <Link> navigation. Permissions unchanged, no
  database migration. Product Owner manual review approved (2026-09-23). See
  decisions.md's "Phase 2 — Project Overview redesign + KPI navigation" entry for full
  scope.
CD-162, CD-190, CD-196, CD-205, CD-206, and CD-207 currently sit at "pending
deployment" (merged + validated, no hosting target exists yet to deploy to); CD-194 at
"Sign-off".

IN CODE REVIEW (implemented, hosted-verified, NOT merged):
- CD-208: Phase 3 Project creation + unified editing, on branch
  feature/CD-208-project-creation-unified-editing (based on main at 57021cd). Admin
  and Team Lead can create Projects (0/1/multiple canonical Templates, applied
  atomically); Project.ownerId is the Project-management authorization boundary
  (canManageProjectRecord/can_manage_project SQL function, app AND backend enforced —
  a Team Lead may only manage a Project they literally own; direct-report read
  visibility via canAccessProject is unchanged and stays broader); a Team Lead creator
  always becomes owner (server-forced, never client-chosen — not a new "Primary Team
  Lead" model, Phase 4 still owns that); Name/Partner Brand/Owner are protected after
  creation for Team Lead, Admin unaffected; canonical Template->Project application is
  a TRUE SNAPSHOT (Activity name/description/suggested Task titles freeze at
  application time — workstream_activities gained frozen columns; a later catalog
  edit no longer retroactively changes an existing Project); real Task rows are still
  never auto-materialized (confirmed pre-existing, preserved); Partner Brand is
  Project-specific (projects.partner_brand_id, independent of Company brandId, no
  ongoing sync); canonical Template Activities are Brand-independent
  (departments.brand_id nullable, was previously real structural coupling); a
  follow-up authorization-hardening migration closed 3 residual gaps where Service/
  Workstream mutation (create_project's member injection, create_workstream, the
  workstreams/workstream_activities RLS) was still gated by read-visibility
  predicates instead of the owner boundary.
  TypeScript/ESLint/git diff --check clean, all 4 provider builds pass. All 6
  migrations (20260924090000-20260924130000, plus 20260930160000 hardening) are
  applied to hosted Supabase — migration history and postflight data preservation
  verified. Committed and pushed; PR opened against main; Jira CD-208 moved to
  "Code review". A2/global Template cloning remains explicitly deferred within this
  phase. Not merged, not deployed. See decisions.md's Phase 3 entry for full scope
  before doing anything with this branch.

VERIFIED, AWAITING PRODUCT OWNER MANUAL QA (implemented and fully verified, not yet
reviewed/merged):
- Phase 4 (no Jira ticket yet, deferred pending Atlassian identity verification): on
  branch feature/phase-4-project-staffing-authorization, stacked on CD-208's
  checkpoint commit fda0cfe (PR #11 was still open when this began). Additional Team
  Leads (project_team_leads, dedicated relation, separate from project_members) get
  the same Project-management authority as the Primary Team Lead (Project.ownerId),
  except owner_id itself stays Admin-only; can_manage_project/canManageProjectRecord
  and the READ helpers (can_access_project/company/workstream) widened accordingly;
  new RPCs add_project_team_lead/remove_project_team_lead/add_project_member/
  remove_project_member/update_workstream_staffing, all Active-Project-only with
  direct-table RLS defense-in-depth (not just RPC-level); closed 2 residual gaps
  (canConfigureWorkstreamActivities app/mock parity, workstream_members_write RLS
  never updated since before Phase 3). Project Leadership/Members staffing UI AND a
  narrow "Manage Staffing" Workstream Lead/Team entry point (WorkstreamFormDialog's
  new staffingOnly mode, non-Admin TL only) are both done. THREE new local migrations.
  tsc/ESLint/git diff --check/all 4 provider builds all pass clean. Full interactive
  QA (Admin/Primary TL/Additional TL/non-project TL/Employee Member/lifecycle/
  regression) and a direct provider-call security test (9/9, bypassing the UI
  entirely) both passed — one real bug found and fixed: the Additional TL/Member
  candidate pickers inherited listAssignableStaff's RLS-backed team-scoping, which in
  this app's actual 2-Supervisor seed org meant neither Supervisor could ever add the
  other as Additional TL through the UI at all; fixed with a new, unscoped directory
  RPC (list_project_staffing_candidates). Not hosted-applied, not committed, not
  pushed, no PR, no Jira. See decisions.md's Phase 4 entry for full scope.

NEXT UP: Phase 3 (CD-208), Phase 4 (CD-211), Phase 5 (CD-214, Blocked -> Waiting status
retirement), Phase 6A (CD-215, Project contract-period data foundation), Phase 6B
(CD-216, contract renewal + Contract History UX), and CD-217 (Bug, out-of-phase —
System-B materialize_template_tasks() stale 'todo' status fixed to 'not-started', plus
Project-level Apply Template for Admin + Project-authorized Team Lead, plus an
apply_service_template_to_project merge-branch authorization gap closed) are all merged
to main (PR #11 merge commit cb3fe96, PR #12 merge commit 6ef8b7d, PR #13 merge commit
595af8c, PR #14 merge commit 56f6069, PR #15 merge commit 703ac94, PR #16 merge commit
22d95d58), Jira `pending deployment`. Current main is
22d95d584289dcd0eab6fe445f06283ea4800c6e. Template cloning (A2) remains deferred, no
ticket yet. See decisions.md's CD-217 entries and current-state.md for the full record.

CD-218 (Story, outside the numbered phase series) — Reusable Template authoring, the
first authoring path for System-B's templates/template_tasks/template_checklist_items
(previously genuinely "seed-only" — hosted `authenticated` grants were SELECT-only on
all three tables; CD-217's own audit found this) — is merged to main (PR #17 merge
commit 84197a6), Jira `pending deployment`. Current main is
84197a623c69de4fe8e27a4e5147f1742e2971c7. Hosted migration
20261006090000_recipe_builder_authoring.sql applied and postflight-verified (0 drift,
every grant/RPC/count confirmed). Product Owner functional QA and final
builder-layout UI both APPROVED. See decisions.md's CD-218 entries and current-state.md
for the full implementation/QA/postflight/merge record.

User-facing term "Reusable Template," authored FROM INSIDE the existing Template
detail page (/dashboard/admin/templates/[id]'s own new "Reusable Templates" section) —
NOT a separate top-level admin surface. **An earlier draft of this ticket built it as a
separate "Admin → Recipes" area (/dashboard/admin/recipes, user-facing term "Recipe");
the Product Owner reviewed and reversed that before it was ever committed. DO NOT
REINTRODUCE A SEPARATE "ADMIN → RECIPES" NAV ITEM OR ROUTE.** A Template
(service_lines row) can have 0..many Reusable Templates, linked via the pre-existing
templates.service_line_id; each Reusable Template is 0..many Template Tasks, each
0..many Checklist Items; V1 is Create/Edit/Active/Inactive, NO hard delete, no
move-to-a-different-parent action; the builder's own Step 1 never asks for a Service —
the parent Template is always already known from the page it was opened from. The
builder's own container is a centered Dialog (the project's existing FormDialog shell,
~960px desktop) — not a right-edge Sheet; a first draft used a narrow drawer and the
Product Owner corrected it before this checkpoint. The Project-level/Company-level
System-B application actions are labeled "Apply Reusable Template" (visible copy only
— ApplyTemplateDialog/apply_template/apply_service_template_to_project keep their
names). Global Reusable Template administration remains Admin-only throughout.

CD-193 (Task, out-of-phase) — normalize local-date handling across Task and Dashboard
date surfaces — is merged to main (PR #19 merge commit 6692e980), Jira `pending
deployment`. Current main is 6692e98018d540894a6b648e02630b4f75f56b44.
CD-190 fixed one instance (time-entry
bucketing) and tracked ~20 other known UTC-slice call sites as this ticket; a full
repository-wide audit (every toISOString().slice(0,10)-style call site, classified
A-local-bug/B-true-timestamp/C-already-correct/D-ambiguous BEFORE any code changed)
confirmed 20 real local-calendar-date bugs, all now fixed by reusing the EXISTING
todayDateOnly()/parseDateOnly() from planner-dates.ts — no new parallel date helper
introduced. Highest-leverage fix: task-display.ts's shared isTaskOverdue/
formatDueDateShort (used by 7+ Task surfaces: List/Board/Grid/Row/Properties-rail/
Summary-item/Drawer) plus the Task Center's own Overdue/Due-Today quick filters. Also
fixed: 3 Dashboard/My Day "today" helpers (2 files had already imported the correct
todayDateOnly for ONE purpose while keeping a broken local duplicate for another — a
real partial-fix-left-a-twin bug found by the audit), the Attention KPI and Upcoming
Deadlines card, both report-generation dialogs' default date range, Apply Template's
default start date, and 4 provider-layer "default to today" sites (Project task-summary
overdue counts + Workstream recurrence-anchor-date defaults, mock and Supabase sides
each, fixed symmetrically). One deliberately-separate true-timestamp system
(client-report-schedule-timing.ts — a schedule's own admin-configured timezone, read in
full and confirmed genuinely unrelated to "what day is it for the viewer") was
correctly left untouched. A Project completionDate mock-provider stamp was fixed
narrowly (same local-date bug) WITHOUT touching the separate, pre-existing mock-vs-
hosted architecture divergence in how that field gets stamped — that broader
Project/contract provider-parity question stays exactly as open as before, reported not
resolved. Implemented on branch fix/CD-193-local-date-normalization (fresh from
origin/main at 625dd827, PR #18's merge commit; branch retained after merge, per
standard convention — not deleted). tsc/ESLint/git diff --check/all 4 provider builds
clean (isolated copy D:\cbx-qa-cd193). Deterministic timezone QA (42/42 — separate
spawned processes with TZ set at spawn time: America/Los_Angeles, Pacific/Kiritimati,
and a DST-transition day in America/New_York) and a Playwright browser QA script (24/24
— page.clock.setFixedTime pinning the exact same UTC instant across two timezoneId
contexts, proving the identical Task due-date value is correctly classified Due Today
in one zone and correctly neither-due-nor-overdue in the other, directly in the live
Task Center quick filters and Task detail page styling; Team Lead/Employee regression
clean) both passed. Product Owner manual QA: APPROVED. Merged via a normal merge
commit (6692e98018d540894a6b648e02630b4f75f56b44, 2 parents: previous main
625dd8276dce0b9a3d23ddbf9658836795c33c30 and feature head
61ef9036c13a568ff9ade8cce752c42a0136f1db, independently verified as an ancestor of
main). Jira transitioned Code review → pending deployment. See decisions.md's CD-193
entry, testing.md (the two QA techniques are now the canonical pattern for any future
date-touching change), and troubleshooting.md's closed-out tracking note.

DOMAIN HIERARCHY (locked): Project → Template → Activity → Task → Checklist. Visible
term changed from "Service" to "Template" in Phase 1 (CD-206) — internal persistence
(service_lines/workstreams) and every route/RPC/RLS name are unchanged; only what a
user reads on screen changed. See domain-model.md.
No Subtask level exists — it was built, then deliberately fully removed. "Template" is
the only user-facing term; "Workstream"/"Service Line" are the internal/code names only (types, table
names, routes) — never write "Workstream" in UI copy.

"Reusable Template" (CD-218) is a SEPARATE user-facing term for System B's reusable
Task/Checklist bundle (templates/template_tasks/template_checklist_items) — never
confuse it with "Template" above. Admin -> Templates (/dashboard/admin/templates) is
the service_lines catalog; a Reusable Template is authored FROM INSIDE a specific
Template's own detail page (/dashboard/admin/templates/[id]'s "Reusable Templates"
section) — there is NO separate "Admin -> Recipes" surface and NO
/dashboard/admin/recipes route. An earlier draft tried that separate-surface shape; the
Product Owner reversed it. DO NOT REINTRODUCE IT. One Template can have 0..many
Reusable Templates (e.g. "Payroll" can have both "Payroll Client Onboarding" and
"Monthly Payroll Processing"), linked via templates.service_line_id. See
domain-model.md's "Reusable Template" subsection.

ROLES: Employee / Team Lead (code: "supervisor") / Admin (code: "superadmin"). Pattern:
Admin sees everything org-wide; Team Lead sees self + direct reports only (via
managesUser(), a plain org-chart relationship — supervisorId, NOT Project/Service
membership); Employee sees only their own records. Global "Services Led"/"Works In
Services" staffing (org-wide, per catalog Service Line) NEVER automatically grants
Project-level Service lead/team authority — that's always a separate, explicit
per-Project action. Full detail: docs/authorization.md, docs/domain-model.md.

TEAM ACTIVITY: /dashboard/team-activity (tabs ?view=updates / ?view=time) replaced two
old pages (Team Updates, Team Time — now 307-redirected here). This was a UI/navigation
merge ONLY — daily_updates and time_entries remain two fully separate models/tables.

TASK MODEL: statuses not-started/in-progress/waiting/completed/canceled (single-L).
Blocked was retired in favor of Waiting (Phase 5/CD-214) — a legacy "blocked" value may
still appear in stale client filter state and normalizes to "waiting" on read only, never
on write. Waiting requires a reason. Closed = completed or canceled. Checklist completion
can auto-complete/reopen a Task. No dedicated "reopen" action — just change status back.
Comments is canonical; Task Notes and Task Handoff authoring are both retired
(read-only history only).

PROJECT MODEL: statuses active/on-hold/completed/cancelled (double-L)/archived/trash.
isProjectActiveForNewWork() gates new-work creation; historical data always stays
readable. Archive and Trash are two distinct lifecycle actions with different
semantics — see docs/domain-model.md.

CONTRACT MODEL (Phase 6A/6B, CD-215/CD-216): Company contractStartDate (original
relationship start) and Project contractStartDate ("Client Since" - a distinct,
independent fact on a distinct table despite the identical column name) never advance on
renewal and are Admin-only to correct after creation. project_contract_periods holds the
authoritative, derived-never-stored "Current Contract"/"Upcoming"/"Past" state
(calendar-year periods, Dec 31-aligned). companies.renewal_date and
projects.contractMonths/contractEndDate are preserved but no longer authoritative.
Renewal (`renew_project_contract_period` — Admin-only, Active/On Hold lifecycle only,
both dates server-derived) records a successor of the current leaf period; a leaf may be
removed to correct a mistake (`delete_latest_project_contract_period` — a non-leaf can
never be removed directly) and a sole root's start may be corrected
(`correct_initial_project_contract_period_start` — rejected once any renewal history
exists). None of these are a lifecycle transition and none have any operational side
effect. See docs/architecture.md's "Contract / renewal information" section.

LOCAL-DATE RULE: never use new Date().toISOString().slice(0, 10) or
someTimestamp.slice(0, 10) to answer "what calendar day is this for the user" — that
reads the UTC date, which disagrees with local date near midnight in any non-UTC
timezone. Use src/lib/planner-dates.ts (todayDateOnly, dateKeyFromTimestamp,
localDayBoundsUtc, parseDateOnly). This exact bug was found and fixed in two passes:
CD-190 (one time-entry-specific instance) and CD-193 (merged — a repository-wide audit
and fix of the remaining ~20 call sites; see decisions.md's CD-193 entry). A fresh
repo-wide search should still find zero real occurrences of the anti-pattern (only
explanatory comments) — re-verify before assuming a NEW call site is already covered.

DATA PROVIDER ARCHITECTURE: every domain has a provider interface
(src/lib/data/providers/<domain>-provider.ts) with mock and Supabase implementations,
selected via NEXT_PUBLIC_DATA_PROVIDER (mock / supabase-auth / supabase-core /
supabase — see src/lib/data/provider-mode.ts for exact semantics of each). Mock data is
in-memory only and resets on reload — never edit mock/seed files to fake QA state, use
real UI flows in one continuous session instead.

DEPLOYMENT STATE: frontend hosting is NOT configured — confirmed by direct audit (no
CI/CD, no GitHub Deployments/Environments, no hosting config files anywhere). Hosted
Supabase (the database/auth backend) IS real and live. Don't assume the app is
reachable anywhere other than localhost.

GIT/JIRA WORKFLOW: Jira issue (project key CD) → feature/CD-###-slug branch →
implement → validate (tsc/eslint/git diff --check/all 4 provider builds) → role-based
QA (Admin/Team Lead/Employee + mobile + console-clean) → commit (feat(CD-###): ... /
fix(CD-###): ...) → push → PR → merge → Jira: Code review → End to end testing →
pending deployment → (Ready for demo → Sign-off, only once real deployment/demo has
actually happened — never claim these preemptively).

COMMIT ATTRIBUTION RULE (strict): never add Co-Authored-By: Claude, Co-Authored-By:
ChatGPT, or any AI/assistant attribution trailer to any commit. Human authorship only.

LOCAL-ONLY FILES — never stage/commit: .claude/settings.local.json, references/

FULL DOCUMENTATION: docs/README.md is the index. Read docs/current-state.md first for
anything that may have changed since this snapshot, then docs/domain-model.md and
docs/authorization.md before touching product logic or permissions.

IMMEDIATE NEXT MILESTONE: a hosting-provider decision + first deployment + production
verification (docs/deployment.md has the audit and a smoke-test checklist) — CD-193 is
merged and `pending deployment` like every other completed ticket (see above); no
ticket is currently in progress. Do not deploy or transition any ticket's Jira status
past "pending deployment" unless explicitly instructed to.
```
