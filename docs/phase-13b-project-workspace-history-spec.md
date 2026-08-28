# Phase 13B — Project Workspace History + Permanent Client Context

**Status: COMPLETE / ACCEPTED.** Redesigns the existing
`/dashboard/projects/[id]` Project workspace into the primary Employee/Supervisor operational
Client surface — no new route. Two migrations were ultimately required and are now hosted
(`20260827090000_task_start_date.sql`, `20260828090000_create_activity_for_workstream.sql`; both
local == remote, zero pending). Supersedes the earlier, rejected separate-Client-workspace attempt
(see `docs/phase-13-client-history-audit.md` Section 21). Accepted by the product owner after the
two pre-apply corrections in this document's own final section were reviewed and the Activity
migration was applied to hosted Supabase.

## Reference

`references/phase-13b/project-workspace-reference.png.png` (local-only design reference — never
staged/committed/pushed). The reference itself is a Projects **list** page with a right-hand
Gantt/calendar schedule; per instruction, only its visual language was translated (compact header,
five status summary blocks, thin borders, dense toolbar, grouped/dense list rows, compact
typography, understated icons, clear status color-coding) — not its literal content (it lists
Projects, our page is one Project's detail) and explicitly not its Gantt/calendar functionality,
which was intentionally omitted as irrelevant to Corebridge's actual requirements.

### Reference translation decisions

| Reference element | Corebridge translation |
|---|---|
| "Projects" title + "+ New Project" | Client name (small) + Project name (large) + status badge + "+ New Task" |
| 5 Project-status summary blocks (Not Started/In Progress/On Hold/Cancelled/Finished) | 5 **Task**-status summary blocks (Todo/In Progress/Blocked/Waiting/Done) — Corebridge's actual domain statuses, not the reference's own |
| Toolbar (Export/Bulk Actions/Search/View/Filter/⋮) | Search only, inside the Tasks tab — Export/Bulk Actions/Monthly View were not real Corebridge capabilities and were not invented |
| Status-grouped rows with a per-group calendar/Gantt header | Status-grouped rows using the **existing** `TaskListSection`/`TaskListRow` components (Phase 12B List view) — no Gantt/calendar row was built |
| Colored status icon tiles | Same tile shape, colors sourced from Corebridge's own `STATUS_COLOR_VAR` (existing semantic theme tokens via `color-mix(in oklch, ...)`), not the reference's hand-picked hues |
| Avatar-stack + tag pills per row | Not reproduced in the summary blocks (irrelevant here); avatar/assignee treatment inside the Tasks tab is whatever `TaskListRow` already renders, unchanged |

## Project-centric IA

Tabs: **Overview | Tasks | Services | Team | History** (History is the only addition). Same route,
same `[id]` param (Project id, unchanged). No `/dashboard/clients` route exists or was recreated.

## Project header

```
Alderleaf Consulting          [+ New Task]  [Renew]  [Edit]
2026 Accounting Services  [Active]
```
Client name (muted, small) above the Project name (large) + status badge. "+ New Task" appears
whenever the Project has at least one Service (identical gating to the pre-existing Company-page
"Add task" button — no new authorization). Renew/Edit stay Superadmin-only
(`canManageProjects`), unchanged from before.

## Five Task-status summary blocks

Always rendered above the tab strip (visible regardless of which tab is open), one per
`TaskStatus`, in `STATUS_ORDER` (todo → in-progress → blocked → waiting-on-client → done). Each
block: a small tinted icon tile (`Circle`/`PlayCircle`/`Ban`/`Clock`/`CheckCircle2`, colored via the
existing `STATUS_COLOR_VAR` map — the same source of truth every other status-colored element in
the app already reads from) + status label + count. Counts are a plain `reduce` over the
already-fetched Project Tasks (`useTasks({ workstreamIds })`, unchanged) — no new query. Responsive:
`grid-cols-2` → `sm:grid-cols-3` → `lg:grid-cols-5`, so it wraps cleanly on narrower widths instead
of the reference's fixed single row.

## Overview — simplified

**Removed from the primary Overview**: Contract Start, Contract End, Owner, and the Team member
count card. None of this was deleted from the data model — `Project.contractStartDate`/
`contractEndDate`/`ownerId` are untouched, still shown in the `ProjectFormDialog` (Superadmin edit
surface) and the Team tab (owner is flagged "(Owner)" in the member list) — just no longer
cluttering the operational Overview every Employee/Supervisor sees by default.

**Overview now contains**: an optional Description card (unchanged, only rendered when
`project.description` is set), the new **Client Context** section, and a compact **Current
Services** list (first 4, "View all" → Services tab). The five status counts are deliberately not
repeated here — they already sit above the tabs.

### Client Context (permanent Client Notes)

Reuses the **existing** Company-level Notes architecture exactly as-is:
`useCompanyNotes(project.companyId)` and `notesProvider.createCompanyNote(user, project.companyId,
input)` — the same hook/provider call `docs/phase-13-client-history-audit.md` Section 4 already
confirmed is RLS-safe for Employee/Supervisor (`can_access_company`, not Superadmin-restricted).
Rendered with the existing `NotesSection` component, retitled **"Client Context"** with description
copy *"Permanent context for this Client, shared across their Projects — not tied to this Project
alone."* — making the Client-not-Project scope explicit in the UI without changing
`NotesSection`'s internal behavior. Notes are stored with `companyId`, never `projectId` — verified
by reading `notesProvider.createCompanyNote`'s existing signature, which only ever accepts a
`companyId`. The same notes will appear on every year's Project for this Client (2025/2026/2027 all
call `useCompanyNotes` with the same `companyId`) with **zero duplication** — no new Note type, no
new table, no migration. Existing note types (Call/Meeting/Internal/Decision) are unchanged.

## Tasks tab — reuses the Phase 12B List view components verbatim

Not a new Task list design. Uses the same `TaskListSection`/`TaskListRow` (and `groupTasksBy`/
`filterTasks` from `use-task-filters.ts`) that `/dashboard/tasks`'s List view already uses:
- Same row density, typography, Priority badge, Service/Activity line, Due Date treatment
  (overdue in warning color), Assignee avatar stack, Task-click → full Task page, same
  mobile-stacked/desktop-grid responsive split, same dark-mode token usage — because it is the
  literal same component, not a reimplementation.
- Same status grouping (Todo/In Progress/Blocked/Waiting/Done, empty groups omitted — identical to
  Tasks Home's own behavior) via `groupTasksBy(filteredTasks, "status")`.
- Toolbar is intentionally smaller than the main Tasks page: **Search only** (scoped to this
  Project's own already-fetched Tasks via `filterTasks`) — no Filter/Views popover, no saved views,
  since the list is already narrowed to one Project and a full filter bar would be redundant here.
  "+ New Task" lives in the page header, not a second toolbar button.
- Each group's own "+" (add-task-to-this-status) control still works, wired to the same
  `TaskFormDialog` with `defaultStatus` — matching the main Tasks page's behavior exactly.

No Task authorization changed: assignment scope, self-assignment, checklist ADD/TOGGLE/REMOVE
permissions, time tracking, and one-level Subtasks are all untouched — this tab only changed what
component renders the same already-correctly-scoped `useTasks` result.

## Services tab — restyled denser, same data/authorization

Single dense list (was a 2-column card grid) — each row: Service name, a `Lead: X · N activities`
subline, an `N open` task count (derived client-side from the already-fetched Project Tasks, no new
query), and the status badge. The Project column from the earlier grid was dropped as redundant
(the whole tab is already scoped to this Project). Click → the existing
`/dashboard/workstreams/[id]` page, unchanged. Service→multiple-Activities and Task→exactly-one-
Activity are both untouched; "Add Service" keeps its existing `canCreateWorkstreamInProject` gate.

## Team tab

Unchanged — still its own tab, still the pre-existing member list/owner flag/role label rendering
and access rules. This is exactly why Owner/Team no longer needs to dominate Overview: it already
has a dedicated home.

## History tab — 13B foundation

**"Other Projects for this Client"**: every Project sharing the current Project's `companyId`,
excluding the current Project, from the **already role-scoped** `useProjects()` result — the same
hook and the same authorization the Projects list page (`/dashboard/projects`) already uses
(Employee: own; Supervisor: self + direct reports; Superadmin: all). Company-level access is never
used as a substitute — a Project only appears here if the viewer's own `useProjects()` call already
returned it, so an Employee cannot see a same-Client Project they don't otherwise have access to.
Each row shows name, contract period, and status; click → the existing `/dashboard/projects/[id]`.
The current Project is excluded entirely (not merely marked) from the list.

**Deliberately not built in 13B** (per instruction): completed-Task browser, Client Report history,
Time summaries, Visits, full Timeline. The tab is a single `flex flex-col` of `Card`s — later slices
add more Cards to the same structure without needing another redesign or route change:
- **13C** adds a Completed Work card and a Client Reports card.
- **13D** adds a Time & Team Intelligence card (legitimate aggregates only — no raw coworker
  TimeEntry visibility broadening).
- **13E** adds a factual, paginated Activity Timeline card (no surveillance-shaped entries).

No empty placeholder cards were added for these now.

## Company admin boundary / Contacts exclusion

`/dashboard/companies`, `/dashboard/companies/[id]` are completely untouched — still
Superadmin-only, Contacts included. No sidebar Client item, no `/dashboard/clients` route exists.
The Project page imports no Contacts component and calls no Contacts provider method — Contact
name/phone/email/administration appear nowhere on this page.

## Responsive / dark mode

Five status blocks: `grid-cols-2` (mobile) → `sm:grid-cols-3` → `lg:grid-cols-5` (matches the
reference's single desktop row while wrapping cleanly narrower). Tab strip: `flex-wrap`-safe
container, same pattern as the unchanged header row. Tasks tab: identical mobile/desktop split
already proven on `/dashboard/tasks`. Client Context: `NotesSection`'s existing responsive
Card/Textarea/list layout, unchanged. All new markup uses existing semantic tokens
(`text-muted-foreground`, `var(--info)`/`var(--destructive)`/etc. via `STATUS_COLOR_VAR`,
`bg-card`, `border`) — no hardcoded colors, so dark mode requires no additional work.

## Provider / backend decision

No provider-interface change, no RLS/RPC change, no migration. Confirmed by construction: every
hook used (`useProject`, `useWorkstreams`, `useTasks`, `useCompany`, `useCompanyNotes`,
`useRunningTimer`, `useProjects`) already existed and was already used elsewhere in the app with
identical scoping semantics. One implementation-only correction was made to avoid a **latent crash
risk**, not a backend change: the page was split into an outer wrapper (owns only `useProject`) and
`LoadedProjectDetailPage` (mounted only once a real Project exists), so `useCompanyNotes` never
runs with an empty `companyId` during the loading window — the Supabase Notes provider has no
empty-id guard (unlike `getCompany`/`getWorkstream`/`getTask`, which do, from the Phase 11
empty-UUID fix), because no caller had ever passed one before. This is a page-component
restructuring using the codebase's own established Rules-of-Hooks-safe pattern, not a provider
change.

## Files changed (first pass)

- `src/app/dashboard/projects/[id]/page.tsx` — full redesign (this document).
- `docs/phase-13b-project-workspace-history-spec.md` — new (this file).
- `docs/current-project-state.md` — updated.

---

## Second pass — Projects index redesign, real Gantt, operational naming cleanup

Two product decisions superseded parts of the first pass, both still within Phase 13B (13C has
not started):

### 1. Naming decision — Project is the sole operational identity

**Decision**: Employee/Supervisor-facing UI must never present a "Client → Project" two-level
mental model. Project is the operational identity; Company stays the internal/permanent
administrative master underneath it, exactly as before — only the *user-facing wording* changed,
nothing in the data model, provider, or types.

Changes made, all presentation-only:
- **Project detail header**: removed the separate `project.companyName` line that sat above the
  Project name — the header now shows only Project name + status badge (+ actions). The
  `companyName` field itself is untouched on `ProjectWithRelations`; it's simply no longer rendered
  as a second identity line. (It's still used internally for search-matching on the Projects index,
  unchanged.)
- **"Client Context" → "Permanent Context"**: same section, same component (`NotesSection`), same
  underlying data call (`useCompanyNotes(project.companyId)` /
  `notesProvider.createCompanyNote(user, project.companyId, input)`) — only the title and
  description copy changed, to *"Shared permanent context available across related Projects."*
  Storage is still keyed by `companyId`, never `projectId` — confirmed unchanged by reading the
  same provider call signature used in the first pass.
- **"Other Projects for this Client" → "Related Projects"**: same section, same
  `useProjects()`-sourced, already-role-scoped `relatedProjects` list, same exclusion of the
  current Project, same authorization (a Project appears only if the viewer's own role-scoped
  Project list already contained it — Company access is never used to bypass Project
  authorization). Only the card title and empty-state copy changed.
- No database table, RPC, RLS policy, or TypeScript model/type was renamed. `companyId`,
  `Company`, `CompanyWithRelations`, `companiesProvider`, etc. are all untouched.

### 2. Product decision — reproduce the reference's Gantt too, with real data only

The first pass deliberately excluded the reference's Gantt/calendar as irrelevant. That decision
was reversed for `/dashboard/projects` specifically (not the per-Project Tasks tab), **provided it
uses genuine existing scheduling data — never fabricated dates**.

#### Scheduling audit (Part A), performed before writing any Gantt code

| Question | Finding |
|---|---|
| Project date fields | `contractStartDate: string \| null`, `contractEndDate: string \| null`, `contractMonths: number` (default 12) — `src/lib/data/types/project.ts`, migration `20260815090000_projects.sql` |
| Exact DB shape | Postgres `date` columns (`contract_start_date date null`, `contract_end_date date null`), with a check constraint `contract_end_date >= contract_start_date` when both are set |
| Nullable? | Both start and end are independently nullable — a Project "with no reliable historical contract date" legitimately has `null` (per the type's own doc comment: "never fabricated") |
| Business semantics | The real annual/engagement contract period — genuine start/end dates, not a UI-only convenience. `contractMonths` is a forward-looking *suggestion* input only (used to compute a suggested end date in the edit form); it is never itself rendered as a duration and never overrides a manually-set `contractEndDate` |
| User-editable today? | Yes — `ProjectFormDialog` (Superadmin-only, `canManageProjects`) has direct `<input type="date">` fields bound to `form.contractStartDate` and `form.contractEndDate` independently; `contractMonths` only offers a one-click "use suggested end date" convenience, it doesn't compute `contractEndDate` automatically on every change |
| Enough for a duration bar? | **Yes** — both fields already exist, are real, nullable-safe, and already validated (`end >= start`) at the database level |
| Task scheduling fields | `Task.dueDate: string \| null` only (`src/lib/data/types/task.ts`) — no start date, no separate range field of any kind |
| Task Gantt Rule consequence | A due date alone cannot justify a duration bar — **no Task Gantt bars were built**, anywhere, including inside the per-Project Tasks tab (which still renders via the unmodified Phase 12B List components) |
| Workstream scheduling fields | `startDate`/`endDate` exist (`src/lib/data/types/workstream.ts`, `endDate` labeled "Renewal date") — out of scope for this pass (the Gantt requested is the **Projects list**, not Services) |
| Project status enum | Exactly four values: `"active" \| "on-hold" \| "completed" \| "cancelled"` (`ProjectStatus`, `src/lib/data/types/project.ts`) — confirmed via `project-status-badge.tsx`'s own `PROJECT_STATUS_META`. **Four summary blocks were rendered, not five** — no status was invented to match the reference's own five-block Project-status layout |
| Existing date/calendar helpers | Yes — `src/lib/planner-dates.ts` (`parseDateOnly`, `formatDateOnly`, `addDays`, `startOfMonth`, `formatMonthLabel`), already the app's single date-only arithmetic source of truth (Planner/My Day). Reused directly for the Gantt's month grid and navigation; no second date-math implementation was written |

**Result: the Gantt gate passed on real, already-existing, already-editable data. No schema,
migration, RLS, RPC, or provider-interface change was made or needed.**

#### Projects index (`/dashboard/projects`) — full redesign

Previously a flat searchable table (Project+company subtitle, Services badges, Contract period,
Owner, Status, Progress, Open tasks, Overdue). Now, translating Reference 1's structure onto real
Corebridge data:

1. **Header**: "Projects" + role-scoped subtitle + Superadmin-only "+ New Project" (unchanged gate).
2. **Status summary strip**: one compact block per real `ProjectStatus` value (4, not 5) — small
   tinted icon tile (`PlayCircle`/`PauseCircle`/`CheckCircle2`/`Ban`) + label + count, colored via
   a new `PROJECT_STATUS_COLOR_VAR` export on `project-status-badge.tsx` (mirrors Task's own
   `STATUS_COLOR_VAR` pattern exactly — same `--success`/`--warning`/`--info`/`--destructive`
   tokens `ProjectStatusBadge` itself already renders with, no new color invented).
3. **Toolbar**: Search (matches Project name and Company name, unchanged from the prior page) +
   a month-navigation control (prev/label/next) for the Gantt. No Export/Bulk Actions/extra Filter
   were added — none exist as real capabilities on this page.
4. **Status-grouped list**: one collapsible section per non-empty status (same
   chevron/dot/label/count visual language as the Tasks List's own `TaskListSection`), each
   containing:
   - **Left**: Project | Services | Open Tasks | Team — no separate Company/Client column, no
     Contract Start/End/Owner columns (still available via "Edit Project"), no fabricated Tags.
     Every value is already on `ProjectWithRelations` (`workstreamCount`, `tasks.openCount`,
     `memberCount`) — no new query.
   - **Right**: the real, read-only Gantt — a day-number header row for the selected month, then
     one row per Project with either a clipped, status-colored duration bar (built from
     `contractStartDate`/`contractEndDate`) or a subtle **"No schedule"** label when either date is
     missing. The timeline area scrolls horizontally on its own (`overflow-x-auto`), independent of
     the left column, so laptop/tablet widths never squeeze 28–31 day-columns unreadably; on narrow
     viewports the two areas stack (`flex-col sm:flex-row`) instead of compressing side by side.
5. **Month navigation**: local `monthCursor` state, defaulting to `startOfMonth(new Date())` — the
   *current* month, never a hardcoded date. Stepping recomputes the day count (28–31) via a plain
   `new Date(year, month+1, 0).getDate()` and rebuilds the day array with `addDays`.
6. **Clipping/missing-date behavior** (`computeBarRange`): pure `YYYY-MM-DD` string comparisons
   (both fields are already plain date-only strings end to end, confirmed via the mock seed data
   and the native `<input type="date">` binding — never parsed through `Date`/ISO-timestamp math,
   avoiding any DST/timezone edge case). A Project whose real range doesn't overlap the visible
   month renders no bar at all in that month (correct — not the same as "missing dates"); a Project
   missing either date renders the "No schedule" label, never a fabricated bar.
7. **Read-only**: no drag, no resize, no dependency lines, no milestone engine — a bar's only
   interaction is click-to-navigate (`onOpenProject`, same as clicking the row itself) →
   `/dashboard/projects/[id]`. No new intermediate route.

#### Project detail (`/dashboard/projects/[id]`) — second-pass polish only

The first-pass architecture (Overview/Tasks/Services/Team/History tabs, five Task-status summary
blocks, shared Task List components, dense Services, Company-level Permanent Notes,
role-scoped Related Projects) is **fully preserved** — only the naming cleanup in Section 1 above
was applied on top of it. No Gantt was added to the Project detail page or its Tasks tab — the
Task Gantt Rule keeps that tab exactly as the first pass left it.

## Files changed (second pass)

- `src/app/dashboard/projects/page.tsx` — full redesign (status strip, toolbar, status-grouped
  list, real Gantt).
- `src/components/projects/project-status-badge.tsx` — added `PROJECT_STATUS_COLOR_VAR` export
  (renamed the existing file-local `STATUS_META` to the exported `PROJECT_STATUS_META` so the
  Projects index can reuse the same status labels `ProjectStatusBadge` already uses; no behavior
  change to the badge itself).
- `src/app/dashboard/projects/[id]/page.tsx` — naming cleanup only (Section 1 above); no structural
  change beyond the first pass.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.

## Deferred (not built in 13B)

Per the locked sequence: 13C (Project Completed Work + Client Report History), 13D (Safe Project
Time + Team Intelligence), 13E (Project Operational Timeline, no surveillance-shaped entries). The
Projects-index Gantt could later extend to Services (Workstream already has `startDate`/`endDate`)
or gain a Task deadline-marker (not a duration bar) from `dueDate` — neither was requested or built
in this pass.

---

## Final correction pass — Gantt fix, Shared Notes, Team avatars, Service redesign, sidebar, Internal/Non-billable audit

### Sidebar "CLIENT WORK" decision

The sidebar section heading **stays "Client work"** — explicitly re-approved, not renamed. Only
the wording *inside* the operational workflow (Project detail's own copy) was ever in scope for the
"avoid Client/Project dual terminology" rule; the sidebar's own section label was never part of
that rule and required no change.

### Gantt date-field re-audit (Part B) — confirmed, not blindly assumed

Re-inspected `src/lib/data/types/project.ts`, `ProjectFormDialog`, both Projects providers, and the
`projects` migration a second time, specifically checking for a reason the second pass might have
been wrong:
- Fields are exactly as first documented: `contractStartDate`/`contractEndDate` — real, nullable,
  independently user-editable Postgres `date` columns, `end >= start` DB-checked.
- `ProjectFormDialog`'s actual field labels are **"Contract start," "Duration (months)," "Contract
  end"** (`project-form-dialog.tsx:300,309,319`) — both dates are directly editable inputs, not
  read-only/computed; "Duration (months)" only offers a one-click "use suggested end date" helper,
  it never silently overwrites a manually-set end date.
- **Start/Due terminology decision**: NOT relabeled. `contractStartDate`/`contractEndDate`
  represent a Project's real annual **contract/engagement period** — a legal/business window with
  a beginning and an end — not a single task-like deliverable deadline. Calling `contractEndDate`
  "Due Date" would misrepresent it (a Project doesn't have one thing "due" on that date; it's when
  the engagement itself ends or renews). The existing "Contract start"/"Contract end" labels are
  already semantically accurate and were left unchanged, per the explicit instruction not to call a
  contract renewal date a task-like due date unless the semantics genuinely support it — they don't
  here.

### Bar-visibility root cause (Part E) — found via code review, not guesswork

**The bug was real and was in the code, not the data.** `computeBarState` (then `computeBarRange`)
returned a single `null` for two different situations: (1) the Project genuinely has no
`contractStartDate`/`contractEndDate`, and (2) the Project has real dates that simply don't overlap
the currently-selected month. Both rendered identically as **"No schedule."** Any real,
fully-dated Project whose contract period didn't happen to include the calendar month the page
defaulted to (the current month) was indistinguishable from a Project with no schedule at all —
exactly the symptom reported ("no visible bars," "out-of-range Projects incorrectly display 'No
schedule'"). This was traced by re-reading `computeBarRange` line by line against known seed
values, then confirmed live: launched the app locally in `mock` provider mode (this session had no
credentials for the real hosted `supabase` project the committed `.env.local` points at, and no
`db dump`/`psql` access to inspect its live rows directly — Docker is unavailable in this sandbox,
per the same constraint noted in earlier phases; `mock` mode's seeded, non-fabricated fixture data
was used purely to exercise the real code path with known real values), logged in via mock
quick-login, and screenshotted `/dashboard/projects`. Before the fix, every Project — including
ones with genuine, non-overlapping-with-August-2026 date ranges — could only ever show a bar or
"No schedule," with no third state. After the fix (`BarState` now a tagged union of `"bar"` /
`"no-schedule"` / `"out-of-range"`, only the first two ever render anything), the same seeded data
showed real colored bars for Projects whose contract periods cover August 2026 (Alderleaf,
Brightwell — full-width bars; Cinderpoint — a correct one-day sliver bar, since its contract ends
2026-08-01), and "No schedule" only for the two Projects with genuinely null dates (Dunmore & Vance
LLP, Internal/Non-billable). No fake dates, durations, or Task spans were introduced anywhere —
confirmed by re-reading the final diff.

A second, smaller visual bug was found and fixed during the same verification pass: the
"No schedule" label was centered across the Project's *entire* underlying scrollable month width
(`absolute inset-0` inside a `days.length * DAY_WIDTH`-wide container), so for a month wider than
the visible timeline column it rendered off-screen to the right whenever the view was scrolled to
its default position (day 1). Fixed by pinning it near the row's own left edge
(`absolute left-2`, vertically centered) instead of centering it across the full scroll width —
confirmed visible in both the initial screenshot (bug) and the corrected one (fix).

### Gantt redesign (Parts C, F, G)

- **Month header now lives inside each status group's own timeline column** — a fixed
  prev-arrow/"Month Year"/next-arrow row directly above the scrollable day grid, inside the same
  bordered timeline area, not a page-level toolbar control. One shared `monthCursor` state (lifted
  to `ProjectsPage`) drives every group's header simultaneously — moving the month in one group's
  control moves all of them, since they render the same state. The page-level toolbar now holds
  only Search.
- **Day cells are two-line** (`Mon` / `01`-style, real `Date.toLocaleDateString(..., {weekday:
  "short"})` + zero-padded day number), with a subtle `bg-muted/30` weekend tint and a `border-r` on
  every cell (in both the header row and every Project's bar row) for real vertical grid lines —
  the day header and every bar row render the identical fixed-width day-cell strip, so grid lines
  and bars/labels align exactly. Day-column width increased 28px → 34px to comfortably fit the
  two-line weekday+day label.
- **Team column** now shows up to 3 member avatars (`Avatar`/`AvatarFallback`, the same initials
  helper every other avatar stack in the app uses — no new avatar data model, no real photo-URL
  support exists anywhere in the app to prefer over it) with a `+N` overflow chip, replacing the
  previous plain member-count number — matches the reference's avatar-stack treatment.
- Bar rules implemented exactly as specified: clipped left/right at month boundaries, a same-day
  Project renders a minimum-width one-day bar (`Math.max(bar.span * DAY_WIDTH - 4, DAY_WIDTH - 4)`),
  vertically centered, rounded, status-tinted via `PROJECT_STATUS_COLOR_VAR`, shows the Project name
  when width permits (native text clipping via `overflow-hidden` + `whitespace-nowrap`), carries a
  `title` attribute with the full name and exact date range, and is a real `<button>` that navigates
  to `/dashboard/projects/[id]` on click — same target as clicking the row itself. Still fully
  read-only: no drag, resize, dependencies, or milestone concepts were added.

### Team avatars / Projects list columns (Part G)

Confirmed unchanged from the second pass otherwise: **Project | Services | Open Tasks | Team** — no
Client/Company column, no Contract Start/End/Owner columns, no fabricated tags.

### Project detail (Parts H–J)

- **"Permanent Context" → "Shared Notes"** — the final wording. New `SharedNotesSection` component
  (`src/components/notes/shared-notes-section.tsx`) replaces the (still-existing, unchanged)
  `NotesSection` on this page only. Same underlying architecture — `useCompanyNotes(project.
  companyId)` / `notesProvider.createCompanyNote(user, project.companyId, input)`, storage still
  keyed by `companyId`, never `projectId` — the new component only changes presentation:
  - **Notes exist**: a compact bordered block, not a large Card — latest 3 notes shown (author
    avatar, name, `NoteTypeBadge`, short date, 2-line-clamped body), a "View all N notes" toggle
    when there are more, and a small "+ Add note" button that reveals an inline composer (same
    note types: Call/Meeting/Internal/Decision) only when clicked.
  - **No notes yet**: renders *only* a single-line "+ Add shared note" text action — no card, no
    border, no empty-state illustration — so an Employee who's never used this feature loses zero
    vertical space to it.
  - Copy: *"Shared notes available across related Projects."* — no "Client" wording anywhere in the
    component.
- **Team tab**: unchanged in substance, tightened — `size-7` ring-bordered avatars, `gap-2.5`,
  `Separator`-divided rows (matching the row treatment already used elsewhere on this page) instead
  of a plain stacked list. Owner flag preserved. No permission change.
- **Header**: unchanged from the naming-cleanup already done in the second pass (Project name +
  status badge only, no separate Client-name line) — re-verified still correct.
- Tabs, five Task-status summary blocks, the shared Task List components in the Tasks tab, dense
  Services, and role-scoped "Related Projects" in History are all **unchanged** from the prior
  pass — re-verified against the current file, nothing regressed.

### Service/Workstream redesign (Part K)

**Audit findings before editing** (`src/app/dashboard/workstreams/[id]/page.tsx`, prior state):
header showed Service name + status + a Brand badge; a 2-column "Overview" Card exposed **Company**
(linking to the Superadmin-only Company admin page), **Service** (service line name), **Start
date**, **Renewal date**, and **Progress**; a separate "Team" Card (Lead + members); a "Time vs.
Budget" Card; then "Activities" (`WorkstreamActivityTasks`, a role-aware My-Work/Team-Work/Other-
Activities sectioning built on `TaskRowList`/`TaskRow` — a third, older Task-row visual style,
distinct from the Phase 12B List view's `TaskListRow`).

**Changes made, all UI-only, no data/authorization change:**
- Header simplified: dropped the Brand badge (configuration metadata with no daily-work value);
  kept Service name + status + the existing canManage-gated Generate-occurrence/Edit actions.
- Added a subtle Project-context line (`Building` icon + `useProject(workstream.projectId)`'s
  name, linking to `/dashboard/projects/[id]`) — replacing the old Company-link Overview field.
  This does not introduce a Client/Company identity hierarchy; it's the same "Project as the
  operational anchor" pattern used on the Projects index and Project detail pages.
- Removed from the primary Overview: **Company** (redundant with the new Project line; Company
  admin stays reachable only via the Superadmin-only pages), **Start date**/**Renewal date**
  (contract-like, low daily value — both still fully editable and visible in "Edit workstream,"
  nothing deleted from the data model or weakened for Superadmin). Replaced with a compact 2-up
  row: a `size="sm"` Progress card (`ChecklistProgress`, unchanged data) and a `size="sm"` Team
  card (compact avatars, same Lead/member data).
- **Activities**: `WorkstreamActivityTasks`'s role-aware sectioning logic (My Work/Team Work/Other
  Activities, the actionable-status sort order) is entirely preserved — only its row-rendering
  internals changed. `TaskRowList`/`TaskRow` were replaced with the literal shared `TaskListRow`
  component (`src/components/tasks/task-list-row.tsx`) via a small local `ActivityTaskRows` helper,
  satisfying the "no third Task visual system" rule — Priority badge, Service/Activity line, due
  date, assignee avatars, and click-to-full-Task now render identically to the Project workspace's
  Tasks tab and Tasks Home. `WorkstreamActivityTasksProps` gained one new prop, `runningTaskId`
  (from `useRunningTimer()`, threaded from the page — the same running-timer awareness every other
  List-view surface already has), so the shared row's running-timer indicator works here too.
- **Time vs. Budget**: de-emphasized, not removed — moved to the bottom of the page (after
  Activities) and switched to a `size="sm"` Card. Still the same real, current, Task-derived budget
  rollup (`BudgetBar`) — nothing about this feature is "legacy"; it was kept exactly as
  functional, just lower-priority in page position.
- Verified live (mock-mode screenshot): the redesigned page reads as a genuinely operational
  Service workspace — Progress/Team at a glance, Activities with real `TaskListRow`s showing
  Priority/Service/Due date/Assignees, Time vs. Budget still present but unobtrusive at the bottom.

### Sidebar duplicate-tooltip fix (Part L)

**Root cause**: `AppSidebar` always renders `IconRail` regardless of expand state, and additionally
renders the full-label `NavPanel` when `state === "expanded"` — by design (the rail is meant as a
"quick global access" strip). But `RailButton` unconditionally wrapped every icon in a `Tooltip`,
so in expanded mode a user hovering the rail's "My Day" icon saw a tooltip repeating a label already
visible two inches away in the nav panel — the reported duplicate.

**Fix**: `RailButton` gained a `showTooltip` prop (default `true`); `IconRail` now receives
`showTooltips={state !== "expanded"}` from `AppSidebar` and threads it to every `RailButton`. When
`false`, the button renders without the `Tooltip`/`TooltipTrigger`/`TooltipContent` wrapper at all
— just the plain `Link`/`button` with its icon — while keeping its `aria-label` unconditionally, so
accessible-name behavior for assistive tech is unaffected either way; only the visible hover
tooltip is suppressed. Verified live: hovering the rail's "My Day" icon while the panel is expanded
now shows no tooltip popup (screenshot). Collapsed/icon-only rail mode is unaffected — tooltips
still show there, since `showTooltips` is only `false` while `state === "expanded"`. No sidebar
structure, mobile Sheet, or keyboard navigation was touched.

### Internal / Non-billable audit (Part M)

Full repository audit performed (constants, providers, migrations, UI surfaces) before considering
any change. Findings:

1. **What it is**: a permanently-seeded system "default bucket" — one Company (`is_internal`
   boolean column, unique-constrained to at most one row), with its own Project, Workstream
   ("Internal Operations," the only Workstream allowed a null service line), and Brand — not real
   client data.
2. **Why it exists** (quoting the codebase's own rationale, `src/lib/data/constants.ts`): *"The
   pseudo-company non-billable/internal work is logged against. Special-cased in permissions.ts so
   it's always selectable by every active staff member, without needing to be added to everyone's
   assignedCompanyIds."*
3. **Real, load-bearing dependency found**: per `docs/product-brief.md`, an Employee's **self-added
   Task creation** falls back to the always-available Internal workstream when they aren't
   currently staffed on any real client workstream — their *only* way to log a self-added task or
   time entry in that situation. TimeEntry billable-defaulting, and the Workstream-creation
   null-service-line exception, also key off it. Visit Entries and Client Report schedules
   explicitly *exclude* it already (by design, unrelated to this audit).
4. **Decision: NOT hidden from the normal Employee/Supervisor Projects list or selectors.** The
   audit's own instructions are explicit that a required dependency must not be removed blindly —
   this is exactly that case. Hiding the Internal Project from the Projects list/selectors would
   remove the only self-added-task fallback for an employee not staffed on a client workstream at
   the moment, breaking a real, working, currently-relied-on capability for no compensating
   benefit. No UI or backend change was made for this item.
5. **Meetings/calls**: no new special "internal work" subsystem exists or was created. A meeting or
   call for a real client already belongs, and continues to belong, to that client's real Project
   as a Task, an Activity-tagged Task, or a (now-renamed) Shared Note — exactly as the product
   direction asked. The Internal Project remains what it already was: a fallback bucket for
   genuinely non-client internal work (onboarding, admin, all-hands prep — its own seeded task
   examples), not a place meetings/calls should be redirected to.

### Files changed (final correction pass)

- `src/app/dashboard/projects/page.tsx` — `BarState` tagged union (fixes the no-schedule/
  out-of-range conflation), month header moved inside each Gantt timeline, two-line weekday/day
  header with grid lines and weekend shading, Team avatar stack, "No schedule" label repositioned.
- `src/components/projects/project-status-badge.tsx` — unchanged from the second pass (still
  exports `PROJECT_STATUS_COLOR_VAR`/`PROJECT_STATUS_META`).
- `src/app/dashboard/projects/[id]/page.tsx` — Shared Notes rename/compact component swap, Team tab
  polish.
- `src/components/notes/shared-notes-section.tsx` — new, compact Notes UI.
- `src/app/dashboard/workstreams/[id]/page.tsx` — header/Overview simplification, Project-context
  line, compact Progress+Team row, de-emphasized Time vs. Budget, `runningTaskId` threaded to
  Activities.
- `src/components/workstreams/workstream-activity-tasks.tsx` — row rendering switched from
  `TaskRowList`/`TaskRow` to the shared `TaskListRow` via a local `ActivityTaskRows` helper; gained
  a `runningTaskId` prop.
- `src/components/dashboard/app-sidebar.tsx` — `RailButton`/`IconRail` gained `showTooltip(s)`,
  suppressed in expanded mode.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.

### No-backend-change confirmation (Part O)

No migration, RLS policy, RPC, or provider-interface was created or changed anywhere in this final
correction pass. Every fix was either a pure rendering/logic correction inside an existing page
component (`page.tsx` files), a new presentation-only component (`SharedNotesSection`), a row-level
component swap that reused an already-existing shared component (`ActivityTaskRows`/`TaskListRow`),
or a sidebar interaction fix (`RailButton`). The Internal/Non-billable audit concluded with a
"keep as-is" decision, so it required no change at all.

---

## Final structural correction — Task Start Date, Task Timeline, Projects-index Gantt removal, single sidebar, Service redesign, Internal-Project hiding

This pass reversed a specific product decision (the Project-contract Gantt on `/dashboard/projects`
was the wrong Gantt) and made four further structural changes. It is the first Phase 13B pass to
touch the database schema — a genuine, narrow, **local-only, unapplied** migration.

### Task scheduling audit (Part A) — before writing any code

Re-inspected `src/lib/data/types/task.ts`, both Tasks providers, `create_task`/`create_subtask`,
`TaskFormDialog`, the full Task page, Planner, and Daily Updates:

1. **Existing Task scheduling fields**: `dueDate: string | null` only. No start/scheduled-range
   field existed anywhere on `Task`.
2. **`createdAt`**: purely creation metadata (when the row was inserted) — never planning data.
   **Not used as Start Date.**
3. **`statusChangedAt`**: purely workflow metadata (when `status` last changed, and by whom) — feeds
   the "who did what" attribution, unrelated to scheduling. **Not used as Start Date.**
4. **`create_task`/`create_subtask` RPCs**: both SECURITY DEFINER, both needed a new parameter to
   accept a Start Date at creation time (see Migration below). `update_task` is **not** an RPC —
   Task updates go through a direct `tasks` table `UPDATE` via PostgREST, gated by the existing
   `tasks_update` RLS policy (`can_edit_task`) — so updating `start_date` needed **zero** RPC/RLS
   change, only a new field in the existing update payload.
5. **Subtasks**: use the literal same `tasks` table/`Task` model (`parent_task_id` non-null) — they
   get the new optional field automatically via the same column; `create_subtask` needed the same
   new parameter as `create_task`.
6. **Templates**: `TemplateTask` only defines a due-date offset (`dueDaysAfterStart`), never a
   separate start offset — there is no legitimate data to derive a Start Date from for a
   template-generated Task, so those are created with `startDate: null` (never fabricated).
   "Generate next occurrence" **does** carry a real Start Date forward, when the source Task had
   one — it already had an established, deliberate "shift by the same recurrence interval" pattern
   for `dueDate` (`shiftedDueDate`); a `shiftedStartDate` twin was added, reusing the identical math,
   since carrying forward a Task's own already-real value by a real interval is not fabrication.
7. **Planner**: operates generically on `dueDate` only; unaffected, no change needed or made.

### Task Start Date (Part B) — new optional field

- **TypeScript**: `Task.startDate: string | null` (`src/lib/data/types/task.ts`), threaded through
  `TaskInput`/`SubtaskInput` (`tasks-provider.ts`), both providers' `createTask`/`updateTask`/
  `createSubtask`, and every existing call site that constructs one of those inputs (`TaskFormDialog`,
  `AddSubtaskDialog`, `task-checklist.tsx`'s edit-shim, `apply-template-dialog`'s generated tasks via
  `mock-templates-provider.ts`, `generate-occurrence-dialog.tsx`, `quick-add-from-activity-dialog.tsx`).
- **User-facing label**: "Start date," placed directly beside "Due date" in both `TaskFormDialog`
  and `AddSubtaskDialog`'s "Details" section — same compact `<input type="date">` treatment, no new
  section. `dueDate`/"Due date" is completely unchanged/unrenamed.
- **Validation**: both dialogs reject submission client-side with "Start Date must be on or before
  Due Date." when both are set and `startDate > dueDate` (plain string comparison — both are
  `YYYY-MM-DD`). The database also enforces this (see Migration).
- **Never auto-populated**: confirmed by construction — every non-user-facing creation path
  (templates, occurrence generation, quick-add-from-activity) either passes `null` or carries
  forward a genuinely pre-existing real value; nothing derives it from `createdAt`, `statusChangedAt`,
  or any status/timer event.
- **Existing Tasks**: the migration adds the column as nullable with no backfill — every existing
  Task (mock seed and hosted) keeps `startDate = null` until someone sets it directly. One mock seed
  Task (`task-2`, "Send monthly financial summary") was given an illustrative real
  `startDate`/`dueDate` pair for demoing the Timeline's duration-bar rendering — a real, deliberate
  demo value, not a blanket backfill.
- **Full Task page**: `TaskPropertiesRail` shows a "Start date" row **only when set** — no "Not set"
  placeholder wasting space (unlike "Due date," which always shows, matching its existing behavior).
- **Subtasks**: inherit the capability automatically (same `Task` model, same `TaskInput` shape,
  same form fields in `AddSubtaskDialog`) — no separate implementation.

### Migration — created, LOCAL ONLY, NOT applied to hosted Supabase

`supabase/migrations/20260827090000_task_start_date.sql`:
- `alter table public.tasks add column start_date date null;` + a column comment documenting the
  "never derived" rule directly in the schema.
- `alter table public.tasks add constraint tasks_due_after_start check (start_date is null or
  due_date is null or due_date >= start_date);` — same nullable-both-ends check-constraint shape
  already used for `projects.contract_start_date`/`contract_end_date`
  (`projects_end_after_start` in `20260815090000_projects.sql`).
- `create_task` and `create_subtask`: each **dropped and recreated** with one new parameter,
  `p_start_date date default null`, appended after the existing parameter list — the same
  drop-then-recreate convention this repository already uses for RPC signature changes (see
  `20260821180000_planned_client_visit_workflow.sql`'s `create_visit_entry`/`update_visit_entry`).
  **Every line of existing logic in both functions — the `can_access_workstream`/
  `can_access_task_directly` gates, the contextual-Activity-enable branch and its own authorization
  check, the Employee-self-only/Supervisor-own-team/Superadmin-any-active-user/silent-fallback-to-self
  assignee resolution, checklist insertion, `notify_task_created` — was copied verbatim, unchanged.**
  The only functional addition in either body is passing `p_start_date` into the single existing
  `insert into public.tasks (...)` statement. `revoke`/`grant` statements were reproduced identically
  (`revoke ... from public, anon; grant execute ... to authenticated, service_role;`), just updated
  to the new parameter-type list.
- `update_task`: **no RPC/RLS change** — confirmed and documented inline in the migration itself
  (Task updates are a direct, already-`tasks_update`-gated table `UPDATE`, unaffected by this
  migration).
- **HOSTED STATUS: NOT APPLIED.** No `supabase db push`, `migration up`, or any command touching the
  hosted `qxqxzuoaivyddwxqqoog` project was run. The file exists locally only, for review before any
  deployment decision.

### Task Timeline (Part C) — the Project Tasks tab's real Gantt

New `src/components/tasks/task-timeline.tsx`, wired into `/dashboard/projects/[id]`'s Tasks tab via
a compact `List | Timeline` switcher (default **List**, both a fresh page load and the global
`/dashboard/tasks` page are completely unaffected — that page's own List/Board switcher and its own
default were never touched).

- **List mode**: unchanged from the prior pass — the literal same `TaskListSection`/`TaskListRow`/
  `groupTasksBy`/`filterTasks`.
- **Timeline mode**: left columns are Task (+ its Service/Activity subline) / Priority / Assignee —
  no Client/Company/Project column (Project is already the page's own context). Right side is a
  real, read-only Gantt with its own month header (prev/Month Year/next) attached directly to the
  timeline, a two-line weekday+day header, vertical grid lines, weekend shading — visually
  consistent with the Projects-index Gantt's language, but now scheduling **Tasks**, not Projects.
- **Five bar states**, computed by `computeTaskBarState` from real `startDate`/`dueDate` string
  comparisons only:
  1. Both dates → a real, clipped duration bar (status-tinted, click → full Task).
  2. `dueDate` only → a small diamond deadline marker at that date (never a fabricated bar).
  3. `startDate` only → a thin start marker, no duration implied.
  4. Neither date → a subtle "No schedule" label.
  5. Real dates that don't overlap the selected month → **nothing rendered**, never "No schedule"
     (the same missing-vs-out-of-range distinction the Projects-index Gantt fix already established).
- Bars/markers are read-only: click navigates to `/dashboard/tasks/[id]`; no drag, resize,
  dependency, or milestone concept exists anywhere in the component.
- **Verified live** (mock-mode screenshot, Project "Alderleaf Manufacturing 2024-2025" → Tasks →
  Timeline): the one seeded Task with both dates renders a real clipped bar in August 2026; three
  Tasks with only a (now-past) `dueDate` correctly render nothing in that month, never "No schedule."

### Projects index — contract Gantt removed (Part D)

`/dashboard/projects` no longer has any Gantt/timeline column. Reverted to a dense, status-grouped
table: **Project | Services | Open Tasks | Team** (Team still the up-to-3-avatars-plus-"+N" stack
from the prior pass), the same 4-block real `ProjectStatus` summary strip, collapsible status
groups, search. The reasoning (restated from the correction prompt): Employees plan from Tasks, not
Project contract periods — the functional Gantt now lives one level down, on the Project's own Tasks
tab, scheduling actual Task work instead of a legal contract window.

### Internal/Non-billable Project — hidden from normal browsing (Part E)

**Read-model change, not a backend/RLS change**: `ProjectWithRelations` gained `isInternal: boolean`
— a straight, read-only exposure of the Company's own already-existing `companies.is_internal`
column (already selected via `select("id, name, is_internal")` in the Supabase provider's existing
company join; the mock provider computes it as `company.id === INTERNAL_COMPANY_ID`). No RLS policy,
grant, or access rule changed — this only makes an already-fetched fact visible to the client so the
UI can act on it.

- **Employee/Supervisor**: the Internal Project is filtered out of `/dashboard/projects` entirely —
  it never appears as an ordinary row, status count, or search result there.
- **Superadmin**: still sees it, visually distinguished — a muted row background and a small
  "System" badge next to its name — rather than presented as an ordinary customer Project.
- **Underlying fallback preserved, unaudited-and-untouched**: `INTERNAL_COMPANY_ID`/
  `INTERNAL_PROJECT_ID`/`INTERNAL_WORKSTREAM_ID`, the mock provider's always-visible special-casing
  in `visibleCompanyIds`, the Supabase `is_internal`-driven RLS behavior, and — critically — the
  Task/Workstream form selectors an unstaffed Employee relies on to self-add a Task at all, are all
  **completely unchanged**. Verified by inspection: `TaskFormDialog`'s workstream picker still
  sources from the full `useWorkstreams()` result, which still includes the Internal workstream;
  only the **Projects index browsing surface** was filtered, never the functional creation path.
- **Other surfaces audited, no change needed**: the command palette has no Project search category
  at all (only Companies/Tasks/Workstreams/Reports/People — unaffected); "Related Projects" (Project
  detail's History tab) only ever surfaces Projects sharing the *current* Project's `companyId`,
  which for any real client Project never includes the Internal Project (different company)
  regardless of any filtering; Planner has no Project-level filter/selector to audit. No data was
  deleted anywhere — this is presentation-layer filtering only, on top of already-correct
  authorization.

### Single collapsible sidebar (Part F)

`src/components/dashboard/app-sidebar.tsx`'s desktop rendering was rewritten from two side-by-side
sticky elements (a permanent icon rail + a separately-mounted wider nav panel) into **one**
`DesktopSidebar` component whose own width/content toggles between expanded (`w-60`, real text
labels, group headers, no tooltips) and collapsed (`w-14`, icon-only, tooltips, a thin divider
between groups instead of a text header). Collapsing/expanding now changes the *same* element in
place — no second panel ever mounts. Every destination (including Projects and Team Time/Updates,
which the old rail deliberately excluded) is reachable in both states. Mobile's single merged Sheet
(`MobileNavPanel`) is completely unchanged. **"Client work" stays the section heading, unchanged, in
both states** — explicitly re-approved, never touched. Verified live via screenshots: collapsed
state renders as one continuous icon column (logo, expand control, search, grouped icons, divider,
Settings/Help/avatar), and hovering an icon while collapsed shows its tooltip correctly.

### Service/Workstream page — second redesign (Part G)

**Problems from the first redesign** (per the user's screenshot): still too much empty whitespace;
an oversized Tasks-progress card and an oversized Team card sitting side by side; Activities nested
inside its own large wrapping Card, reading as another stacked dashboard widget rather than the
page's actual point.

**New structure**:
- **Header**: unchanged from the prior pass (Service name + status, Superadmin/Supervisor actions,
  Project-context line, qualifier/description/recurrence) — now additionally carries **Team as a
  compact inline metadata line** ("Lead: {name}" + up to 3 team avatars, `+N` overflow), replacing
  the old standalone Team card entirely.
- **Compact 4-block status strip** replaces the old Tasks-progress card: **Open / In Progress /
  Blocked or Waiting / Done**, counted directly from this Service's already-fetched Tasks (blocked
  and waiting-on-client intentionally merged into one bucket, matching the requested 4-block set) —
  same small-card treatment as the Projects index's own status strip, not a KPI card.
- **Activities is now the primary body**, rendered directly on the page (no wrapping `<Card>`) under
  a plain `ACTIVITIES` label + its existing "+ Add from activity"/"+ Add task" actions. Each
  Activity is still its own thin bordered section (`ActivityCard`, unchanged from the prior pass),
  and every Task row inside it uses the literal shared `TaskListRow` (switched in the prior pass) —
  so the page no longer reads as "a card containing a card."
- **Time vs. Budget**: hidden entirely for Employee; shown, compact, at the very bottom for
  Supervisor/Superadmin (`canManage` — the same predicate already gating Edit/Generate-occurrence,
  reused rather than adding a new role check). Still the same real, current, Task-derived rollup —
  nothing deleted, only visibility narrowed for Employee and position/size de-emphasized for
  Supervisor/Superadmin.
- **No admin metadata clutter**: Company/Brand/Start-Renewal-date remain absent from this page
  (already removed in the prior pass) — still fully present in "Edit workstream" for authorized
  roles, never deleted from the model.
- **Activity model unchanged**: Service → multiple Activities, Task → exactly one Activity — no
  schema touch.
- Verified live (mock-mode screenshot, "Accounting" service under Alderleaf Manufacturing): compact
  header with inline Lead+avatar, four small status blocks, Activities immediately below as dense
  bordered sections with real `TaskListRow`s, Time vs. Budget small and last.

### Files changed (final structural correction)

- `supabase/migrations/20260827090000_task_start_date.sql` — new, local/unapplied.
- `src/lib/data/types/task.ts` — `startDate` field.
- `src/lib/data/providers/tasks-provider.ts` — `TaskInput`/`SubtaskInput.startDate`.
- `src/lib/data/providers/mock/mock-tasks-provider.ts`,
  `src/lib/data/providers/supabase/supabase-tasks-provider.ts` — `startDate` threaded through
  create/update/createSubtask and the row mapper.
- `src/lib/data/providers/mock/seed-tasks.ts` — `startDate: null` added to every seed Task, one
  (`task-2`) given a real illustrative value.
- `src/components/tasks/task-form-dialog.tsx`, `src/components/tasks/add-subtask-dialog.tsx` —
  "Start date" field + validation.
- `src/components/tasks/task-checklist.tsx`, `src/lib/data/providers/mock/mock-templates-provider.ts`,
  `src/components/workstreams/generate-occurrence-dialog.tsx` (+ new `shiftedStartDate` helper),
  `src/components/workstreams/quick-add-from-activity-dialog.tsx` — every other `TaskInput`
  construction site updated.
- `src/components/tasks/task-properties-rail.tsx` — compact "Start date" row, shown only when set.
- `src/components/tasks/task-timeline.tsx` — new, the Task Timeline.
- `src/app/dashboard/projects/[id]/page.tsx` — List/Timeline switcher on the Tasks tab.
- `src/app/dashboard/projects/page.tsx` — Gantt removed, Internal Project filtering/badging.
- `src/lib/data/providers/projects-provider.ts`,
  `src/lib/data/providers/supabase/supabase-projects-provider.ts`,
  `src/lib/data/providers/mock/mock-projects-provider.ts` — `ProjectWithRelations.isInternal`.
- `src/components/dashboard/app-sidebar.tsx` — single collapsible `DesktopSidebar`.
- `src/app/dashboard/workstreams/[id]/page.tsx` — second Service-page redesign.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.

### Providers / RLS / migrations summary

**Migration**: created, local, **not applied**. **RPC**: `create_task`/`create_subtask` signatures
extended (one new, defaulted, backward-compatible-in-spirit parameter each), every authorization
check preserved verbatim. **RLS**: no policy created, dropped, or altered anywhere in this pass —
including for `start_date` updates, which ride the existing `tasks_update` policy unchanged.
**Provider interfaces**: `TaskInput`/`SubtaskInput` gained `startDate` (an additive, required field
on an existing interface — every implementation and call site was updated in the same pass);
`ProjectWithRelations` gained `isInternal` (additive, read-only). No provider method was removed or
had its behavior changed for any existing field.

---

## Pre-deployment review — migration security review, Priority signal-bar redesign, Internal-Project discovery cleanup

### Migration security review (Part B)

A full, line-by-line review of `supabase/migrations/20260827090000_task_start_date.sql` against the
immediately-previous canonical `create_task`/`create_subtask` definitions — not a summary pass.

**`tasks.start_date` DDL**: `alter table public.tasks add column start_date date null;` + `alter
table public.tasks add constraint tasks_due_after_start check (start_date is null or due_date is
null or due_date >= start_date);`. Verified against all five required cases: due-only Task (`start_date
is null` → true → passes), start-only Task (`due_date is null` → true → passes), neither date
(`start_date is null` → true → passes), same-day Task (`due_date >= start_date` → true, equal →
passes), and an invalid `start_date > due_date` pair (all three OR branches false → correctly
**rejected**). Every existing Task automatically has `start_date = null` the moment the column is
added (no backfill was written), so the constraint is trivially satisfied for 100% of existing rows
at migration-apply time regardless of their `due_date` — no risk of the `ALTER TABLE ADD CONSTRAINT`
validation pass failing against real data.

**`create_task` — old vs. new, verified line-by-line**:
- **Old signature** (`20260818090000_task_activity_extension.sql`, the immediately-previous
  canonical version): `create_task(p_title text, p_description text, p_workstream_id uuid,
  p_activity_id uuid, p_assignee_ids uuid[], p_allow_unassigned boolean, p_status text, p_priority
  text, p_due_date date, p_expected_minutes int, p_template_id uuid, p_checklist_items text[])` — 12
  parameters.
- **New signature**: the identical 12 parameters, in the identical order, plus **one** appended
  13th: `p_start_date date default null`.
- **Authorization diff result: unchanged.** `can_access_workstream` gate, the contextual-Activity
  auto-enable branch and its own `may_extend_activities` check (`is_superadmin() or
  (is_employee() and ws.lead_user_id = auth.uid()) or (is_supervisor() and manages_user(...) and
  can_access_project(...))`), and the full three-way assignee-resolution branch (Employee forced to
  self / silent-unassigned-when-allowed / Superadmin any-active-user-with-self-fallback / Supervisor
  own-team-with-self-fallback) are **character-for-character identical** between old and new (two
  explanatory comments were dropped in the new version's body; zero SQL statements changed). The
  single functional difference in the entire function body is `start_date`/`p_start_date` appearing
  in the existing `insert into public.tasks (...)` column list and value list, at the same paired
  position — the one intended addition.
- `returns public.tasks`, `language plpgsql`, `security definer`, `set search_path = ''` — all
  unchanged.

**`create_subtask` — old vs. new, verified line-by-line**:
- **Old signature** (`20260821200000_subtask_hierarchy_authorization_hardening.sql`, the
  immediately-previous canonical version): `create_subtask(p_parent_task_id uuid, p_title text,
  p_description text, p_assignee_ids uuid[], p_allow_unassigned boolean, p_status text, p_priority
  text, p_due_date date, p_expected_minutes integer, p_checklist_items text[])` — 10 parameters.
- **New signature**: the identical 10, plus one appended 11th: `p_start_date date default null`.
- **Authorization diff result: unchanged.** The `auth.uid() is null` guard, parent-Task lookup, the
  **direct**-access gate (`can_access_task_directly` — not the hierarchy-read `can_access_task`,
  confirmed still the stricter one), the one-level-nesting guard (`parent.parent_task_id is not
  null` → reject), and the identical three-way assignee-resolution branch are all
  character-for-character unchanged. Only `start_date`/`p_start_date` was added to the existing
  insert, same paired-position pattern as `create_task`. No nested-Subtask permission broadening;
  parent/child context inheritance (`parent.company_id`, `parent.workstream_id`,
  `parent.activity_id`) untouched.
- `returns tasks`, `security definer`, `set search_path = ''` — unchanged.

**DROP FUNCTION safety**: both `drop function if exists` statements use the **exact** old parameter
type list (verified against the old versions' own `revoke`/`grant` statements, which must reference
a function's true live signature to succeed — and did succeed when those migrations were originally
applied, per `migration list` showing them synced). An exact-match drop removes the one existing
overload before `create function` (not `create or replace`) adds the new 13-/11-parameter version —
result: **exactly one** `create_task` and **exactly one** `create_subtask` overload exist after the
migration, so no PostgREST RPC-resolution ambiguity is possible.

**Grants/revokes**: `create_task`'s new version keeps the exact same `revoke execute ... from
public, anon;` / `grant execute ... to authenticated, service_role;` shape its old version used,
updated only for the new (13-arg) type list. `create_subtask`'s new version keeps its own
pre-existing `revoke all` phrasing (functionally identical to `revoke execute` for a function
object — the only revocable privilege a function has) and the same `authenticated, service_role`
grant. Both preserve the repository's real intent: **no PUBLIC or anon EXECUTE ever exists** on
either function (Postgres's own default automatic-PUBLIC-EXECUTE-on-create window is closed within
the same migration transaction, before it ever commits and becomes visible to any other session —
the same pattern every other RPC creation in this codebase already relies on).

**`update_task` review**: confirmed direct, non-RPC — `supabase-tasks-provider.ts`'s `updateTask`
calls `.from("tasks").update({..., start_date: input.startDate, ...})`, gated entirely by the
pre-existing `tasks_update` RLS policy (`using/with check (can_edit_task(id))`, `20260814090002_
tasks.sql`) — a row-scoped policy with no column enumeration, so it automatically covers the new
column with **zero** RLS change. The table-level grant (`grant select, insert, update on public.
tasks to authenticated;`) is also unqualified by column, so it too automatically covers `start_date`.
Clearing a Start Date (`startDate: null`) round-trips through the exact same update path as setting
one — no special-case code exists or is needed. No unrelated Task field's update semantics changed.

**RPC call payload compatibility**: verified exact name matches —
`supabase-tasks-provider.ts`'s `createTask` sends `p_start_date: input.startDate` (matches the SQL
parameter name exactly); `createSubtask` sends `p_start_date: input.startDate` (same); `updateTask`
sends `start_date: input.startDate` (matches the column name exactly, not an RPC call). Since
`p_start_date` carries a SQL-side `default null`, PostgREST resolves either an explicit `null` or an
omitted key identically — both call sites pass it explicitly, which is unambiguous either way.

**Dry run**: `npx supabase db push --dry-run` → `Would push these migrations: •
20260827090000_task_start_date.sql` — confirmed the **only** pending migration, no unexpected drift
against the hosted project's applied history.

**Result: no defect found. The local migration was not modified in this pass** (a fix was not
needed). Still **NOT applied** — `npx supabase migration list` shows `"local":"20260827090000"`
paired with `"remote":""`; no `db push` (dry-run only), `migration up`, or any command touching the
hosted `qxqxzuoaivyddwxqqoog` project was run.

### Task Priority — cellular/signal-bar redesign (Parts C, D)

**Exact enum, unchanged**: `TaskPriority = "low" | "medium" | "high" | "urgent"`
(`src/lib/data/types/task.ts`) — confirmed by direct read; not touched.

**Reference actually read**: `references/phase-13b/task-priority-reference.png.png` — small
ascending signal/cellular bars + a plain text label, no colored pill/capsule.

**One shared component, kept under its existing name**: `TaskPriorityBadge`
(`src/components/tasks/task-priority-badge.tsx`) was rewritten in place — export name and
`{ priority }` prop signature unchanged, so every existing call site picks up the new look with
**zero** changes elsewhere. An audit (`grep` across every file referencing `TaskPriorityBadge`/
`PRIORITY_META`/`task.priority`) confirmed this component was **already** the single source of
truth for every display surface — Board cards (`task-card.tsx`), List rows (`task-list-row.tsx`),
Timeline (`task-timeline.tsx`, this phase's own new component), Quick View (`task-drawer.tsx`),
full Task Properties (`task-properties-rail.tsx`), Tasks Grid (`task-grid-card.tsx`), and the shared
`TaskSummaryItem` used across My Day/Planner/dashboard KPI-detail drawers
(`task-summary-item.tsx`). No second, independent priority-rendering implementation existed anywhere
— so no migration of callers was needed, only the one component.
- **Bars**: 4 ascending-height bars (5/7/9/11px), `low` fills 1, `medium` fills 2, `high` fills 3,
  `urgent` fills all 4 — a clean 1:1 mapping onto the real 4-value enum (no enum change). Unfilled
  bars render in the neutral `--border` token.
- **Colors**: reused the exact existing semantic tokens each priority already carried via
  `PRIORITY_META`'s `variant` (low→`--muted-foreground`, medium→`--info`, high→`--warning`,
  urgent→`--destructive`) — **not** the reference screenshot's own literal green/amber/red, per the
  explicit "do not copy raw RGB values" instruction.
- **Urgent vs. High distinction**: both an extra (4th) filled bar and a different color
  (destructive red vs. warning amber) — never color alone.
- **Text**: always plain `text-foreground`, never priority-colored — "color is supplemental, never
  the only meaning" satisfied by construction; label text (Low/Medium/High/Urgent) is unconditional
  and unabbreviated in every case.
- **No oversized capsule**: the old `<Badge variant=...>` pill (rounded pill background + border +
  padding) was removed entirely; the new markup is a plain `inline-flex` with tiny bars + text,
  compact enough to fit the same List-row column width the old Badge occupied.
- **The Priority *picker*** (`task-priority-picker.tsx`, the editable Select-style control used in
  Task create/edit) was **deliberately left unchanged** — it already uses its own established
  `PillSelect` colored-pill treatment for an editable control, a different UI need than a read-only
  label; `PRIORITY_META` (unchanged shape) is still its only dependency on this file, so no
  create/edit business behavior changed.
- **Verified live** (mock-mode screenshots, light and dark): Tasks List shows all four priorities
  correctly (Low=1 gray bar, Medium=2 blue bars, High=3 amber bars, Urgent=4 red bars, each with its
  plain-text label); the full Task page's Properties rail shows the identical treatment
  ("Priority: [3 amber bars] High"); dark mode renders every bar and label with full legibility, no
  contrast issues.

### Internal/Non-billable — discovery-surface cleanup (Part E)

Re-audited every read-only Project/Client search or selection surface beyond the Projects index
(already fixed in the prior pass):
- **Command palette**: confirmed (again) it has **no Project search category at all** — only
  Companies/Tasks/Workstreams/Reports/People. There is nothing to filter for "Project results"
  because no such category exists. (Out of this pass's explicit scope: the Companies/Workstreams
  categories, which are a different entity/audit question than "Project results.")
- **Related Projects / History** (Project detail's History tab): re-confirmed structurally
  impossible to leak the Internal Project into a real client Project's list — it only ever shows
  Projects sharing the *current* Project's `companyId`, and no real client Project shares the fixed
  Internal company's id. No change needed.
- **New genuine gap found and fixed**: `GenerateClientReportDialog`'s "Client" dropdown
  (`src/components/client-reports/generate-client-report-dialog.tsx`) derived its Client list
  directly from `useProjects()`'s `companyId`/`companyName` pairs — since that hook still legitimately
  includes the Internal Project (it must, for the functional fallback elsewhere), "Internal /
  Non-billable" was selectable as a **client** for a client-facing report generation, which is
  nonsensical (there is no client to send it to). Fixed with a **local filter inside this one
  dialog only** (`if (p.isInternal) continue;`) — not a change to `useProjects()` itself, so nothing
  else that legitimately relies on the unfiltered hook result is affected.
  `schedule-form-dialog.tsx` was also audited — it already sources from a separate,
  already-Internal-excluding `listSchedulableProjects` capability, not `useProjects()`, so it needed
  no change.
- **Functional fallback selectors — confirmed untouched**: `TaskFormDialog`'s workstream/Project
  picker (the load-bearing self-added-Task-creation fallback for an unstaffed Employee),
  `AddSubtaskDialog`, `add-manual-entry-dialog.tsx` (Daily Update, which already has its own
  independent "no company" option and was never filtered), and Visit Entries (already
  RPC-level-blocked from the Internal Project by design, pre-existing, unrelated to this pass) all
  still see/can select the Internal Project/Workstream exactly as before. No data was deleted
  anywhere in this review.

### Files changed (pre-deployment review pass)

- `src/components/tasks/task-priority-badge.tsx` — rewritten (signal-bar redesign), export name
  unchanged.
- `src/components/client-reports/generate-client-report-dialog.tsx` — Internal Project excluded
  from the "Client" dropdown.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.
- **No migration file was changed** — the security review found no defect requiring a fix.

## Final UX completion pass — Task-derived Projects Gantt, deadline-block redesign, Company/Project identity avatars, hosted migration deployment

### Projects index — List | Gantt (Part B)

`/dashboard/projects` gains a `List | Gantt` toggle (`ProjectsView`, default `"list"`) next to the
existing search box. **List is completely unchanged** — same status grouping, same columns, same
Internal-Project hiding for Employee/Supervisor, same click-to-open behavior; the only edit to its
own row rendering was inserting `CompanyProjectAvatar` into the Project-identity cell (see Part D).

**Gantt is a new, separate presentational component** (`ProjectGanttGroup`), not a conditional
branch grafted onto `ProjectStatusGroup` — the two views are different enough (own month header,
own day-grid, its own bar-state computation) that one shared component with heavy branching would
have been harder to read than two clear ones. Gantt reuses the same status-grouped structure (same
collapsible groups, same status color tinting) with a second, right-hand pane per group: a
day-grid Timeline scoped to a single shared `monthCursor` (one month control per status group,
consistent with the existing per-group layout — there is no single global month control spanning
every group, since groups can independently collapse).

**Data source — Tasks only, never Project contract dates.** `computeProjectScheduleState(projectTasks,
days)` aggregates only the already-fetched, role-scoped `useTasks()` result (grouped client-side by
`task.workstream.projectId`) — no new query, no RLS/provider broadening, `contractStartDate`/
`contractEndDate` never read. Five cases, matching the Task Timeline's own bar-state shape one level
up:
- **Case A — "Scheduled Work Window."** Triggers only when the Project's Tasks collectively have
  *both* some `startDate` and some `dueDate` values somewhere in the set. The bar spans the
  aggregate min→max of the **combined** date set (start dates and due dates together), clipped to
  the visible month. Button `title` reads "…scheduled Task work spans this period (not a contract
  period)" — the explicit disambiguation from a contract period the instruction required.
- **Case B — deadline blocks.** Due-only Tasks project-wide: one compact one-day block per distinct
  due date, with a numeric count badge (`{count}`) when more than one Task shares that date — never
  a fabricated span.
- **Case C — start markers.** Start-only Tasks project-wide: a thin vertical marker per distinct
  start date — no fabricated duration.
- **Case D — "No task schedule."** Neither `startDate` nor `dueDate` exists anywhere across the
  Project's Tasks.
- **Case E — render nothing.** Real dates exist but every one falls outside the visible month — the
  row's timeline area is genuinely blank, never mislabeled "No task schedule."

**Click behavior.** A Project's name (List), bar, deadline block, or start marker (Gantt) all open
the Project. From Gantt specifically, the click deep-links to
`/dashboard/projects/[id]?tab=tasks&view=timeline` — straight to that Project's own Task Timeline,
per the instruction's preference for "open directly to Tasks → Timeline if the routing can support
it cleanly." List-mode clicks keep opening to the Project's default Overview tab, unchanged.

**Deep-link routing — no new route.** `/dashboard/projects/[id]/page.tsx` already needed a
`useSearchParams()` split (`<Suspense>` + a content component) for this; `tab`/`taskView` are now
seeded via **lazy `useState` initializers** reading `?tab=`/`?view=` (not a `useEffect` + `setState`,
which an eslint pass flagged as `react-hooks/set-state-in-effect` — a cascading-render smell). This
exactly matches the pattern `/dashboard/tasks` already uses for its own `?status=`/`?assignee=`
params — normal navigation (no query params) is completely unaffected, defaults stay
`"overview"`/`"list"`.

### Task Timeline — deadline diamond replaced with a one-day block (Part C)

`task-timeline.tsx`'s `bar.kind === "deadline"` case no longer renders a `Diamond` icon. It now
renders a `size: DAY_WIDTH - 4` one-day rounded block using the **exact same** `color-mix(in oklch,
${color} 30%/60%/80%, ...)` background/border/text treatment as the `"duration"` bar, positioned at
`bar.index * DAY_WIDTH + 2` (left-aligned within its one-day column, not centered under a point like
the old diamond was) — visually reads as "duration bar, but one day long," never implying an earlier
start. Click-to-open-Task behavior is unchanged; the `title` attribute now says "…due {date} (due
date only, not a multi-day duration)" for the same disambiguation reason as the Gantt's own Case A
copy. `Diamond` import removed (no longer used anywhere in the file). All other bar-state cases
(`duration`, `start-marker`, `no-schedule`, `out-of-range`) are byte-for-byte unchanged.

### Company/Project identity avatars (Part D)

**No new database column, no migration** — purely a deterministic client-side derivation.

- **Three identity tokens**, `--identity-1/2/3` (+ `-foreground`), added to `src/app/globals.css`'s
  `@theme inline`, `:root`, and `.dark` blocks — blue `#2f5fdb`, teal `#0d9488`, violet `#7c3aed`,
  deliberately identical between light/dark (a small opaque badge doesn't need a per-theme hue
  shift the way a full page region does). Distinct from `--destructive`/`--warning`/`--success`/
  `--info` by construction — never reused.
- **`identityColorForCompany(companyId)`** (`src/lib/data/identity-color.ts`) — a plain djb2-style
  string hash mod 3, keyed **only** on `companyId` (never Project id/name/year), so every related
  Project under the same Company resolves to the identical color. Confirmed live: "Alderleaf
  Manufacturing 2024-2025" renders the same purple "AM" avatar on the Projects List, Projects Gantt,
  Project detail header, the Service (Workstream) header's Project-context link, and the Superadmin
  Companies list/detail — all five surfaces independently call the same function with the same
  `companyId`.
- **`CompanyProjectAvatar`** (`src/components/companies/company-project-avatar.tsx`) — the one
  shared component, wrapping the existing `Avatar`/`AvatarFallback` primitives with a
  `rounded-lg`/`after:rounded-lg` override (squircle) so it never looks interchangeable with a real
  person's circular avatar (Team/Assignee stacks). Initials come from `companyName` via the
  existing `getInitials()` helper, even when rendered next to a Project's own name — no new
  "Client:"/"Project:" label was added anywhere; Project stays the sole UI identity, the avatar is
  a visual aid only. `isInternal` renders a neutral `var(--muted)`/`var(--muted-foreground)`
  treatment instead of one of the 3 customer identity colors.
- **Surfaces placed on**: Projects List row identity cell, Projects Gantt row identity cell +
  window-bar `title`, Project detail header (next to the Project name), Related Projects rows
  (History tab), the Service/Workstream detail page's "back to Project" context link, Superadmin
  Companies list rows, Superadmin Company detail header.
- **Deliberately skipped, with reasons**:
  - **My Day / Planner / dense Task-List rows, and every Project/Workstream selector dropdown** —
    per the explicit instruction not to force avatars into dense rows or tiny pickers where it would
    hurt density without meaningfully improving recognition.
  - **The full Task page's Company→Project→Service→Activity breadcrumb** — `TaskWithRelations.company`
    is a plain `Company`, and `Company`/`CompaniesProvider` expose no `isInternal` field (only
    `ProjectWithRelations` does, via a dedicated join added in the prior pass). Adding it here would
    have meant either a new Company query just for this one breadcrumb, or silently mislabeling the
    Internal company's own Tasks with an ordinary customer identity color — both worse than skipping.
  - **Superadmin Companies list/detail — `isInternal` not special-cased.** Same root cause: the base
    `Company`/`CompanyWithRelations` types don't expose `is_internal` (only the Projects join does).
    The avatar still renders there (an ordinary identity color, not neutral) for the one
    permanently-seeded Internal Company — a known, low-risk simplification (verified live: "Internal
    / Non-billable" shows a teal avatar instead of the neutral treatment it gets everywhere else).
    Extending `CompaniesProvider` to select `is_internal` was judged out of scope for this pass; the
    Internal Company is already fully visible and clearly labeled on these Superadmin-only pages
    regardless.

### Preserved / no-regression confirmation (Parts A, E–J)

Confirmed unchanged by inspection and live verification: the single collapsible `DesktopSidebar`
(no duplicate tooltip), the Activities-first Service/Workstream page layout, Shared Notes
(`companyId`-keyed, reused Company-Notes architecture), Internal/Non-billable Project hidden from
Employee/Supervisor's `/dashboard/projects` List *and* Gantt (its Gantt row still renders, muted,
"System"-badged, Superadmin-only visible — same rule as List), the cellular/signal-bar Task
Priority redesign, and the exactly-three-role model (Employee/Supervisor/Superadmin, Supervisor
scoped to self + direct reports/team, never org-wide). No RLS policy, authorization function, or
provider visibility filter was touched in this pass.

### Validation

- `npx tsc --noEmit` — 0 errors.
- `npx eslint src` — 0 errors, 2 pre-existing unrelated warnings only (`task-form-dialog.tsx`,
  `workstream-form-dialog.tsx`, both `submitForm`-in-`useEffect`-deps, unrelated to this pass). One
  new error surfaced mid-pass (`react-hooks/set-state-in-effect` on the deep-link seeding effect)
  was fixed by switching to lazy `useState` initializers, see above — not suppressed.
- All four sequential provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) —
  clean, same 21-route manifest each time.
- Mock-mode Playwright visual verification (light + dark, Superadmin quick-login): Projects List
  (avatars, System badge, List|Gantt toggle), Projects Gantt (window bar, deadline blocks, real
  month/day grid), a Project's Task Timeline via the new `?tab=tasks&view=timeline` deep link (the
  new one-day deadline block visible, avatar in the header), Related Projects (History tab, correct
  empty state — this seed dataset has only one Project per Company), Service header avatar,
  Superadmin Companies list/detail avatars, dark mode. **Zero console/page errors** across every
  screenshot.

### Hosted migration deployment (Parts L–N)

Gate re-verified immediately before applying: `npx supabase migration list` showed only
`20260827090000` as `local`-present/`remote`-absent (every earlier migration already
local==remote); `npx supabase db push --dry-run` confirmed the **same single** migration pending,
nothing else. The migration file's content was re-read in full and matches the prior pass's
byte-for-byte security review unmodified.

`npx supabase db push` (real, non-dry-run) applied `20260827090000_task_start_date.sql` to the
linked hosted project (`qxqxzuoaivyddwxqqoog`) — succeeded (`"dryRun":false,"migrations":
["20260827090000_task_start_date.sql"]`). The push logged a Docker-catalog-cache warning only
(`failed to connect to the docker API`) — the same pre-existing sandbox limitation documented
earlier in this phase (Docker Desktop unavailable here); it does not affect the actual push, which
completed. Immediately after, `npx supabase migration list` was re-run and now shows
`"local":"20260827090000","remote":"20260827090000"` — **local == remote, zero pending
migrations.**

**Status: HOSTED / APPLIED / VERIFIED.**

Exactly one normal dev server was then restarted (real `.env.local`/`supabase` mode, port 3000).
It booted clean (`✓ Ready in 462ms`, no compile errors) and `/`, `/login`, `/dashboard/projects`,
`/dashboard/tasks` all returned `200` with no server-side errors logged. **Honest limitation**: this
session has no real Superadmin/authenticated credentials (confirmed in an earlier pass — the user's
own credentials were never recorded anywhere this session could read them), so the client-side
Supabase queries against `tasks.start_date` / the new `create_task`/`create_subtask` RPC signatures
could not be exercised end-to-end through an authenticated session from here. What *was* verified:
the migration is live on the hosted schema, the app builds and boots cleanly against the `supabase`
provider with the new column/RPC signatures compiled in, and `supabase-tasks-provider.ts`'s
`p_start_date`/`start_date` payload names were already confirmed to match the SQL exactly in the
prior review pass (unchanged since). The dev server was left running on port 3000 for the user's
own manual authenticated read/write acceptance test, per their explicit instruction not to create
test data automatically.

### Files changed (final UX completion pass)

- `src/app/dashboard/projects/page.tsx` — List | Gantt toggle, `ProjectGanttGroup`,
  `computeProjectScheduleState`, `ProjectIdentity` (avatar insertion).
- `src/app/dashboard/projects/[id]/page.tsx` — deep-link seeding via lazy `useState` initializers
  (replacing the earlier `useEffect` version), header + Related Projects avatars.
- `src/components/tasks/task-timeline.tsx` — deadline diamond → one-day block.
- `src/app/globals.css` — `--identity-1/2/3` (+ `-foreground`) tokens.
- `src/lib/data/identity-color.ts` — new, `identityColorForCompany`.
- `src/components/companies/company-project-avatar.tsx` — new, `CompanyProjectAvatar`.
- `src/app/dashboard/workstreams/[id]/page.tsx` — Service header context-link avatar (replaced the
  `Building` icon; import removed).
- `src/app/dashboard/companies/page.tsx`, `src/app/dashboard/companies/[id]/page.tsx` — list row +
  detail header avatars.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.
- `supabase/migrations/20260827090000_task_start_date.sql` — **applied to hosted**, file itself
  unmodified and still uncommitted in git.

## Final visual + task-workflow polish pass — merged Projects List/Gantt, Task List column headers, Project avatars on Task surfaces, inline Service/Activity creation audit

Still Phase 13B — the prior "final UX completion pass" was provisional; the user identified these
refinements before checkpointing.

### Part A — Projects: merged List + Gantt (no mode switcher)

The separate `List | Gantt` toggle from the prior pass is **removed**. `/dashboard/projects` is now
one integrated layout per status group — matching
`references/phase-13b/project-workspace-reference.png.png` directly: LEFT (Project / Services /
Open Tasks / Team, unchanged columns) and RIGHT (the same Task-derived Gantt) **in the same row**,
always. `ProjectStatusGroup` and `ProjectGanttGroup` were merged into one component,
`ProjectWorkspaceGroup` — a Project's left row and its right timeline row share the same index in
the same array and the same fixed row height, so they always align exactly; there is no longer a
"List mode" where the timeline doesn't exist.

**Bar text — no longer blank.** Two real bugs, both from the prior pass, fixed:
- The "Scheduled Work Window" bar already rendered the Project's name — unaffected — but now also
  carries an explicit `aria-label` alongside its `title` (previously title-only).
- The due-only deadline blocks were rendering **blank** for the (extremely common) case of exactly
  one Task due that day — the old code was `{entry.count > 1 ? entry.count : ""}`, so a single
  deadline showed literally nothing. Fixed to always show the numeral (`{entry.count}`) — a
  centered "1", "2", "3"… never blank. (An intermediate attempt at literal "`N` due" text was tried
  and rejected during this pass — the block is only one day-column wide, ~30px, and "1 due" simply
  doesn't fit at any legible size; it rendered as a truncated, worse-looking "1 …". The full
  "`Project` — `date` — `N` Task(s) due" phrase lives in the `title`/`aria-label` instead, where
  there's no width constraint.)

Data source, month navigation, day-grid, weekend shading, and horizontal scroll are all unchanged
from the prior pass — still Task-`startDate`/`dueDate`-only, never `contractStartDate`/
`contractEndDate`, `createdAt`, or timer timestamps. Click behavior (Project name, bar, deadline
block, or start marker) still deep-links to `/dashboard/projects/[id]?tab=tasks&view=timeline` —
unchanged, still the same stable mechanism.

### Part B — shared Task List column headers

New `TaskListHeader` component (`src/components/tasks/task-list-row.tsx`) — a single, reusable
column-header row, rendered by `TaskListSection`/`FlatTaskList` immediately above their rows (never
above a collapsed status group), and directly inside `WorkstreamActivityTasks`'s own
`ActivityTaskRows` for the Service/Activity surface. One shared constant,
`TASK_LIST_GRID_COLS: Record<TaskListContext, string>`, is consumed by **both** the header and
`TaskListRow`'s own desktop grid — the two can never drift out of alignment, since they're
literally reading the same Tailwind grid-template string.

**Context-aware column sets** — a new `TaskListContext = "global" | "project" | "service"` prop,
threaded through `TaskListRow`/`TaskListSection`/`FlatTaskList`:
- `"global"` (`/dashboard/tasks`): `Task | Priority | Project / Service | Due | Assignee` — nothing
  about the Task's Project/Service is known ahead of time.
- `"project"` (a Project's own Tasks tab): `Task | Priority | Service | Due | Assignee` — Project is
  already established by the page around it, so the identity avatar and Project name are dropped
  from the row/header entirely (not just visually hidden — the grid template itself has one fewer
  effective context sub-line).
- `"service"` (a Service/Activity's own Task list): `Task | Priority | Due | Assignee` — Service
  *and* Activity are both already known (the Activity is the card's own heading), so there is no
  context column at all — a genuinely narrower 4-column grid, not a hidden 5th column.

Labels were kept short after a live check found the natural "Project / Service / Activity" wording
truncating inside the available column width — shortened to "Project / Service" (global) / "Service"
(project); Activity itself still appears as a " · " suffix inside the cell's own second line, it
just isn't named separately in the header.

**Collapsed-group behavior**: the header only renders inside the `!isCollapsed` branch of
`TaskListSection` — a collapsed status group shows no column heading, exactly as specified.

**Responsive**: `TaskListHeader` uses the identical `hidden … sm:grid` split `TaskListRow` already
used for its own mobile-stacked-card vs. desktop-grid split — below `sm`, neither the header nor the
row's grid renders at all (the mobile stacked block has no columns to label). No new breakpoint was
invented; the app's existing binary mobile/desktop split is the only "responsive" behavior that
existed here already, and the header mirrors it exactly.

**Surfaces updated**: `/dashboard/tasks` (global, `context="global"`, unchanged default), the
Project workspace's Tasks tab (`context="project"`, plus a real `project.isInternal` passed through
for the avatar — see Part C), and `WorkstreamActivityTasks`'s per-Activity Task rows
(`context="service"`). **Deliberately not touched**: Board cards (a card, not a table/list — got the
avatar per Part C, not a header), the Task Quick View drawer (an isolated card), and the Task
Timeline's own left-hand Task/Priority/Assignee panel (a bespoke, non-`TaskListRow` component not
named in the requested surface list — left as-is).

### Part C — Company/Project identity avatar on Task surfaces

The existing shared `CompanyProjectAvatar`/`identityColorForCompany` (built in the prior pass) is
reused as-is — **no second identity system**. A new small helper,
`isLikelyInternalTask(task)` (`src/lib/data/identity-color.ts`), centralizes the
best-effort Internal-detection heuristic (see the honesty note below) so it isn't duplicated across
every Task surface.

**New unified "Context" cell** (`ContextCell`, `task-list-row.tsx`) replaces the old split of "Company
name as a plain-text subtitle under the title" + "a separate Service/Activity column" with one cell:
avatar (only in `"global"` context) + Project name on top, `Service · Activity` below — exactly the
`[AM] Alderleaf Manufacturing 2026 / Payroll · Monthly payroll` shape requested. No second
"Client:"/"Project:" label was added anywhere.

**Surfaces the avatar was added to this pass** (all reusing the same `CompanyProjectAvatar`):
1. `/dashboard/tasks` List (`TaskListRow`'s new `ContextCell`, `context="global"`).
2. `/dashboard/tasks` Board (`task-card.tsx`'s existing Client/Service subtitle line).
3. The full Task page's breadcrumb (`/dashboard/tasks/[id]/page.tsx`) — previously **deliberately
   skipped** in the prior pass for lack of a reliable Internal signal; now added using the same
   best-effort heuristic every other non-Project-scoped surface uses (see honesty note).
4. Task Quick View (`task-drawer.tsx`)'s own breadcrumb — same treatment as the full Task page.
5. The shared `TaskSummaryItem` "row" variant (`task-summary-item.tsx`) — used by Planner
   (Day/Week/Month/Group) and every Dashboard Task-based KPI/list-widget detail drawer, so all of
   those surfaces picked it up from one shared component. The ultra-compact "chip" variant (Planner
   calendar cells) was **not** touched — too small for an avatar without hurting legibility.

**Surfaces deliberately left alone**: Subtask rows (`task-row.tsx`) — a Subtask's Project/Service/
Activity is always inherited read-only from its parent (locked, Phase 10), so there's nothing
Subtask-specific to show; the parent Task's own page already carries the avatar. Project/Workstream
picker dropdowns and every dense List/Board row's own Priority/Assignee cells — untouched, per the
explicit "don't force it into microscopic UI" instruction.

**Honesty note on Internal detection**: `ProjectWithRelations.isInternal` (the one fully reliable
signal, exposing the Company's real `is_internal` DB column) is only in scope on Project-scoped
pages. `TaskWithRelations` carries no equivalent field — `Company`/`CompaniesProvider` don't expose
`is_internal` at all. `isLikelyInternalTask` falls back to comparing
`task.company.id`/`task.workstream.projectId` against the fixed `INTERNAL_COMPANY_ID`/
`INTERNAL_PROJECT_ID` constants — **this is reliable in mock data (seeded with those exact literal
ids) but a no-op in every Supabase-backed provider mode**, where the real hosted Internal Company
has its own random id, not the literal string. Verified live in mock mode (the "Internal /
Non-billable" rows correctly show the neutral treatment everywhere this heuristic is used) — in
production this same code will simply show the Internal Company's own Tasks with an ordinary
identity color instead of the neutral one, same class of limitation as the Superadmin Companies
list/detail avatar documented in the prior pass. The Project workspace's Tasks tab (`context=
"project"`) avoids this entirely by passing the real `project.isInternal` through instead of relying
on the heuristic.

### Part D — inline Service/Activity creation from Task Create/Edit

**Audit finding (the headline result): this mostly already existed, correctly scoped, already
hosted — the gap was a UI-only mismatch, not a missing backend capability.**

- **"+ New service" already existed** in `TaskFormDialog` (`src/components/tasks/task-form-dialog.tsx`),
  opening the existing `WorkstreamFormDialog` with the currently-selected Project's `projectId`
  already correctly wired through (a bug fix from an earlier phase). It was gated by a blanket
  `!employeeView` check — Supervisor/Superadmin only.
- **The real backend authorization is already broader and already safe**: `canCreateWorkstreamInProject`
  (`src/lib/data/permissions.ts`, built in Phase 8B for the Project workspace's own "+ Add Service"
  button) allows Supervisor/Superadmin unconditionally, **or an Employee who can access the Project
  itself** (`canAccessProject`) — server-enforced self-lead-only, no team, via the real hosted
  `create_workstream` RPC (`supabase-workstreams-provider.ts`'s own comment: "the RPC re-implements
  workstreams_insert's exact authorization itself"). `WorkstreamFormDialog` already fully handles
  the Employee case (`leadUserId: isEmployee(user) ? user.id : form.leadUserId`,
  `teamUserIds: isEmployee(user) ? [] : ...`) — this exact form is already reused by the Project
  page's own "+ Add Service," so nothing about Employee self-service needed to be built there.
- **Fix applied**: `TaskFormDialog`'s gate was changed from `!employeeView` to a proper
  `canCreateWorkstreamInProject(user, {...selectedProject}, selectedProject.members)` check — the
  identical gate the Project page's own button already uses. Verified live (mock mode, logged in as
  Employee): selecting an accessible Project now shows "+ New service" in the Task Create form.
  **Zero backend/RLS/RPC/migration change** — this was a client-side authorization-gate fix only.
- **"+ Add Activity" already existed too**, as "Add another activity to this service" (same file) —
  gated by `canExtendServiceActivities` (Phase 8C), which already mirrors the real
  `create_task`/`create_subtask` RPC's own activity-auto-enable branch exactly (reviewed line-by-line
  in the pre-deployment review pass): Employee may extend only a Service they themselves lead,
  Supervisor/Superadmin may extend one led by anyone in their own assignable scope. Picking an
  unconfigured (but already-cataloged) Activity there associates it with the current Service
  **atomically with Task creation** — exactly the "ensures association with the current Project
  Service" outcome requested. **No literal "create a brand-new Activity" capability exists anywhere
  in the app** (confirmed by an explicit `createActivity`/`create_activity` search — zero results);
  Activity is deliberately a fixed, reusable, seeded catalog, never a free-text per-workstream
  concept, and building one now would be new, security-sensitive backend surface with no existing
  permission model to extend — correctly out of this pass's safe-UI-only scope. The existing
  "enable an existing catalog Activity for this Service" flow is judged to already satisfy the
  requested workflow outcome without inventing that.
- **Shared data refresh**: `handleWorkstreamCreated` already calls `refreshWorkstreams()` and
  auto-selects the new Service — no hard reload. No notification system was added or needed; a
  newly created Service/Activity becomes visible to every other authorized user the next time their
  own already-role-scoped hook fetches (real DB write, not local-only state).
- **No new migration was needed for this Part.** `npx supabase migration list` before and after this
  pass shows the identical set, `20260827090000` still the only ever-local-only-then-applied
  migration in this phase, zero pending.

### Preserved / no-regression confirmation (Parts E–I)

Confirmed unchanged: Task Start Date/Timeline five-state model (duration/deadline-block/
start-marker/no-schedule/out-of-range), the cellular/signal Priority indicator (unchanged
`TaskPriorityBadge`), the Activities-first Service page (now also carrying the new Task List column
headers inside each Activity card, per Part B), the single collapsible `DesktopSidebar` with
"Client work" unchanged, and the Internal/Non-billable Project's exclusion from Employee/
Supervisor's normal Projects browsing (List side of the merged layout — still filtered exactly as
before; its Gantt-side row still renders too, muted, Superadmin-only-visible, same rule).

### Validation

- `npx tsc --noEmit` — 0 errors.
- `npx eslint src` — 0 errors, same 2 pre-existing unrelated warnings only.
- All four provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) — clean.
- Mock-mode Playwright visual verification (Superadmin + Employee, light + dark, desktop + 420px
  mobile): merged Projects List+Gantt (no switcher, bar text visible, deadline blocks showing a
  digit never blank), global Tasks List/Board (headers, avatars, identity-color consistency with
  the Projects page), Project Tasks List/Timeline (`context="project"`, no redundant avatar, Service
  Timeline deadline block unchanged), Service Activity Tasks (4-column header, no context column),
  Task Create as Employee (Project selected → "+ New service" now visible). **Zero console/page
  errors** across every screenshot.
- `npx supabase migration list` — unchanged: `20260827090000` local==remote, zero pending.

### Files changed (final visual + task-workflow polish pass)

- `src/app/dashboard/projects/page.tsx` — merged `ProjectStatusGroup`/`ProjectGanttGroup` into one
  `ProjectWorkspaceGroup`; removed the `List | Gantt` toggle; deadline-block text fix.
- `src/components/tasks/task-list-row.tsx` — new `TaskListContext`, `TASK_LIST_GRID_COLS`,
  `TASK_LIST_HEADER_LABELS`, `TaskListHeader`, `ContextCell`; `TaskListRow` now context-aware.
- `src/components/tasks/task-list-section.tsx` — threads `context`/`projectIsInternal`, renders
  `TaskListHeader`.
- `src/components/workstreams/workstream-activity-tasks.tsx` — `ActivityTaskRows` now renders
  `TaskListHeader context="service"`.
- `src/app/dashboard/projects/[id]/page.tsx` — passes `context="project"`/`project.isInternal` to
  its own `TaskListSection`.
- `src/components/tasks/task-card.tsx`, `src/components/tasks/task-drawer.tsx`,
  `src/app/dashboard/tasks/[id]/page.tsx`, `src/components/tasks/task-summary-item.tsx` — Project
  identity avatar added.
- `src/lib/data/identity-color.ts` — new `isLikelyInternalTask` helper.
- `src/components/tasks/task-form-dialog.tsx` — "+ New service" gate fixed from `!employeeView` to
  `canCreateWorkstreamInProject`; no other behavior change.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.
- **No migration file created or changed in this pass.**

## Final Task Identity + Activity UX pass — Task Status Avatars, role-aware Assignee visibility, clear Service Activity multi-selection

Still Phase 13B — intended as the final implementation pass before manual acceptance/checkpoint.

### Part B — Assignee stays Assignee; role-aware column visibility

No rename anywhere (database, provider, permissions, UI copy) — "Assignee"/"Assignees" is unchanged
everywhere, including the full Task/Edit form. The product reasoning (a Task can be created by one
person and assigned to another, assigned by a Supervisor/Superadmin, or have multiple assignees) is
exactly why "Owner" was never introduced.

**Role-aware, audited — never a blanket per-role hide.** New `isAssigneeColumnRedundantForViewer`
(`src/lib/data/task-display.ts`) returns true only when *every* currently-displayed Task is assigned
to exactly the viewer and no one else (an unassigned Task, or one shared with a coworker, still
carries real information and keeps the column). Supervisor/Superadmin are never passed through this
check — they always keep Assignee, since they need to tell their own work apart from their team's.

Extended the shared `TaskListHeader`/`TaskListRow` grid system (`task-list-row.tsx`) with a second,
independent axis: `showAssignee` (alongside the existing `context` axis). `taskListGridCols`/
`taskListHeaderLabels` are now functions of `(context, showAssignee)` rather than static per-context
maps — when `showAssignee` is false the Assignee column is dropped from the grid template entirely
(never just visually hidden), so the header and row can never show a mismatched column count.
Computed once per page (from that page's own currently-loaded/filtered Task set) and passed down
uniformly to every status group, so behavior never flips between groups on the same page:
`/dashboard/tasks`, the Project workspace's Tasks tab, and `WorkstreamActivityTasks`'s Service
Activity Task lists. My Day (`BucketTaskGrid`/`TaskGridCard`) was audited and has no Assignee
display to hide in the first place; Planner/Dashboard KPI drawers (`TaskSummaryItem`) already had
their own correct, pre-existing role-aware `showAssignee` prop from an earlier phase — unchanged.

Verified live (mock mode): an Employee whose Task list includes even one Task shared with a coworker
(or unassigned) keeps the Assignee column; Supervisor/Superadmin always keep it regardless of
dataset.

### Part C/D — Task Status Avatar

New shared `TaskStatusAvatar` (`src/components/tasks/task-status-avatar.tsx`) — no database field,
no migration. Title-derived initials (`taskAvatarInitials`, exported for reuse/testing): the first
letter of each of the first two words ("Prepare VAT Return" → "PV", "Monthly Payroll" → "MP"), or
just one letter for a single-word title ("Audit" → "A") rather than padding it — matches the
examples in the request exactly. Color comes directly from `STATUS_COLOR_VAR[task.status]` (the
same canonical map every other status-tinted element already reads from) on every render — there is
no separate/cached color, so a status change repaints it immediately the next time `task.status`
changes and the surface re-renders (confirmed live: changing a Task's status via the full Task
page's status picker updates the header avatar's color within the same render pass, no reload).
Shape is `rounded-md` (a compact badge) — deliberately distinct from `CompanyProjectAvatar`'s
squircle (`rounded-lg`) and a person `Avatar`'s circle, so all three identity concepts (Task /
Project·Company / Person) never read as interchangeable. Accessible name/title:
`"{title} — {status label}"` via both `title` and `aria-label` (`role="img"`) — never color alone.

**Surfaces**: `TaskListRow`'s `TitleCell` (global/project/service Task lists), `TaskCard` (Board),
`TaskGridCard` (My Day's bucket grid and `/dashboard/tasks`'s grouped-card view — replaced the
previous plain status dot), the Task Timeline's left Task column, `TaskDrawer` (Quick View) and the
full Task page's own `<h1>` (both replacing/joining the plain title), `TaskSummaryItem`'s "row"
variant (Planner Day/Week/Group, Dashboard KPI drawers — the ultra-compact "chip" variant, used only
in Planner's own calendar cells, was deliberately left alone as already-adequate and too small to
add another element to), and `TaskRow` (the Subtasks section) — replacing its own small status dot,
so Subtasks use the exact same avatar model as every other Task, per the "no second Subtask avatar
system" instruction. Priority (the 4-bar signal indicator) is completely untouched everywhere — the
two answer different questions (workflow state vs. importance) and both remain visible side by side.

### Parts E–H — Service Activity model clarity + real multi-selection

**Audit finding**: `WorkstreamInput.activityIds` (`updateWorkstream`) already existed and already
supports assigning many Activities to a Service in one save — `syncActivities`/`syncWorkstreamActivities`
do a full delete-then-reinsert of `workstream_activities` for whatever id list is passed (a
replace-all, not additive). `WorkstreamFormDialog`'s own "Available Activities" checkbox list
already exercises this exact mechanism today for Supervisor/Superadmin (and, on create, for an
Employee's own new Service). **The real, load-bearing constraint discovered**: `updateWorkstream`
is gated by the `workstreams_update` RLS policy — Supervisor/Superadmin unconditionally, and
*never* an Employee, even one who leads and can otherwise fully manage their own Workstream (a
deliberate boundary from `20260814120001_employee_workstream_creation.sql`, re-affirmed there in
its own comment: "workstreams_update is UNCHANGED... do NOT give the Employee arbitrary
organization-wide staff-assignment powers merely because they may create the Workstream"). The
mock provider's `updateWorkstream` independently enforces the identical rule via `requireManage`.
This meant a genuine multi-select "Add activities to Service" control could safely be built for
Supervisor/Superadmin (it already has a safe backend path) but **not** for Employee, who keeps
exactly their pre-existing single-activity mechanism.

**Part F — "Activity for this Task"**: the Task-Activity `<Label>` was renamed from "Activity" /
"Activity (optional)" to "Activity for this Task" / "Activity for this Task (optional)" — still
single-select, unchanged mechanics, unchanged data model (`Task.activityId` stays a single nullable
foreign key — no array, no Task↔Activity many-to-many).

**Part G — "Activities in this Service"**: new, always-visible (whenever a Service is selected and
has any enabled Activities, or one is staged) read-only panel below the Task-Activity select in
`TaskFormDialog`, listing *every* Activity currently enabled for the Service (from the already-
fetched `departments`/`useWorkstreamActivities`, scoped to enabled-only) with a checkmark, plus the
one matching `form.activityId` visibly tagged "Selected for Task." This directly fixes the reported
bug: previously, staging a new Activity via "Add another activity to this service" *replaced* the
entire Activity section with just a "will be added" banner, making the Service's other, already-
enabled Activities (e.g. the one just picked for a sibling Task) disappear from view — looking like
they'd been dropped or like the Task itself had gone multi-Activity. Now the full list — including a
still-staged, not-yet-persisted pending Activity, tagged "Will be added" — renders unconditionally
underneath, regardless of which state the select above is in.

**Part H — "Add activities to Service" (Supervisor/Superadmin) vs. the unchanged single-activity
flow (Employee)**: new `AddServiceActivitiesDialog`
(`src/components/workstreams/add-service-activities-dialog.tsx`) — a compact checkbox picker over
every catalog Activity not yet enabled for the Service (via the same `useActivityCatalog` scoping
`TaskFormDialog` already used), with an "Add N activities" submit. On save it calls
`workstreamsProvider.updateWorkstream` with the Workstream's **complete existing state**
reconstructed from the already-in-hand `WorkstreamWithRelations` object plus the newly-checked
activity ids appended — never only the new ids, since the underlying sync is a full replace, and
never only a partial patch. Gated on `canManageWorkstreams(user)` (Supervisor/Superadmin) — shown
instead of, not alongside, the older single-activity flow for those roles; an Employee still sees
exactly their pre-existing "Add an activity to this Service" (renamed from "Add another activity to
this service" for consistency with the new heading) single-select-then-stage flow, completely
unchanged in mechanics (still atomic with the Task's own save, still gated by the existing
`canExtendServiceActivities`). **Zero backend/RLS/RPC/migration change** — both paths route through
already-existing, already-hosted capabilities.

**Persistence/refresh (Part I)**: `updateWorkstream` is a real DB write — any other authorized user
sees the enlarged Activity set the next time their own role-scoped data loads; no notification
system was added or needed. `onSaved` calls the Task form's existing `refreshWorkstreams()`, so the
newly-enabled Activities appear in "Activity for this Task" and "Activities in this Service"
immediately, no hard reload.

**Part J — brand-new Activity catalog-definition creation**: audited and confirmed **no such
capability exists anywhere in the app** (an explicit `createActivity`/`create_activity` search
returned zero results) — Activity is a fixed, seeded, reusable catalog, never previously
user-creatable. Per the explicit scope boundary, this was **not** built in this pass: no new
migration/RPC/RLS was designed or applied. *Brand-new Activity catalog creation remains separate
from Service Activity association — deferred to a later, deliberate admin/catalog phase if the
product ever wants it.* The existing "associate an existing catalog Activity with this Service"
flow (both the Employee single-add and the new Supervisor/Superadmin multi-add) already fully
satisfies "the Service's many existing Activities are clearly visible/manageable while the Task
keeps exactly one."

**Verification note**: every currently-seeded mock Workstream already has its entire available
Activity Catalog enabled (`seed-workstream-activities.ts`'s own comment: a deliberate legacy
backfill that associates a matching department's *every* activity) — so `unconfiguredActivities` is
empty everywhere in the current fixture data, for both the pre-existing single-add flow and the new
multi-add dialog alike. The "Activities in this Service" list with a "Selected for Task" tag was
confirmed rendering correctly live; the multi-select dialog's own populated (non-empty) state could
not be exercised against real seed data in this pass — verified instead via `tsc` and direct
comparison against `WorkstreamFormDialog`'s already-proven identical `activityIds`/`updateWorkstream`
mechanism.

### Preserved / no-regression confirmation

Confirmed unchanged: the merged Project List+Gantt (including its Task-derived scheduling and
deep-link), Project → Tasks → List | Timeline (List default), Task Start Date, the due-only one-day
deadline block (both the Task Timeline's own and the Projects-index Gantt's), cellular Priority, the
single collapsible sidebar with "Client work," the Activities-first Service page, Internal/
Non-billable's exclusion from normal Projects browsing, Shared Notes, and Company/Contacts access
boundaries.

### Validation

- `npx tsc --noEmit` — 0 errors.
- `npx eslint src` — 0 errors, same 2 pre-existing unrelated warnings only.
- All four provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) — clean.
- Mock-mode Playwright visual verification (Employee/Supervisor/Superadmin, light + dark, desktop +
  420px mobile): role-aware Assignee column (kept for an Employee with a shared/coworker-assigned
  Task, kept for Supervisor/Superadmin), Task Status Avatars in every named surface with correct
  per-status color (Todo/In progress/Blocked/Waiting/Done all visually distinct), a live status
  change (To do → Blocked) repainting the header avatar within the same page load with no reload,
  the new "Activity for this Task"/"Activities in this Service" copy and "Selected for Task"
  indicator, and the Employee "+ New service" gate from the prior pass still working. **Zero
  console/page errors** across every screenshot.
- `npx supabase migration list` — unchanged: `20260827090000` local==remote, zero pending; **no new
  migration created**.

### Files changed (final Task Identity + Activity UX pass)

- `src/components/tasks/task-status-avatar.tsx` — new, `TaskStatusAvatar`/`taskAvatarInitials`.
- `src/components/tasks/task-list-row.tsx` — `showAssignee` axis; `TitleCell` gains the avatar.
- `src/components/tasks/task-list-section.tsx`, `src/components/workstreams/workstream-activity-tasks.tsx`,
  `src/app/dashboard/tasks/page.tsx`, `src/app/dashboard/projects/[id]/page.tsx` — thread
  `showAssignee` (computed via the new `isAssigneeColumnRedundantForViewer`).
- `src/lib/data/task-display.ts` — new `isAssigneeColumnRedundantForViewer`.
- `src/components/tasks/task-card.tsx`, `task-grid-card.tsx`, `task-timeline.tsx`, `task-drawer.tsx`,
  `task-summary-item.tsx`, `task-row.tsx`, `src/app/dashboard/tasks/[id]/page.tsx` — `TaskStatusAvatar`
  added/replacing the old status dot.
- `src/components/tasks/task-form-dialog.tsx` — "Activity for this Task" relabel, "Activities in
  this Service" panel, role-branched Add-activities trigger (`canAddServiceActivities`).
- `src/components/workstreams/add-service-activities-dialog.tsx` — new,
  `AddServiceActivitiesDialog`.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.
- **No migration file created or changed in this pass.**

## Final boss-feedback consolidation pass — new Activity creation, Subtask UI retirement, operational naming cleanup, Task Start Date default, Task Drawer redesign

Still Phase 13B — intended as the final substantive implementation pass before manual acceptance/checkpoint.

### Locked product model update

Primary operational hierarchy is now **Project → Service → Activity → Task → Checklist**. Subtask
creation is retired from the normal operational UI (Part C); independently-trackable work becomes
another Task in the right Project/Service/Activity context instead. Existing historical Subtask
data, the `parentTaskId` schema, provider methods, and every RPC/authorization boundary around them
are completely unchanged — this is a UI-only deprecation, not a data migration.

### Part B — brand-new Activity creation from the Task form

**Audit finding**: `departments`/`activities` were select-only for `authenticated`
(`20260814090001_activity_catalog.sql`) — no existing safe path let any non-`service_role` caller
insert either row directly, and `workstream_activities_write` only ever *associates* an existing
Activity id, never creates one. A genuinely new capability was required, confirmed against the
actual schema (not guessed): `departments.brand_id`/`service_line_id` (nullable, no unique
constraint), `activities.department_id`, and the established "every Department maps 1:1 to one
(brand, service_line) pair" convention (`seed-departments.ts`'s own comment — several brands
currently have **zero** Departments at all, e.g. EdgeNovelty/Bill Optimum/VeroTax Advisory/Croki
Digital, confirmed live against the seeded "IT/Digital" service line, which has no matching
Department anywhere).

**New local, unapplied migration**: `supabase/migrations/20260828090000_create_activity_for_workstream.sql`
— one `create_activity_for_workstream(p_workstream_id uuid, p_name text) returns public.activities`
RPC (`security definer`, `set search_path = ''`). Authorization mirrors `create_task`'s own
`may_extend_activities` branch (`20260818090000_task_activity_extension.sql`) exactly, re-derived
here since this is also SECURITY DEFINER and doesn't consult table RLS for its own writes: Employee
only for a Workstream they themselves lead; Supervisor only for one led by someone they manage,
within a Project they can access; Superadmin unconditionally. Department resolution: finds the
Workstream's own `(brand_id, service_line_id)` Department, or creates exactly one (named after the
service line, matching the existing convention) rather than exposing Department as a user-facing
field. Duplicate handling: reuses an existing Activity in the resolved Department whose name matches
case-insensitively (`lower(btrim(name)) = lower(v_name)`) — the same comparison
`20260817110000_expand_activity_catalog.sql`'s own catalog-seeding already used — rather than
inserting a duplicate. Associates the (new or reused) Activity with the current Workstream
(`on conflict do nothing`, since `(workstream_id, activity_id)` is the primary key) in the same
function call — atomic, no separate two-call sequence to partially fail. `revoke ... from public,
anon` / `grant execute ... to authenticated, service_role` — no other RLS/grant on
`departments`/`activities`/`workstream_activities` was touched. `npx supabase db push --dry-run`
confirms this is the **only** pending migration. **Not applied to hosted Supabase** — local review
only, exactly as instructed.

**Provider plumbing**: new `WorkstreamsProvider.createActivityForWorkstream(viewer, workstreamId,
name)` — mock provider re-implements the identical authorization/dedup/department-resolution logic
in TypeScript (verified against a real "zero Department" brand); Supabase provider is a thin
`.rpc("create_activity_for_workstream", {...})` call.

**UX**: `TaskFormDialog` gained a "+ Create Activity" trigger (new
`src/components/workstreams/create-activity-dialog.tsx` — a single "Activity name" field, no other
input; Department is auto-resolved/locked server-side, never asked of the user) alongside the
existing "Activities in this Service" panel and the Supervisor/Superadmin multi-select "Add existing
activities to Service." Gated by the same `canExtendActivities` scope as the pre-existing
single-activity flow — available to Employee/Supervisor/Superadmin alike, each within their own
already-legitimate Project/Service scope, never broader. On success the new Activity is immediately
selected for the current Task and the form continues without leaving it.

**A real bug was found and fixed during this pass's own visual verification**: the first
implementation only called `refreshWorkstreams()` after creating an Activity, which is sufficient
for *associating an already-cataloged* Activity (only the Workstream's own enabled-id list changes)
but not for creating a **new** one — `useWorkstreamActivities`/`useActivityCatalog` each cache the
catalog data itself in their own separate hook state, unaffected by a Workstream-list refetch. Live
testing against the real "IT/Digital, zero Departments" Workstream reproduced it exactly: the newly
created Activity's raw id showed in the "Activity for this Task" select instead of its name, and
"Activities in this Service" still said "No activities set up for this service yet." Fixed by also
capturing and calling `refresh` from both `useWorkstreamActivities` and the direct
`useActivityCatalog` call in `handleActivityCreated` — re-verified live afterward (fresh mock
server, to rule out an HMR artifact) showing the correct name immediately selected and listed.

**All Task-creation surfaces covered** by construction — every entry point (global "+ New Task",
Project's "+ New Task", a Service's "+ Add Task"/per-Activity "Add Task", the Dashboard/My Day/
Planner "+ Add task" actions) already shares the one `TaskFormDialog` component; this pass only
changed that one shared component, not each call site. `quick-add-from-activity-dialog.tsx`
(curated, title-only bulk quick-add with `startDate`/`dueDate` both deliberately null) was
evaluated and left alone — a structurally different, minimal-metadata creation path, not a
candidate for either the Start Date default or the Activity-creation UI.

### Part C — Subtask creation retired from normal UI

Removed the entire `AddSubtaskDialog` component (now fully unreferenced) and every "+ Add Subtask"
trigger — the full Task page's `TaskSubtasksSection` no longer offers creation, and now renders
**nothing at all** for a Task with zero historical Subtasks (no empty card, no deprecation language)
or a compact, still fully navigable/read-only card when historical ones exist. Nothing else was
removed: `parent_task_id`, `createSubtask`/`useSubtasks`, every RPC/RLS boundary, and all historical
Subtask/time/checklist data are completely untouched. Considered and deliberately declined a "+ Add
related Task" alternative — the existing "+ New Task" already covers the same need with the current
Project context in reach, and adding a second trigger risked more confusion than it resolved (the
explicit "use judgment... simply remove and rely on standard New Task" escape hatch in the request).

### Part D — operational naming cleanup: Company name is the daily identity

New shared module `src/lib/data/project-display.ts` — `operationalProjectIdentity(companyName,
projectName)` returns `{ primary: companyName, secondary }`, where `secondary` is `null` whenever
`projectName` is exactly the Company name, or the Company name followed by a trailing single year or
year range (`isRedundantProjectLabel`) — the exact shape `seed-projects.ts`'s own `nameFor` always
generates for a normal annual client Project. Never renames/hides any data — `Project.name`/id and
every historical record are unchanged; this is presentation-only.

**Applied to**: the Projects List+Gantt (`ProjectIdentity`, Gantt bar text — via `barLabel`),
Project detail header (`<h1>` now shows `identity.primary`, with `identity.secondary` as a small
subtitle only when genuinely non-redundant), the Service header's Project-context link (now the
Company name), the global Task List's context cell and mobile stacked row, `TaskSummaryItem`
(Planner/Dashboard/My Day), `TaskGridCard` (My Day's bucket grid and the Tasks grouped-card view),
the full Task page's breadcrumb (collapsed from "Company → Project → Service → Activity" to "Company
→ Service · Activity," the Company name itself still linking to the Project), and the redesigned
Task Drawer (below).

**Deliberately left alone** (the explicit historical/reporting/selection exceptions): Related
Projects (needs the real date-ranged name specifically *to* disambiguate multiple Projects for one
Company — exactly the stated exception), the Client Report schedule selectors and the Tasks-list
Project filter/group-by options (`use-task-filters.ts` — a selection context where every option must
stay uniquely identifiable, not a passive display), and the Project/Service pickers inside
`TaskFormDialog` itself (same reasoning). Report generation's own period/year display
(`docs/current-project-state.md`'s existing Phase 12A behavior) was not touched at all — it already
derives its year from the actual selected report period, never from `Project.name`.

### Part E — Task Start Date defaults to today (create only)

`emptyForm` (`TaskFormDialog`, used only for the create-mode branch — editing an existing Task
already separately seeds `startDate: task.startDate ?? ""`, unchanged) now initializes `startDate` to
`todayDateOnly()` — an **already-existing** helper (`src/lib/planner-dates.ts`, added for Planner)
that formats "today" via local `Date` getters, never `.toISOString().slice(0, 10)` (which is a UTC
date and can already read as tomorrow/yesterday depending on the browser's timezone offset — exactly
the anti-pattern the request warned against). No new helper was needed. Still fully editable/
clearable before saving; re-evaluated fresh every time the create form opens (including reopening
after a previous create), so a long-running session never shows a stale date after midnight. Editing
an existing Task — including one with a genuinely null legacy `startDate` — is completely
unaffected; `createdAt`/`statusChangedAt`/timer timestamps are not used anywhere as a substitute
Start Date, and Task Timeline/Project Gantt continue to read only the real `Task.startDate`/
`dueDate`. No migration needed or created for this Part.

### Parts F/G — Task Drawer redesign + shared Drawer primitives

New `src/components/ui/detail-drawer.tsx` — `DetailDrawer`, `DetailDrawerHeader`,
`DetailDrawerIdentity`, `DetailDrawerBody`, `DetailDrawerSection`, `DetailDrawerPropertyGrid`/
`DetailDrawerPropertyRow`, `DetailDrawerFooter`. Width ~500px on desktop (`data-[side=right]:sm:w-
[500px]` — had to match the base `SheetContent`'s own `data-[side=right]:sm:max-w-sm` modifier chain
exactly for `tailwind-merge` to actually override it; a plain `sm:max-w-[500px]` silently lost to the
base class since the two didn't read as the same "slot"), full width on mobile
(`data-[side=right]:w-full`, confirmed via a real 420px-viewport measurement: 315px → 420px after the
fix). Typography/spacing reuse the app's existing scale throughout — no new pixel values invented
(section labels: the same `font-mono text-[10px] tracking-wider uppercase` every properties rail
already uses; body/property text: existing `text-sm`; secondary/muted context: existing `text-xs
text-muted-foreground`).

`TaskDrawer` rebuilt on these primitives with the requested hierarchy: **Header** (Task Status Avatar
+ title, then Company name as primary context, Service · Activity as muted secondary — never a
repeated Client/Project chain — plus a compact Status+Priority row); **Details** (Start/Due/Assignee
as a real property grid, no giant cards); **Description** (only when present); **Checklist** (one
compact "N/M complete" line); **Time** (existing compact `TaskTimerControl`, unchanged
authorization); **Subtasks** (only rendered when historical ones actually exist, via the same
retired-but-preserved `TaskRowList`); **Footer** (Edit, when authorized, + "Open full task").
`DashboardDetailDrawer` (a *list* of task summaries, not a single-entity inspector) was evaluated and
deliberately left alone — different purpose, already has its own documented width rationale; no
other real single-entity detail drawer exists in the app today, so these primitives are unused
elsewhere for now, ready for the next one.

### Preserved / no-regression confirmation

Confirmed unchanged: the merged Project List+Gantt and its Task-derived scheduling, Project →
Tasks → List | Timeline (List default), the Task Timeline's due-only one-day deadline block, Task
Status Avatars and their live status-reactive color, role-aware Assignee visibility, the shared Task
List column headers, Company/Project identity avatars, the single collapsible sidebar with "Client
work," the Activities-first Service page, Service→many/Task→one Activity, "Activity for this Task"
single-select wording, "Activities in this Service"/"Add existing activities to Service," the
Employee-scoped "+ New Service" permission fix from the prior pass, Shared Notes, Internal/
Non-billable hiding, Contacts boundaries, Client Report authorization/lifecycle, the four-provider
abstraction, and light/dark mode throughout.

### Validation

- `npx tsc --noEmit` — 0 errors.
- `npx eslint src` — 0 errors, same 2 pre-existing unrelated warnings only.
- All four provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) — clean.
- Mock-mode Playwright visual verification (Employee/Supervisor/Superadmin, light + dark, desktop +
  420px mobile): clean Company-name identity across Projects List/Gantt/detail, Service header,
  global Tasks List/Board, full Task page, and the redesigned Task Drawer (confirmed at its correct
  500px/full-width sizing); a live status change recoloring the Task Status Avatar; the Create
  Activity end-to-end flow against a real "zero Department" brand (including catching and fixing the
  stale-catalog-cache bug above); the New Task form's Start Date defaulting to the real local today
  (`08/28/2026` in this session) while an existing Task's own real Start Date/an empty legacy one
  were both preserved untouched. **Zero console/page errors** across every screenshot.
- `npx supabase migration list` / `db push --dry-run` — `20260828090000_create_activity_for_workstream.sql`
  is the only pending migration (local-present, remote-absent); `20260827090000` still local==remote.
  **Not applied.**

### Files changed (final boss-feedback consolidation pass)

- `supabase/migrations/20260828090000_create_activity_for_workstream.sql` — new, **local only, not
  applied**.
- `src/lib/data/providers/workstreams-provider.ts`, `mock/mock-workstreams-provider.ts`,
  `supabase/supabase-workstreams-provider.ts` — new `createActivityForWorkstream`.
- `src/components/workstreams/create-activity-dialog.tsx` — new, `CreateActivityDialog`.
- `src/components/tasks/task-form-dialog.tsx` — "+ Create Activity" trigger, `handleActivityCreated`
  (incl. the catalog-refresh fix), `todayDateOnly()` default in `emptyForm`.
- `src/components/tasks/task-subtasks-section.tsx` — creation UI removed; renders nothing when empty.
- `src/components/tasks/add-subtask-dialog.tsx` — deleted (fully unreferenced).
- `src/components/tasks/task-detail-content.tsx` — updated `TaskSubtasksSection` usage.
- `src/lib/data/project-display.ts` — new, `operationalProjectIdentity`/`isRedundantProjectLabel`.
- `src/app/dashboard/projects/page.tsx`, `projects/[id]/page.tsx`, `workstreams/[id]/page.tsx`,
  `tasks/[id]/page.tsx`, `src/components/tasks/task-list-row.tsx`, `task-summary-item.tsx`,
  `task-grid-card.tsx` — Company-name-primary naming cleanup.
- `src/components/ui/detail-drawer.tsx` — new, shared Drawer primitives.
- `src/components/tasks/task-drawer.tsx` — rebuilt on the shared primitives.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.

## Two corrections before hosted apply

Still Phase 13B, still pre-apply — the pending `create_activity_for_workstream` migration required a
real correction before it's ready to actually apply.

### Correction 1 — Employee Create Activity scope widened to match real Task-creation authorization

**The previous wording, "Employee (own led Service)," was wrong relative to the locked product
rule**: if an Employee may legitimately create a normal Task in a Workstream, they must also be able
to create the Activity that Task needs — regardless of whether they lead that Workstream.

**Audited the actual, current `create_task` authorization boundary rather than assuming one.**
`create_task` gates on `if not public.can_access_workstream(p_workstream_id) then raise exception`
(`20260814090000_workstreams.sql`, last redefined by
`20260814100000_hotfix_workstream_task_visibility.sql`). That function's real branches: Superadmin
unconditional; the Internal/Non-billable company's Workstream always visible; `manages_user(w.
lead_user_id)` (true for the lead themselves, or a Supervisor managing that lead); **and, separately,
a `workstream_members` branch — true for ANY team member via `manages_user(m.user_id)`, lead or
not**. The mock provider's own `createTask` uses the literal same-shaped `canAccessWorkstream` via
`requireWorkstreamAccess`. Confirmed directly against seed data: `seed-workstream-members.ts` shows
every seeded Employee (Alicia/Sam/Dana/Leo) is *only ever* a plain team member, never a Workstream
lead (every seeded lead is a Supervisor or Superadmin) — so the previous lead-only Activity-RPC
boundary was **strictly narrower** than the real, already-shipped Task-creation boundary for every
single Employee in the current data.

**Corrected `create_activity_for_workstream`'s authorization to call `public.can_access_workstream
(p_workstream_id)` directly** — the literal same function `create_task` uses, not a hand-derived
approximation of it. This can never drift from the real Task-creation boundary again. Superadmin
(unconditional) and Supervisor (their own already-accessible Workstreams) are unaffected; only the
Employee non-lead-member case is newly included, and only up to the exact scope `create_task` itself
already grants. The mock provider's `createActivityForWorkstream` was updated identically, now
calling the shared `canAccessWorkstream` helper (the same one `createTask`'s own
`requireWorkstreamAccess` uses) instead of a bespoke `mayExtendActivities` expression.

**A second, related bug was found and fixed during this same correction's own live verification**:
the Task form's client-side gate for showing the "+ Create Activity" button had NOT been updated
alongside the backend — it was still calling the old, narrower `canExtendServiceActivities` (lead-
only for Employee), so a non-lead Employee's own backend authorization was now correctly widened but
the button stayed invisible to her. Fixed by introducing a new `canCreateNewActivity` (in
`TaskFormDialog`, calling `canAccessWorkstream` directly with the selected Workstream's own
`leadUserId`/`team`/`companyId`) and re-gating the "+ Create Activity" button on it instead of the
old `canExtendActivities` — which continues to gate, unchanged, only the *separate*,
backend-untouched "+ Add an activity to this Service" flow (still persisted via `create_task`'s own
lead-only `may_extend_activities` branch, deliberately not touched in this pass).

**Rollback-safe Employee probes** — run entirely in-process via `npx tsx` against a direct import of
the mock in-memory `db`/`mockWorkstreamsProvider` (nothing written to disk; the process's own memory
is discarded on exit; the temporary script was deleted immediately afterward):
- **A** (Employee becomes Workstream lead via self-service Service creation, then Create Activity)
  → succeeded.
- **B** (Employee — Alicia — is a plain team member of `workstream-1`, NOT its lead, then Create
  Activity) → succeeded (the key corrected behavior).
- **C** (Alicia targets `workstream-10`, which she has no lead/member/company relationship to at
  all) → rejected with "You do not have permission to add an activity to this service."
- **D** (no cross-Service targeting is even possible — the RPC's only parameters are
  `(workstreamId, name)`, no `activityId`/`departmentId` at all) → confirmed the resolved Department
  for any call is always scoped to the target Workstream's own `(brand_id, service_line_id)`, and a
  Supervisor's own call against `workstream-1` correctly reused its existing Department (0 new rows)
  rather than creating an unrelated one.
- **E** (workstream_members/task_assignees/project_members before vs. after, byte-for-byte JSON
  comparison) → all three completely unchanged by the RPC.
- **F** (`"  Duplicate Probe Activity  "` then `"duplicate probe activity"` — different casing and
  whitespace, same Service) → both calls returned the identical Activity id; `activities` table grew
  by exactly one row total, not two.
- Live UI confirmation (mock mode, fresh server): Alicia (Employee, plain member of `workstream-1`)
  now sees and can successfully use "+ Create Activity" from the Task form, with the result
  immediately selected and listed in "Activities in this Service" — same end-to-end flow as before,
  now correctly available to her.

### Correction 2 — ordinary operational Project selectors now show the Company name too

The prior pass's own report said general "filter/selector dropdowns" would keep the full
disambiguating Project name — that was **too broad an exemption**. Audited every ordinary
Employee/Supervisor operational picker (not just passive display surfaces) and found the actual
redundant-name leak in several real components that hadn't been touched yet:

- **`TaskFormDialog`'s own Project selector** (New Task/Edit Task) — previously `p.name` directly.
- **`useProjectOptionsFromTasks`/`groupTasksBy`'s own `"project"` case** (`use-task-filters.ts`) —
  previously `task.workstream.projectName`. Both the global Tasks page's own Project filter/group-by
  AND Planner's own Project filter already share this one hook, so fixing it here fixed both
  surfaces at once — no per-page edit needed, confirmed by reading both call sites.
- **`AddVisitDialog`/`DailyVisitHoursCard`** (My Day's "Plan Client Visit" Project picker, used by
  every role including the Superadmin-only-for-now `DailyVisitHoursCard`) — previously
  `${p.companyName} — ${p.name}`.
- **`AddManualEntryDialog`**'s own Project picker (Daily Update manual entries) — previously `p.name`
  directly (Company is already picked via a separate selector immediately above it in this same
  dialog, making the Company-name-primary rule doubly appropriate here).

**New shared helpers added to `project-display.ts`** rather than regexing per component:
`operationalProjectLabel(project)` for a single standalone label, and
`operationalProjectPickerLabels(projects)` for a *list* of Projects in one picker — the latter
detects genuine same-Company collisions (two Projects in the same list resolving to an identical
Company-name primary) and falls back to the colliding entries' own meaningful secondary label (or
their full historical name, if no non-redundant secondary exists) **only for those specific
entries** — a unique primary elsewhere in the same list is never touched. **Verified this fallback
is currently inert everywhere in the app**: `seed-projects.ts`'s own `seedCompanies.map(...)` gives
every Company exactly one Project, so no operational picker can currently produce a collision. This
is intentionally reported rather than hidden, per the explicit instruction — the fallback exists so
a future multi-Project-per-Company Company doesn't silently produce indistinguishable picker rows,
without inventing speculative UI for a case that doesn't exist in the data model today.

**Confirmed already-correct / deliberately unchanged (the explicit exceptions)**: Related Projects
(genuinely needs the date-ranged name to disambiguate multiple historical Projects for one Company);
Client Report schedule selectors (`schedule-form-dialog.tsx`, `client-report-schedules-panel.tsx` —
report generation's own Project disambiguation, unaffected); `WorkstreamFormDialog` (never displays a
Project name at all — Company/Project are always fixed context passed in, never a picker);
`quick-add-from-activity-dialog.tsx` (Service-scoped, no Project reference at all); Superadmin's own
Project admin dialogs (`project-form-dialog.tsx`/`project-renewal-dialog.tsx` — editing the Project
record itself, where its real name is the correct, necessary thing to show/edit). Dashboard has no
Project-based filter at all (confirmed by search) — nothing to fix there.

### Validation

- `npx tsc --noEmit` — 0 errors.
- `npx eslint src` — 0 errors, same 2 pre-existing unrelated warnings only.
- All four provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) — clean.
- `npx supabase db push --dry-run` — `20260828090000_create_activity_for_workstream.sql` (the
  corrected file, edited in place — no second migration created) is still the only pending migration.
  **Not applied.**
- Mock-mode Playwright visual verification (Employee/Supervisor/Superadmin, live Employee non-lead
  Create Activity end-to-end): Project selectors across Task Create/Edit, global Task filters,
  Planner, and Related Projects all confirmed showing the correct identity per context; zero
  console/page errors throughout.

### Files changed (two final corrections pass)

- `supabase/migrations/20260828090000_create_activity_for_workstream.sql` — **edited in place**
  (same file, not a new migration): authorization corrected to `can_access_workstream`.
- `src/lib/data/providers/mock/mock-workstreams-provider.ts` — `createActivityForWorkstream`'s
  authorization corrected to `canAccessWorkstream`; unused narrower-check imports removed.
- `src/components/tasks/task-form-dialog.tsx` — new `canCreateNewActivity` (client-side gate fix for
  "+ Create Activity"); Project selector now uses `operationalProjectPickerLabels`.
- `src/lib/data/hooks/use-task-filters.ts` — `useProjectOptionsFromTasks`/`groupTasksBy`'s `"project"`
  case now label by Company name.
- `src/lib/data/project-display.ts` — new `operationalProjectLabel`/`operationalProjectPickerLabels`.
- `src/components/my-day/add-visit-dialog.tsx`, `daily-visit-hours-card.tsx`,
  `src/components/daily-updates/add-manual-entry-dialog.tsx` — Project pickers now use the shared
  helpers.
- `docs/phase-13b-project-workspace-history-spec.md` — this section.
- `docs/current-project-state.md` — updated.
- **No new migration file.**
