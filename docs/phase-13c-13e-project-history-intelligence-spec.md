# Phase 13C–13E — Project History & Intelligence, Task Action Correction, Form Drawer Redesign

**Status: COMPLETE / ACCEPTED / CHECKPOINTED.** One combined pass, sequenced per instruction:
(0) checkpoint accepted Phase 13B, (1) Task Edit/Delete correction, (2) Form Drawer redesign,
(3) Phase 13C, (4) Phase 13D, (5) Phase 13E, (6) validation — followed by a final completion pass
(security review + race-safety fix for `delete_task`, closing the Planner/Dashboard Task Action
gaps, Completed Work/Time & Team/Timeline date-truthfulness and local-calendar-date correctness
fixes, and the reviewed hosted apply of `delete_task`), a final security hardening pass (Part 6 —
Supervisor Task-mutation scope narrowed, hosted and verified), and a final visual polish pass
(Part 7 — compact Status/Priority dropdowns, fixed action-column alignment, truncation
accessibility). Phase 13B was checkpointed and pushed as commit `128205a` before any of this work
began — see `docs/phase-13b-project-workspace-history-spec.md`'s own final section for that pass.
The user has given final acceptance ("PHASE 13 FINAL VISUAL ACCEPTED") to everything in this
document; it is checkpointed via `checkpoint: complete phase 13 project history and intelligence`
— see `docs/current-project-state.md` for the exact commit hash. No Phase 14 work is included.

## Part 0 — Phase 13B checkpoint

Committed as `checkpoint: complete phase 13b project workspace foundation` (`128205acb58093f3687297b611e5f15a44d440d3`),
pushed to `origin/main`. `references/`, `.claude/settings.local.json`, `.env*` excluded. Full detail
already recorded in `docs/phase-13b-project-workspace-history-spec.md`.

## Part 1 — Task Edit/Delete correction

**Audit finding (not assumed): Task delete did not exist in any form before this pass.** `tasks`'
own grants are `select, insert, update` for `authenticated` (`20260814090002_tasks.sql`) — no
`delete`, and no DELETE RLS policy exists. `20260821190000_one_level_subtasks.sql`'s own comment on
`parent_task_id` confirms this explicitly: "no authenticated role can hard-delete a Task at all
today." `TasksProvider`'s interface had no `deleteTask` method; neither the mock nor Supabase
provider implemented one. This meant a real, safe delete RPC was a genuinely NEW capability, not a
UI gap in front of an existing safe backend.

**Dependent-record audit:**
- `time_entries.task_id` — `on delete cascade`. A hard delete would silently destroy logged
  effort/financial history. **Blocked.**
- `tasks.parent_task_id` — `on delete restrict`. A Task with live Subtasks cannot be deleted at the
  DB level at all; a raw delete would surface a bare Postgres FK-violation. **Blocked with a
  truthful message instead.**
- `notes.task_id` — `on delete cascade`. A Task-scoped Shared Note (`createTaskNote`/
  `listNotesForTask`) is real recorded context. **Blocked.**
- `checklist_items.task_id`, `task_assignees.task_id`, `task_handoffs.task_id` — all `on delete
  cascade`, but these are structural to the one Task being removed, not independent evidence.
  **Allowed to cascade** in the safe case (no time/Subtasks/notes).
- `client_reports.departments`/`history` — `jsonb` snapshots with **no live FK** back to `tasks`
  (`20260814110006_client_reports.sql`). A Task's lifecycle can never affect already-generated
  report content, regardless of delete. **Not at risk either way.**

**Design: `delete_task(p_task_id uuid)`** —
`supabase/migrations/20260828100000_delete_task.sql`. SECURITY DEFINER (required — an INVOKER
function running as `authenticated` could never see all dependent rows through `time_entries`'/
`notes`' own restrictive SELECT-only RLS, nor perform the DELETE itself, since `authenticated` has no
DELETE grant on `tasks` at all), `search_path = ''`, all table references schema-qualified, revoked
from `public`/`anon`, granted to `authenticated`/`service_role`. Authorization: reuses
`public.can_edit_task(p_task_id)` directly — the exact same boundary already gating
`tasks_update`/`checklist_items_write`, not a separate "can_delete_task" approximation (Supervisor/
Superadmin unconditional, or the Employee who self-added the Task). Blocks with a specific,
truthful exception (never a bare Postgres error) whenever the Task has any logged TimeEntry, any
Subtask, or any attached Note; otherwise hard-deletes. Mirrored identically in
`mock-tasks-provider.ts`'s `deleteTask`, and called via `supabase.rpc("delete_task", ...)` in
`supabase-tasks-provider.ts`.

**Final security review (before hosted apply) found and fixed one real gap: TOCTOU/race safety.**
The original version ran its dependency COUNT checks and only then issued a plain
`delete from tasks`, with no lock held across that gap — a concurrent transaction could in
principle INSERT a new `time_entries`/`notes`/Subtask row referencing this exact Task between the
check and the DELETE, and since those FKs are `on delete cascade` (not restrict), the DELETE would
then silently cascade the newly-inserted evidence away. **Fixed** by adding
`select id into v_locked_id from public.tasks where id = p_task_id for update` — done FIRST, before
any dependency check. Postgres already implicitly takes a `FOR KEY SHARE` lock on a referenced
parent row for any INSERT into a table with an FK pointing at it, and `FOR KEY SHARE` conflicts with
`FOR UPDATE` — so once this function holds the lock, a concurrent racing INSERT blocks until this
function's own transaction ends; conversely, an insert that already committed before this function
started is visible to the COUNT checks (which run after the lock is acquired) and correctly blocks
deletion. Either way the check-then-act window is closed by real Postgres lock semantics, not an
assumption about statement ordering. Existence-then-permission error ordering (`Task not found.`
before the `can_edit_task` check) was confirmed to already match this codebase's own established
convention exactly (`update_task_status`, `toggle_checklist_item`) — not a new information-disclosure
decision made in isolation for this RPC.

**Legacy Subtask delete policy — explicit decision, not inherited by accident**: a Subtask that is
itself otherwise safe to delete (no logged time, no attached Notes — a Subtask can never have its
own children, nesting is one level only) MAY be deleted under the exact same `can_edit_task`
boundary as any other Task. This is not a looser rule: a Subtask already behaves as a full,
independently mutable Task in every other respect (status changes, checklist, time-logging, and
field edits are all already unrestricted by `updateTask`/`update_task_status` — only its Workstream/
Activity context is locked to its parent's). The "historical Subtasks remain viewable" rule this
product locks is about never hiding or silently converting a Subtask that carries real completed
work — fully honored here via the identical TimeEntry/Note blockers a top-level Task gets. An empty,
never-actually-used legacy Subtask carries no historical substance those blockers exist to protect.
Deleting a Subtask never touches its parent Task row (verified via mock probe H).

**Completed-Task delete consequence**: the backend treats a `done` Task identically to any other
safe Task — no special-casing (verified via mock probe J). The truthful "will also remove it from
Completed Work and Timeline" consequence is communicated by `TaskActionsMenu`'s own confirm-dialog
text (conditional on `task.status === "done"`), not a different backend code path.

**This was reviewed as the exact "if a new security-sensitive delete RPC/schema change would be
required" case the instructions anticipated — held local-only, unapplied, until this final pass's
explicit security review completed, then applied to hosted Supabase** (see Migration Apply below).

**`canDeleteTask`** (`src/lib/data/permissions.ts`) — added, identical to `canEditTask` (a thin,
explicitly-named wrapper, not a new rule): `canDeleteTask(viewer, task) = canEditTask(viewer, task)`.
Documented as a UI-only convenience gate — `delete_task` re-derives and enforces itself.

**Shared `TaskActionsMenu`** (`src/components/tasks/task-actions-menu.tsx`) — the one Edit/Delete
surface every Task view now uses. Built on the existing `DropdownMenu` primitive (already used once,
in `saved-views-bar.tsx`, as the reference pattern) plus the existing `ConfirmDialog` (extended with
an optional `confirmVariant="destructive"` prop for the red confirm button — the only change to that
shared primitive). Renders nothing when the viewer has neither `canEditTask` nor `canDeleteTask` —
never a visible-but-disabled menu. The trigger stops `click`/`pointerdown` propagation so it's safe
to nest inside a clickable row, a `<Link>`/`<button>`-wrapped card, or a dnd-kit draggable Board
card. A `hideEditItem` prop supports the two detail surfaces (Task Drawer, full Task page) that keep
their own always-visible "Edit" button next to the title and use this component only for the
overflow "⋯" (Delete-only) — matching the locked `[Edit] [⋯]` pattern, never a redundant second Edit
entry point.

**Surfaces wired** (audited per the instruction's own list):
1. **Global Tasks List** (`task-list-row.tsx`, via `task-list-section.tsx`'s `TaskListSection`/
   `FlatTaskList`) — kebab as a trailing flex sibling of the row content; `TaskListHeader` gained a
   matching `showActions` spacer so columns stay aligned.
2. **Global Tasks Board** (`task-board.tsx`/`task-card.tsx`) — kebab in the card's own top-right
   header row; `TaskActionsMenu`'s propagation stop prevents both dnd-kit drag-start and the card's
   navigate-on-click.
3. **Project → Tasks → List** — same shared `TaskListSection`/`FlatTaskList`, wired identically.
4. **Project → Tasks → Timeline** (`task-timeline.tsx`) — kebab appended to the left identity
   column only (the Gantt bars stay read-only, too narrow for a reliable target).
5. **Service → Activity Tasks** (`workstream-activity-tasks.tsx`) — same shared `TaskListRow`,
   threaded through `ActivityTaskRows`/`ActivityCard`/`Section`.
6. **My Day** (`bucket-task-grid.tsx` → `task-grid-card.tsx`, all three role variants) — kebab as an
   absolutely-positioned overlay, a sibling of the card's own `<button>`/`<Link>` (never nested
   inside — a `<button>` cannot legally nest in either).
7. **Planner** — now wired everywhere (final pass, closed further in the security-hardening pass
   below). `PlannerDayView`, `PlannerGroupView`, and `PlannerUnscheduledPanel` (the three surfaces
   using `TaskSummaryItem`'s "row" variant) gained `onEdit`/`onDeleted`, threaded from
   `planner/page.tsx`'s own `editingTask` state and a `useTasks()` `refresh`. **Week/Month
   ("chip" variant) initially kept no action menu at all — closed as a real consistency gap in the
   final hardening pass**: the chip itself stays exactly as compact as before, and an always-visible
   (never hover-only) `TaskActionsMenu` renders as a flex sibling next to it. Hover-reveal was
   deliberately rejected even though the instructions suggested it as the "preferred" option — hover
   has no touch-device equivalent at all, and this component has no reliable way to know whether
   it's rendering for a mouse or a touch user, so an always-visible trigger (at the same
   already-accessible size `TaskActionsMenu` uses everywhere else in the app, never shrunk to fit)
   is the only option that is deterministically reachable on both input types. Verified live: the
   kebab opens without navigating away from Planner (Week and Month both), Edit opens the canonical
   `TaskFormDialog` in place, Delete's confirm/cancel both work without leaving Planner, and the
   calendar grid itself is visually unchanged (chips are only very slightly wider to fit the
   trigger — no extra rows, borders, or colors).
8. **Dashboard Task summary / Quick View** — now wired (final pass). `TaskKpiDetail` and
   `TaskStatusFocusContent` (both used across `employee-/supervisor-/superadmin-dashboard.tsx`)
   gained `onEdit`/`onDeleted`; each dashboard gained its own `editingTask` state and edit-mode
   `TaskFormDialog`, with `onEdit` closing the KPI detail dialog first (`close()`) before opening the
   form — never a stacked dialog-on-dialog. `onDeleted` refreshes the dashboard's own Task list(s)
   (Supervisor/Superadmin also refresh the broader org-wide `useTasks()` list the KPI counts are
   drawn from, not just their own `useMyTasks()`, so a deleted Task disappears from the count
   immediately). The separate Dashboard Quick View (`TaskDrawer`, opened by clicking a KPI-detail row
   itself, not its kebab) keeps its own unchanged `[Edit] [⋯]` footer from Part 1's earlier pass — no
   duplicate Edit control was introduced. Verified live: clicking a row still opens the Quick View
   Drawer; clicking the kebab does not also open it; both the KPI-detail kebab and the Drawer's own
   controls edit/delete correctly.
9. **Task Drawer** (`task-drawer.tsx`) — kept its existing visible "Edit" button, added
   `TaskActionsMenu` with `hideEditItem` next to it for Delete; on success, closes the Drawer and
   calls the caller's `onChanged`.
10. **Full Task page** (`app/dashboard/tasks/[id]/page.tsx`) — same pattern; on success, navigates
    to the Task's own Project's Tasks tab (`?tab=tasks`) when it has one, else the global Tasks list.
11. **Legacy Subtask display** (`task-subtasks-section.tsx`) — left untouched, per the locked
    "Subtask creation retired, historical Subtasks remain viewable" rule; no edit/delete affordance
    was added there (a Subtask is a full Task and already gets Edit/Delete once opened via its own
    row's navigation into the full Task page or Drawer).

**Row-click conflict**: `TaskActionsMenu`'s trigger calls `stopPropagation` on both `click` and
`pointerdown` (the latter specifically for dnd-kit, which listens on pointerdown) — verified live
(Board section below) that opening the menu never also navigates or starts a drag.

## Part 2 — Form Drawer design system

New primitives, `src/components/ui/form-drawer.tsx` — a distinct family from `DetailDrawer`
(view/inspect only), not an overload of it: `FormDrawer`, `FormDrawerHeader`, `FormDrawerBody`,
`FormDrawerSection`, `FormDrawerPropertyGrid`, `FormDrawerField`, `FormDrawerDisclosure`,
`FormDrawerFooter`. Width 540px desktop (520-560px range), full-width mobile. Typography/spacing
follow the locked scale (20px semibold title, 13-14px context, 12-13px muted secondary, 11-12px
tracked-uppercase section labels, 12-13px field labels, existing 13-14px input default). One scroll
region (`FormDrawerBody`), sticky header and footer.

**Task Create/Edit** (`task-form-dialog.tsx`) rebuilt on these primitives: HEADER (title + Company
name + Service · Activity, shown once, never repeated below) → TASK (Title, Description) → CONTEXT
(Project/Service/Activity selectors, "Activities in this Service" panel, Add existing/Create
Activity actions — logic completely unchanged, only the wrapping markup changed) → WORKFLOW (a
`FormDrawerPropertyGrid` for Status/Priority and Start/Due, Assignee below it, employee-hidden) →
CHECKLIST → sticky FOOTER (Cancel / Create-or-Save). No advanced/progressive-disclosure section was
added — every field already shown is either core-required-adjacent (Project/Service/Activity) or a
compact workflow property; there was no genuinely low-frequency field to hide. Start Date still
defaults to `todayDateOnly()` on create only; Edit still seeds from the real existing/null value —
neither behavior was touched.

**Service Create/Edit** (`workstream-form-dialog.tsx`) rebuilt identically: HEADER (title + Company
name + partner brand) → SERVICE (service-line select, qualifier, description) → OWNERSHIP (Lead,
Team) → SCHEDULE (Status/Start/End in a property grid, then the recurrence Switch — its own on/off
state IS the progressive-disclosure trigger, exactly matching "should appear only when recurrence
is enabled," so no separate "More options" toggle was needed) → ACTIVITIES → FOOTER.

**Activity creation** — deliberately left alone. `CreateActivityDialog` was already exactly the
"one field, compact dialog" shape the instructions ask for (`sm:max-w-sm`, single Activity-name
input, Cancel/Create footer) — not converted to a FormDrawer, and never opened as a second stacked
Drawer while the Task/Service FormDrawer is open (it renders as a sibling `Dialog`, portaled
independently, exactly like before).

**No nested drawer chaos**: verified by inspection — every dialog that can open while a Task/Service
FormDrawer is already open (`ReusePastTaskDialog`, the inline "+ New service"
`WorkstreamFormDialog`, `AddServiceActivitiesDialog`, `CreateActivityDialog`) is a focused `Dialog`
or a second `Sheet`-based drawer that was already the established pattern before this pass — none of
this restructuring introduced a new stacked-drawer case.

## Part 3 — Phase 13C: Project Completed Work + Client Report History

**History IA**: the History tab (previously a single scroll with one "Related Projects" card) now
has an internal pill sub-nav — Context / Completed Work / Client Reports / Time & Team / Timeline —
styled as a second-level instance of the same tab visual language the Project page's own top-level
tabs already use. Description and `SharedNotesSection` moved from the Overview tab into History's
new **Context** sub-tab, alongside Related Projects (moving rather than duplicating, since a second
note-composer instance editing the same data would be confusing) — Overview keeps only its
"Current Services" preview card.

**Completed Work** (`src/components/projects/project-completed-work.tsx`) — top-level Tasks
(`!parentTaskId`) with `status === "done"`, grouped by the real LOCAL calendar month of
`statusChangedAt`. **Completion timestamp truthfulness (revised in the final pass)**:
`statusChangedAt` only ever updates on a genuine status transition (confirmed against
`update_task_status`'s own guarded same-status early-return, which never touches the column) — so
for a Task currently `done` it reliably reflects "when this most recently became done," even after a
done → in-progress → done round-trip. **`updatedAt` is no longer used as a silent fallback** for the
*displayed* completion date — the original version's `statusChangedAt ?? updatedAt` would have
labeled a legacy Task (one whose `statusChangedAt` predates that column) with a fabricated
"Completed {date}" derived from an unrelated field edit. A Task with `statusChangedAt == null` is
now grouped into its own **"Completion date unavailable"** bucket (sorted last, never mixed into a
real dated month) and shown with a plain "—" instead of an invented date; `updatedAt` is used only
as an internal, never-displayed tiebreaker to keep that bucket's own internal order deterministic.
No such legacy row exists in current seed data (every seeded `done` Task has a real
`statusChangedAt`), so this bucket is currently inert everywhere — same "report ambiguity, don't
hide it" reasoning as Phase 13B's own collision-aware Project-label fallback. **Local calendar
grouping**: month keys are derived via the new `monthKeyFromTimestamp` helper (`planner-dates.ts`,
added this pass) rather than `timestamp.slice(0, 7)`, so the displayed month always matches the
local calendar month the completion actually fell on. **Legacy Subtask handling**: Subtasks are
excluded from this top-level list entirely (never their own row, never double-counted); a parent
with Subtasks shows a small "X/Y subtasks" caption via the existing `subtaskSummary` helper instead —
no historical Subtask record is hidden or deleted. **Filters**: Service/Activity/Period selects,
only rendered when more than one option exists.

**Client Report History** — reuses the existing `useClientReports()` hook (already
authorization-correct: `listReports` returns every report `canViewClientReport` already permits,
enforced by the mock's own explicit predicate and by `can_view_client_report` RLS on the Supabase
side) and narrows it client-side to `report.projectId === project.id`. This is safe, not a bypass:
the authorization already happened before the filter runs. **Client Report access does NOT come
from Project access** — a report the viewer isn't independently authorized for (per
`canViewClientReport`: owner, a reporting reviewer, or a non-Employee who manages the generator)
never appears here regardless of whether the viewer can see the Project. Presentation reuses the
existing `ClientReportsTable` component verbatim — no visible Draft/Finalized status, no
"Generated by"/"Project" columns, exactly the Phase 12A precedent, inherited automatically rather
than re-implemented.

## Part 4 — Phase 13D: Safe Project Time + Team Intelligence

**TimeEntry authorization audit**: `time_entries_select` RLS
(`user_id = auth.uid() or manages_user(user_id)`, `20260814090003_time_entries.sql`, unchanged by
any later migration) — an Employee sees only their own; a Supervisor sees their own + direct reports
(one level, no transitive chain); a Superadmin sees everyone's (since `manages_user` is
unconditionally true for a superadmin viewer). **New provider method**
`listTimeEntriesForTasks(viewer, taskIds)` (`time-entries-provider.ts`, mirrored in both mock and
Supabase providers) — a plain filtered read, no new RPC, no new migration: the existing RLS policy
already scopes any such query correctly, exactly like the existing `listTimeEntriesForDate`.

**Truthful labeling**: the total is labeled from the viewer's own role, never inferred after the
fact — `"Total Project Time"` for Superadmin (their query result genuinely is the complete set),
`"Visible Team Time"` for Supervisor (own + direct reports, explicitly not claimed to be complete),
`"Your Time"` for Employee. Breakdown by Service and by Activity (joining each entry's `taskId`
back to the already-fetched Project Task list, since the TimeEntry read shape itself carries only a
light Task context, no workstream/activity). Date range: This Month / Last 30 Days / Custom (no
existing reusable range control was found in the codebase — this is a new, narrowly-scoped local
component, not a repurposed `ReportRangeLabel`, which is baked into Report-generation semantics).

**Local calendar date correctness (fixed in the final pass)**: every date computation now reuses
`planner-dates.ts`'s existing local-date helpers instead of hand-rolled `new Date().toISOString()
.slice(0, 10)` logic (the exact anti-pattern that module's own header comment warns against, since
it reads the UTC date and can already be tomorrow/yesterday depending on the browser's offset).
"Today," "This Month," and the default Custom bounds now use `todayDateOnly()`/`startOfMonth()`/
`formatDateOnly()`. **"Last 30 Days" is now exactly 30 local calendar dates including today** —
`addDays(new Date(), -29)` through today, not `-30` (which would have been 31 dates: today plus the
previous 30). **TimeEntry range membership** is now decided by `dateKeyFromTimestamp(e.startTime)` —
the entry's own LOCAL calendar day — rather than `startTime.slice(0, 10)` (the UTC day, which can
misclassify an entry logged near local midnight; this is a local staff calendar view, not an UTC
one). **Custom range validation**: `customStart > customEnd` now shows a destructive `Alert`
("Start date must be on or before end date.") and the totals/breakdowns show "no time logged" rather
than silently returning confusing partial data for a reversed range.

**Team intelligence** (`teamSnapshot`, non-Employee only) — per visible assignee (derived from the
Project's own already-fetched, already-task-authorized Task list, a separate visibility axis from
TimeEntry access): open Task count, completed-in-range count. **Completion-count truthfulness
(fixed in the final pass)**: a Task only counts toward "completed this period" when it has a genuine
`statusChangedAt` — the same `?? updatedAt` fallback bug from Completed Work existed here too (a
legacy Task with no real completion timestamp could have been silently counted into whichever period
`updatedAt` happened to fall in); a Task without a trustworthy completion date is now simply never
counted in any period, rather than counted using a fabricated date. Local calendar date, via
`dateKeyFromTimestamp`, same reasoning as above. No ranking, no productivity score, no
idle/geolocation tracking — none of that data exists anywhere in this model, and nothing here
invents a source for it. Employee never sees this section at all.

## Part 5 — Phase 13E: Project Operational Timeline

**No generic audit table** — `src/components/projects/project-timeline.tsx` aggregates client-side
from records this Project workspace already fetched for its other sections: Task completion/
most-recent-status-change (`statusChangedAt`, same reliability reasoning as 13C's Completed Work —
only the single most recent transition is ever shown, since no full status history is stored),
Client Report generation (`generatedAt`), Shared Note creation (`createdAt` + `author.fullName`),
Service creation (`workstream.createdAt`). Sorted descending by absolute timestamp chronology
(unchanged — chronology never needs "local day" semantics, only real instant ordering), grouped by
LOCAL calendar day, with a "Load older activity" button revealing 50 more at a time (client-side
slice over the already-fetched, already reasonably-sized in-memory list — no server pagination
needed at this data scale).

**Local day-grouping fix (final pass)**: the day-grouping key was `timestamp.slice(0, 10)` (the UTC
date) while the group's own visible label used `new Date(...).toLocaleDateString(...)` (the LOCAL
date) — a real bug where an event near local midnight could be grouped under one date while its own
displayed heading showed a different one. Fixed by deriving the grouping key with the same
`dateKeyFromTimestamp` local-date helper the label already effectively used, so the two can never
disagree. **Report date-only fields preserved as-is**: `report.rangeStart`/`rangeEnd` are genuine
`YYYY-MM-DD` domain dates (a reporting period boundary, not a precise instant) and are formatted the
same way `client-reports-table.tsx`'s own established `formatDate` already does elsewhere in the
app (`new Date(value).toLocaleDateString(...)`) — deliberately NOT run through
`parseDateOnly`/timestamp-timezone logic, since doing so would make the Timeline's own report-date
rendering diverge from every other report-date display in the product; report-date semantics are a
separate, already-settled domain this pass does not touch.

**Deliberately excluded** (no stored timestamp exists for any of these, so none are shown): page
views, logins, checklist-item ticks, mouse/keyboard/idle signals. **Authorization**: every event
source is data this Project workspace was already independently authorized to fetch (Task
visibility, Client Report `canViewClientReport`, Note visibility) — the Timeline never re-derives
or weakens any of those, it only sorts and renders.

## Part 6 — Final security hardening: Supervisor Task-mutation scope

**Discovered legacy over-breadth (found during final Phase 13 review, not assumed)**: re-reading
the CURRENT, never-redefined source of `can_edit_task`/`can_progress_task`
(`20260814090002_tasks.sql`, untouched by every migration since) showed both were role-global for
Supervisor:
```
can_edit_task:     is_supervisor() OR is_superadmin() OR (self_added creator)
can_progress_task: is_supervisor() OR is_superadmin() OR (assignee)
```
Any Supervisor could edit or progress ANY Task in the entire org — including one with no
relationship to them at all — which directly conflicts with the locked product model ("Supervisor =
Employee experience + legitimate direct-report/team privileges, NEVER org-wide"). This is a real
authorization gap (every RLS policy/RPC gated on these two functions — `tasks_update`,
`task_assignees_write`, `checklist_items_write`, `update_task_status`, `toggle_checklist_item`,
`add_task_checklist_item`, and `delete_task` — inherited the same over-broad scope), not merely a UI
completeness gap.

**Final hardened semantics** — Supervisor's branch in both functions narrowed from unconditional
`is_supervisor()` to `is_supervisor() AND can_access_task_directly(target_task_id)`. Reused the
already-existing, already-documented mutation-safe helper (`can_access_task_directly`, a thin
wrapper over `can_user_access_task`, from `20260821210000_subtask_direct_access_canonical_fix.sql`
— explicitly documented there as "Use this (never can_access_task) as the authorization gate for any
MUTATION or side-effect on a Task"). **Deliberately NOT `can_access_task`** (the instruction's own
"conceptual" sketch) — that broader, hierarchy-inclusive READ-visibility function also grants
one-hop parent/child Subtask visibility, and composing it would have let a Supervisor gain
EDIT/PROGRESS rights over a Subtask they can merely *see* for context (because they manage the
parent Task's own assignee) despite no direct relationship to the Subtask's own assignee — exactly
the kind of over-grant this hardening exists to close. This is an audited correction to the
instruction's own sketch, not a deviation made without justification. Superadmin and the Employee
self-added-creator/plain-assignee branches are completely unchanged.

**Recursion analysis (required before composing any helper)**: read the CURRENT bodies of
`can_access_task`, `can_access_task_directly` (→ `can_user_access_task`), `can_access_company` (→
`can_user_access_company`), `manages_user`, `is_supervisor`/`is_superadmin` in full. None reference
`can_edit_task`/`can_progress_task` anywhere, directly or transitively — a clean DAG
(`can_edit_task`/`can_progress_task` → `can_access_task_directly` → `can_user_access_task` →
{`profiles`, `task_assignees`, `tasks`, `can_user_access_company`} → {`companies`,
`project_members`, `profiles`}), never a cycle. All SQL, `security definer` — the same
already-proven-safe composition pattern used throughout this schema.

**Migration**: `supabase/migrations/20260828110000_supervisor_task_mutation_scope_hardening.sql` —
`create or replace function` on exactly `can_edit_task`/`can_progress_task` (re-asserting their
existing grants: revoked from `public`/`anon`, granted to `authenticated`/`service_role`). No new
RLS, no new table grant, no new role. `tasks_update`/`task_assignees_write`/`checklist_items_write`
(which reference these functions by name in their own `using`/`with check` clauses) and
`update_task_status`/`toggle_checklist_item`/`add_task_checklist_item`/`delete_task` (which call
them by name) all automatically inherit the new, correctly-scoped behavior — none of them needed to
be touched. `delete_task` (`20260828100000`, already hosted) was **not edited** — its own
`can_edit_task(p_task_id)` call now resolves to the corrected function the moment this migration
runs; its FOR UPDATE lock, TimeEntry/Note/Subtask blockers, and every other already-reviewed
property are completely unaffected. `can_log_time_on_task` is untouched (not referenced, not
redefined) — time logging remains its own explicit assignee-only rule for every role.

**Mock/frontend parity**: `canEditTask`/`canDeleteTask`/`canProgressTask`/`canAddTaskChecklistItem`
(`permissions.ts`) all widened to accept `{assigneeIds, companyId}` (in addition to their existing
fields) and a new `allUsers: User[]` parameter, with the identical narrowed-Supervisor logic. Every
provider-layer call site (`mock-tasks-provider.ts`'s `updateTask`/`deleteTask`/`updateTaskStatus`/
`toggleChecklistItem`/`addChecklistItem`) passes `db.users` — the full, always-correct list, exactly
matching the existing convention every other `canAccessTaskDirectly` call site in this codebase
already uses (`mock-notes-provider.ts`, `mock-task-handoffs-provider.ts`, `mock-time-entries-
provider.ts` — never used in a UI component directly, always at the provider layer). Every UI-layer
call site (`TaskActionsMenu`, `task-drawer.tsx`, the full Task page, `task-checklist.tsx`,
`task-board.tsx`, `bucket-task-grid.tsx`) calls `useCompanyLookups()` and passes `assignableStaff` —
already exactly "my team" for a Supervisor / "everyone active" for a Superadmin
(`assignableStaffFor`'s own existing definition), so filtering it again by `managesUser` inside
`canAccessTaskDirectly` is a safe no-op. This is explicitly a UI-only convenience gate, same as
`canEditTask`/`canDeleteTask` always were — the provider/RPC re-derives and enforces the real
boundary itself regardless of what any component decides to render.

**Probes** (rollback-safe, in-process against the mock `db`, deleted immediately after running):
Priya (Supervisor) editing/progressing her own Task and her direct report Alicia's Task both
succeeded; the identical actions against a Task assigned only to Dana (Marcus's report, outside
Priya's hierarchy) were all rejected — direct `deleteTask`, `updateTask`, `updateTaskStatus`, and
`addChecklistItem` calls against that unrelated Task UUID all failed with a clear permission error,
the Task confirmed untouched every time; Alicia's own self-added Task remained fully editable by
her; Alicia could progress (status-change) a Supervisor-created Task she's merely assigned to but
could NOT full-edit its metadata; Superadmin's edit of the same unrelated Task succeeded
(legitimate, unchanged, org-wide); `canLogTime` remained assignee-only for Priya, Alicia, and Jordan
(Superadmin) alike.

## Part 7 — Final visual polish pass

Visual/UX consistency only — no architecture, role semantics, RLS, or migrations touched; no
Task-permission function (`can_edit_task`/`can_progress_task`/`can_log_time_on_task`) changed.
Driven by four external UI references, used as inspiration only (never cloned literally):
Reference 1 (clean create/edit form hierarchy) → Task/Service Create/Edit; Reference 2 (rich
work-area + compact property rail) → Full Task page; Reference 3 (paired fields, clear footer) →
minor influence on field pairing/alignment only, its own upload-heavy two-column architecture was
explicitly not used; Reference 4 (simple vertical compact properties) → Task Quick View and the
property rail's compact language.

- **Status/Priority — one compact dropdown language, everywhere they're editable.** Create/Edit
  Task's Status and Priority previously rendered as `PillSelect` — a row of five (Status) or four
  (Priority) large colored buttons, each option always visible at once. Reading as a "giant"
  segmented control competing with the rest of the form, this is now a compact `[ ● To do  ▾ ]` /
  `[ ▮▮▮ High  ▾ ]` dropdown (new shared `PropertySelect` primitive,
  `src/components/tasks/property-select.tsx`) — a plain `Select` trigger showing the current
  value's own colored dot (Status, new `StatusDot` in `task-status-badge.tsx`) or ascending bars
  (Priority, `PriorityBars`, extracted from the existing `TaskPriorityBadge`) plus its label, with
  every option rendered identically inside the open menu. The already-accepted property-rail status
  control (`TaskStatusRail`, Full Task page) was left untouched — it already used this same
  Select-plus-dot shape from Phase 12B. A Workstream's own Status picker (Service Create/Edit) was
  converted the same way (new `WorkstreamStatusDot`/`STATUS_COLOR_VAR` in
  `workstream-status-badge.tsx`), so Task and Service forms read as one product, not two. The now-
  unused `PillSelect` primitive (`pill-select.tsx`) was deleted — nothing else referenced it.
- **Reserved action-column slot, independent of per-task authorization.** The user's own observation:
  some rows in a status group show `⋯` and others don't (correct — permission-driven), but the
  columns around it should never shift because of it. Root cause found in `TaskActionsMenu`
  (`task-actions-menu.tsx`): it returned `null` outright whenever the current viewer lacked both
  `canEditTask` and `canDeleteTask` for that specific Task, collapsing its `size-7` footprint
  entirely — in a flex/grid row this measurably shifts the Due/Assignee columns for that one row
  relative to its neighbors that do have a kebab. Fixed by having it render an invisible, same-size
  `aria-hidden` `ReservedActionSlot` instead of `null` in both early-return cases (no user; neither
  permission) — one change, cascading correctly to every consumer (`TaskListRow`, `TaskTimeline`,
  `TaskCard`, `TaskGridCard`, `TaskSummaryItem` row/chip variants) without touching any of them.
  Verified in mock-mode: an Employee's own Task list shows a real kebab only on the one Task she can
  act on, with every column still perfectly aligned across the whole status group.
- **Truncation accessibility.** Added `title` attributes to every truncated Task title and
  Project/Service/Activity context string across the shared row/card components (`TaskListRow`,
  `TaskCard`, `TaskGridCard`, `TaskSummaryItem` row + chip, `TaskTimeline`) — a native tooltip on
  overflow, satisfying the "long truncated text has accessible title/label" accessibility check.
- **Everything else was already there.** Re-auditing the actual current implementation (not assumed)
  found the row grid/reserved header spacer (`taskListGridCols`/`TaskListHeader`'s `showActions`
  spacer), the Full Task page's two-column work-area/property-rail architecture, the Task Quick
  View's single-identity-line header, the Form Drawer's Task/Context/Workflow/Checklist/Footer
  structure, the Service Drawer's matching section family, and Activity's compact one-field Dialog
  already matched this pass's targets from prior phases — confirmed via source read and mock-mode
  screenshots rather than rebuilt from scratch, per "do not overabstract, do not rebuild what
  already works."
- **Verification.** `npx tsc --noEmit` (0 errors), `npx eslint src` (0 errors, same 2 pre-existing
  warnings), all four provider builds clean, mock-mode Playwright screenshots (light + dark, desktop
  + 390px mobile) of Create/Edit Task (both dropdowns open), Edit Task (values preserved), the Task
  List across all five status groups for Employee/Supervisor/Superadmin, the Full Task page (desktop
  + mobile stack), Board, the Service Create drawer (Status dropdown open, recurrence toggle), and a
  Planner spot-check — zero console/page errors throughout. No migration created or applied; `npx
  supabase migration list`/`db push --dry-run` re-confirmed local == remote, zero pending, both
  before and after this pass.

## Mock security probes (`delete_task`, rollback-safe)

Run entirely in-process against the mock in-memory `db` via `npx tsx`; the probe script was deleted
immediately afterward and confirmed absent from `git status`. All 12 required scenarios passed:

- **A** (Superadmin deletes a safe Task) → succeeded.
- **B** (Supervisor deletes a safe Task she didn't create — `can_edit_task` is unconditional for
  Supervisor) → succeeded.
- **C** (Employee deletes her own legitimately self-added safe Task) → succeeded.
- **D** (Employee attempts an unrelated, not-self-added Task) → rejected: "You don't have permission
  to delete this task."; Task confirmed still present.
- **E** (real seeded Task with logged TimeEntries) → rejected: "This task has logged time against it
  and can't be deleted..."; Task and its TimeEntries confirmed unchanged.
- **F** (real seeded Task with an attached Note) → rejected: "This task has notes attached and can't
  be deleted."; Task and its Notes confirmed unchanged.
- **G** (parent Task with a live Subtask) → rejected: "This task has subtasks and can't be
  deleted..."; parent confirmed still present.
- **H** (the same Subtask from G, otherwise safe on its own) → succeeded, per the explicit legacy-
  Subtask policy above; parent Task confirmed completely untouched by deleting its child.
- **I** (structural cascade) → safe delete removed the `task_assignees`/`checklist_items` rows for
  that Task; `projectMembers`/`timeEntries`/`notes`/`clientReports` confirmed byte-for-byte unchanged
  (JSON-serialized before/after comparison).
- **J** (a `done`, otherwise-safe Task) → succeeded, confirming the backend applies no special
  handling based on status.
- **K** (row/action propagation) — a UI/DOM concern, verified via live Playwright interaction (Part
  10 below), not re-tested as a backend probe.
- **L** (repeated delete of the same, now-deleted id) → first call succeeded; second call rejected
  cleanly with "Task not found." — no crash, no unintended side effect.

## Migration apply status

`20260828100000_delete_task.sql` was reviewed (race-safety fix applied — see Part 1 above), probed
(12/12 passing), and applied to hosted Supabase. `20260828110000_supervisor_task_mutation_scope_
hardening.sql` (Part 6 above) was then reviewed (no recursion, no privilege escalation, delete_task
inherits the fix automatically), probed (11/11 checks passing), and also **applied to hosted
Supabase**. `npx supabase migration list` / `db push --dry-run` confirm all four Phase 13B/13-final
migrations (`20260827090000_task_start_date.sql`, `20260828090000_create_activity_for_workstream.
sql`, `20260828100000_delete_task.sql`, `20260828110000_supervisor_task_mutation_scope_
hardening.sql`) are local == remote, zero pending, "Remote database is up to date." No other
migration was applied; no seed/fake data was created on hosted Supabase at any point — every write
probe ran only against the mock in-memory `db`. Re-confirmed identically at final checkpoint time
(pre-flight and post-push): all four migrations local == remote, zero pending, hosted database
aligned.

## Validation

- `npx tsc --noEmit` — 0 errors throughout every stage of this pass.
- `npx eslint src` — 0 errors; same 2 pre-existing `submitForm`/`useEffect` dependency warnings in
  `task-form-dialog.tsx`/`workstream-form-dialog.tsx` (unchanged logic, only the surrounding markup
  was restructured) — no new warnings.
- All four provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) — clean, re-run
  after every implementation change in this final pass.
- Mock-mode Playwright visual verification (Employee/Supervisor/Superadmin, light + dark, desktop +
  mobile/touch-sized viewports): New/Edit Task FormDrawer, List/Board/Timeline/Drawer/full-page
  kebabs, a full create → search → delete round trip on a throwaway Task, a live safety-block on a
  real seeded Task with logged time ("Reconcile Q2 books" — toast: *"This task has logged time
  against it and can't be deleted. Close it out instead of removing it."*, task confirmed still
  present afterward), Employee-vs-unrelated-Task kebab hiding, the Service FormDrawer, and all five
  History sub-tabs — plus, in this final pass: **Planner** (Day/Group views — kebab opens without
  navigating away, Edit opens the canonical FormDrawer in place, Delete confirm/cancel both work,
  mobile viewport has no overflow), **Dashboard** (KPI-detail-row kebab distinct from the row's own
  click-to-open-Quick-View behavior, Edit closes the KPI dialog first then opens the canonical form,
  the separate Quick View Drawer keeps its own unchanged `[Edit] [⋯]` with no duplicate Edit control),
  and **History date correctness** (Completed Work's month grouping, Time & Team's This
  Month/Last 30 Days/Custom including a reversed-range validation warning rendering correctly, and
  Timeline's day grouping) — zero console/page errors across every run.

## Files changed

- `supabase/migrations/20260828100000_delete_task.sql` — reviewed (race-safety lock added),
  probed, and **applied to hosted Supabase** (local == remote).
- `supabase/migrations/20260828110000_supervisor_task_mutation_scope_hardening.sql` — new,
  `can_edit_task`/`can_progress_task` narrowed for Supervisor, reviewed, probed, and **applied to
  hosted Supabase** (local == remote).
- `src/lib/data/permissions.ts` — new `canDeleteTask`; `canEditTask`/`canProgressTask`/
  `canDeleteTask`/`canAddTaskChecklistItem` widened (`assigneeIds`/`companyId`/`allUsers`) and
  Supervisor's branch narrowed to `canAccessTaskDirectly` (final security pass).
- `src/lib/data/providers/tasks-provider.ts`, `mock/mock-tasks-provider.ts`,
  `supabase/supabase-tasks-provider.ts` — new `deleteTask`.
- `src/lib/data/providers/time-entries-provider.ts`, `mock/mock-time-entries-provider.ts`,
  `supabase/supabase-time-entries-provider.ts` — new `listTimeEntriesForTasks`.
- `src/components/tasks/task-actions-menu.tsx` — new, `TaskActionsMenu`.
- `src/components/ui/confirm-dialog.tsx` — new optional `confirmVariant` prop.
- `src/components/ui/form-drawer.tsx` — new, the Form Drawer primitive family.
- `src/components/tasks/task-form-dialog.tsx`, `src/components/workstreams/workstream-form-dialog.tsx`
  — rebuilt on the Form Drawer primitives.
- `src/components/tasks/task-list-row.tsx`, `task-list-section.tsx`, `task-board.tsx`, `task-card.tsx`,
  `task-timeline.tsx`, `task-grid-card.tsx`, `task-summary-item.tsx`, `task-drawer.tsx` —
  `TaskActionsMenu` wired in.
- `src/components/workstreams/workstream-activity-tasks.tsx` — `onEdit`/`onDeleted` threaded through.
- `src/app/dashboard/tasks/page.tsx`, `tasks/[id]/page.tsx`, `projects/[id]/page.tsx`,
  `workstreams/[id]/page.tsx`, `src/components/my-day/{employee,supervisor,superadmin}-my-day.tsx` —
  Edit/Delete state + dialogs wired at the page level.
- `src/app/dashboard/planner/page.tsx`, `src/components/planner/planner-day-view.tsx`,
  `planner-group-view.tsx`, `planner-unscheduled-panel.tsx`, `planner-week-view.tsx`,
  `planner-month-view.tsx` — Task Action correction, all Planner views now wired (Week/Month closed
  in the security-hardening pass with an always-visible chip-level `TaskActionsMenu`).
- `src/components/tasks/task-summary-item.tsx` — "chip" variant gained an always-visible
  `TaskActionsMenu` sibling (security-hardening pass).
- `src/components/tasks/task-checklist.tsx`, `task-board.tsx`, `src/components/my-day/
  bucket-task-grid.tsx` — updated for the widened `canEditTask`/`canProgressTask`/
  `canAddTaskChecklistItem` signatures (security-hardening pass).
- `src/components/dashboard/task-kpi-detail.tsx`, `task-status-focus-content.tsx`,
  `employee-dashboard.tsx`, `supervisor-dashboard.tsx`, `superadmin-dashboard.tsx` — Task Action
  correction, final pass.
- `src/components/projects/project-completed-work.tsx`,
  `project-time-team.tsx`, `project-timeline.tsx` — new (Phase 13C/D/E), then revised in the final
  pass for completion-date truthfulness and local-calendar-date correctness.
- `src/lib/planner-dates.ts` — new `monthKeyFromTimestamp` helper (final pass).
- `src/app/dashboard/projects/[id]/page.tsx` — History sub-nav, Context/Completed
  Work/Client Reports/Time & Team/Timeline sections.
- `src/components/tasks/property-select.tsx` — new, the shared compact dropdown primitive
  (final visual polish pass).
- `src/components/tasks/task-status-picker.tsx`, `task-priority-picker.tsx`,
  `src/components/workstreams/workstream-status-picker.tsx` — rebuilt on `PropertySelect`, replacing
  `PillSelect` (final visual polish pass).
- `src/components/tasks/task-status-badge.tsx` — new `StatusDot`; `task-priority-badge.tsx` — new
  `PriorityBars` (extracted from `TaskPriorityBadge`); `src/components/workstreams/
  workstream-status-badge.tsx` — new `STATUS_COLOR_VAR`/`WorkstreamStatusDot` (final visual polish
  pass).
- `src/components/tasks/pill-select.tsx` — deleted, no longer referenced (final visual polish pass).
- `src/components/tasks/task-actions-menu.tsx` — new `ReservedActionSlot`; renders it instead of
  `null` whenever the viewer isn't authorized, so the trailing action column never shifts a row's
  other columns (final visual polish pass).
- `src/components/tasks/task-list-row.tsx`, `task-card.tsx`, `task-grid-card.tsx`,
  `task-summary-item.tsx`, `task-timeline.tsx` — `title` attributes added to truncated Task titles
  and Project/Service/Activity context strings (final visual polish pass).
- `docs/phase-13c-13e-project-history-intelligence-spec.md` — this document.
- `docs/current-project-state.md` — updated.

## Final acceptance and checkpoint

The user has given final acceptance: **"PHASE 13 FINAL VISUAL ACCEPTED."** This closes Phase 13C,
13D, 13E, the final security hardening pass (Part 6), and the final visual polish pass (Part 7) —
all COMPLETE / ACCEPTED. Confirmed at checkpoint time:
- All four Phase 13B/13-final migrations (`20260827090000`, `20260828090000`, `20260828100000`,
  `20260828110000`) local == remote, zero pending, hosted database aligned.
- `npx tsc --noEmit` (0 errors), `npx eslint src` (0 errors, same pre-existing warnings), and all
  four provider builds (`supabase`, `supabase-core`, `supabase-auth`, `mock`) passed in the accepted
  implementation run.
- Final mock-mode visual verification (security probes, Planner action consistency, and the visual
  polish pass's Status/Priority/action-alignment/truncation checks) passed with zero console/page
  errors.
- No Phase 14 work is included in this document or in the checkpoint.

Checkpointed as `checkpoint: complete phase 13 project history and intelligence` and pushed to
`origin/main` — see `docs/current-project-state.md` for the exact commit hash. This is now the new
safe baseline for the next roadmap phase.
