# Phase 12 Task Redesign Baseline

Preparation documentation for Phase 12B (sample-driven Tasks visual/product redesign). This
document is a **factual inventory of the current, already-accepted system** — produced by reading
the actual repository, not by assuming — and contains **no proposed redesign**. The user has not
uploaded reference samples yet; Phase 12B will map those samples onto the model described here.

## Current product model

Corebridge X is a PSA (professional services automation) tool. The relevant hierarchy for Tasks is:

```
Company (Client)
 └─ Project (annual/contract-scoped; a Client can have several over time)
     └─ Workstream (a Service/Workstream instance for that Project)
         └─ Activity (from the Activity Catalog, optionally tagged per-task)
             └─ Task
                 └─ Subtask (exactly one level — a Subtask can never have its own Subtasks)
```

A Task belongs to a `companyId` and a `workstreamId` (which resolves to a Project), and optionally
an `activityId`. It has a `status`, `priority`, `dueDate`, `expectedMinutes` (DB-only, no UI —
Phase 11A), a `description`, zero or more `assignees`, a `checklistItems` array, and (top-level Tasks
only) zero or more Subtasks.

## Locked role model

Exactly three roles: **Employee**, **Supervisor**, **Superadmin**. No fourth role exists or may be
introduced by Phase 12B.

- **Supervisor = Employee's own operational experience + direct-report/team privileges.** Supervisor
  is not a separate manager-only application — every screen an Employee uses, a Supervisor also uses
  for their own work, with additional visibility/authority layered on top for their team.
- **Superadmin** has organization-wide visibility/administration where appropriate, on top of the
  same base experience.

This principle must not be violated by the redesign: Phase 12B may not fork Supervisor onto a
separate "manager app," and may not invent capabilities scoped to a role that doesn't already have
a permission helper granting them (see "Permission/security boundaries" below).

## Task routes

| Route | Purpose | Component |
|---|---|---|
| `/dashboard/tasks` | Tasks Home — org/team/own task list depending on role (RLS/permission-scoped, not page-gated) | `src/app/dashboard/tasks/page.tsx` (`TasksPageContent`) |
| `/dashboard/tasks/[id]` | Full Task (and full Subtask — same route, same component) | `src/app/dashboard/tasks/[id]/page.tsx` (`TaskDetailPage` → `LoadedTaskDetailPage`) |
| `/dashboard/my-day` | Every role's own assigned work, grouped by status bucket | `src/app/dashboard/my-day/page.tsx` → `EmployeeMyDay`/`SupervisorMyDay`/`SuperadminMyDay` |
| `/dashboard/planner` | Day/Week/Month/Group/Unscheduled calendar views of Tasks | `src/app/dashboard/planner/page.tsx` |
| `/dashboard` | Role dashboard (Employee/Supervisor/Superadmin), with Task-based KPI cards/widgets | `employee-dashboard.tsx` / `supervisor-dashboard.tsx` / `superadmin-dashboard.tsx` |
| `/dashboard/workstreams/[id]` | A Workstream's own Activity-grouped Task list + "+ Add Task" per Activity | `src/app/dashboard/workstreams/[id]/page.tsx` |
| `/dashboard/projects/[id]` | A Project's own surfaces (Workstreams, and through them, Tasks) | `src/app/dashboard/projects/[id]/page.tsx` |

There is no separate Subtask route — a Subtask is a Task row with `parentTaskId` set, rendered by
the exact same `/dashboard/tasks/[id]` page and `TaskDetailContent`, distinguished only by a
"SUBTASK" badge and a "Subtask of {parent}" breadcrumb.

## Component map

| Component (file) | Route(s)/surface | Shared across roles? | Data hook/provider | Navigation behavior |
|---|---|---|---|---|
| `TaskRow` / `TaskRowList` (`task-row.tsx`) | Tasks Home list view (grouped-by-none is a `<Table>`, not this); Subtasks section list | Yes | none (pure prop-driven) | `Link` to full page by default; accepts optional `onOpen` for Quick View (used only where the caller passes it) |
| `TaskGridCard` (`task-grid-card.tsx`) | Tasks Home grouped grid view, My Day's `BucketTaskGrid` | Yes | none | Same `Link`-default / optional `onOpen` pattern |
| `TaskCard` (`task-card.tsx`, used by `task-board.tsx`) | Tasks Home Board view | Yes | none | Wrapped in a draggable `BoardCard`; click navigates via `onNavigate` |
| `TaskBoard` (`task-board.tsx`) | Tasks Home Board view | Yes | `tasksProvider.updateTaskStatus` (drag-drop) | Drag between columns changes status (permission-gated per card via `canProgressTask`); card click navigates (`onOpenTask` prop or default `router.push`) |
| `TaskSummaryItem` (`task-summary-item.tsx`) | Planner (Day/Week/Month/Group), Dashboard KPI/list-widget detail drawers | Yes | none | Always calls `onOpen` (Quick View on Dashboard, full-page navigate on Planner) — never a second Task-detail implementation |
| `TaskDetailContent` (`task-detail-content.tsx`) | Full `/dashboard/tasks/[id]` page body only | Yes (all roles, permission-gated internally) | `useSubtasks`, `tasksProvider.getTaskTimeRollup`, owns `TaskStatusRail`/`TaskChecklist`/`TaskTimeTracking`/`TaskHandoffSection`/`TaskSubtasksSection`/`NotesSection` | n/a (not clickable itself) |
| `TaskDrawer` → `LoadedTaskQuickView` (`task-drawer.tsx`) | Dashboard/Home Quick View only | Yes | `useTask`, `useTaskTimer`, `useSubtasks` | "Open full task" `Link`; "Edit" opens `TaskFormDialog` inline |
| `TaskStatusRail` (`task-status-rail.tsx`) | Full Task page (`TaskDetailContent`) | Yes | none (controlled) | n/a |
| `TaskTimerControl` (`task-timer-control.tsx`) | Full Task page header (`variant="header"`), Quick View (`variant="compact"`) | Yes | reads shared `TaskTimerState` prop; owns `ManualTimeEntryDialog` | n/a |
| `TaskTimeTracking` (`task-time-tracking.tsx`) | Full Task page body only (`TaskDetailContent`) | Yes | reads shared `TaskTimerState` prop | n/a |
| `useTaskTimer` (`use-task-timer.ts`) | Full Task page, Quick View (one instance each, never both for the same Task at once) | Yes | `useTaskTimeEntries`, `useRunningTimer`, `usePausedTimer`, `useElapsedSeconds`, `timeEntriesProvider` | n/a |
| `TaskSubtasksSection` (`task-subtasks-section.tsx`) | Full Task page, top-level Tasks only (`TaskDetailContent` renders it conditionally) | Yes | `useSubtasks` | Subtask rows use `TaskRowList` with no `onOpen` — direct `Link` to that Subtask's own full page |
| `TaskFormDialog` (`task-form-dialog.tsx`) | Task create (Tasks Home "+ New Task", Workstream "+ Add Task"), Task edit (full page, Quick View) | Yes | `useCompanies`, `useProjects`, `useWorkstreams`, `useWorkstreamActivities`, `useActivityCatalog`, `tasksProvider` | n/a (dialog) |
| `AddSubtaskDialog` (`add-subtask-dialog.tsx`) | Full Task page's Subtasks section only | Yes | `useCompanyLookups`, `tasksProvider.createSubtask` | n/a (dialog) |
| `TaskFilterBar` / `TaskStatusQuickFilters` / `SavedViewsBar` / `TaskGroupBySelect` | Tasks Home only | Yes (assignee filter/group hidden for Employee) | `use-task-filters.ts`, `use-saved-views.ts` | n/a |
| `BucketTaskGrid` (`my-day/bucket-task-grid.tsx`) | My Day only | Yes | renders `TaskGridCard` with no `onOpen` | Full-page navigate (inherited default) |

No role-specific Task component wrappers exist anywhere in the codebase — every component above is
literally the same file/render path for Employee, Supervisor, and Superadmin. Role differences are
expressed entirely through **data scoping** (what the hooks/providers return) and **conditional
prop/branch rendering** (e.g. `employeeView` hiding the assignee filter, `canEdit`/`canAddSubtask`
booleans), never through separate components per role.

## Current information hierarchy

**Full Task page**, top to bottom:
1. Breadcrumb: "Back to tasks" link; if a Subtask, a "SUBTASK" badge + "Subtask of {parent}" link
2. Title (`h1`)
3. Company name → Project name (if any) → Workstream name → Activity name (breadcrumb row)
4. Edit button (title row, page-level action — not part of Time Tracking)
5. Time Tracking cluster (`TaskTimerControl`, top-right, its own row)
6. Status rail (`TaskStatusRail`, 5-segment control)
7. Priority badge, due date, activity text, checklist X/Y count, compact assignee summary (hidden
   entirely when the only assignee is the viewer themselves) — one metadata rail
8. Description (if any)
9. Created-by / status-last-changed-by footer line
10. "Time Activity" card — own/subtask minutes rollup (top-level Tasks with Subtasks only), then
    `TaskTimeTracking`'s history list (latest 3 by default, "View all N"/"View fewer")
11. "Checklist" card
12. "Subtasks" card (top-level Tasks only)
13. Handoff section
14. Notes section

**Quick View** (Dashboard only), top to bottom: SUBTASK badge/parent link (if applicable) → title →
Company → Project → Workstream → Activity breadcrumb → status badge, priority badge, due date →
compact assignee summary (same self-only-hidden rule) → description (3-line clamp) → Checklist X/Y
and Subtasks X/Y counts (counts only, no per-Subtask list) → compact timer control → footer
(Edit, Open full task).

**Tasks Home list row** (`TaskRow`): title (+ SUBTASK badge) → subtitle (parent link, or
assignee names, or a caller-supplied subtitle) → priority badge → status badge → checklist progress
bar.

**Tasks Home grid card** (`TaskGridCard`): optional "Start here"/"Running" cue → checkbox (My Day
only) + status dot + title (+ SUBTASK badge) + priority badge → Project → Workstream → Activity line
→ checklist progress → assignee avatars + due date.

**Planner/Dashboard summary item** (`TaskSummaryItem`, `variant="row"`): title (+ running cue, +
SUBTASK badge) + priority badge → Project → Workstream → Activity line → status badge (+ due date,
+ assignee avatars, both opt-in per caller).

No Task/Subtask surface anywhere shows Expected/Estimated time (Phase 11A removed it product-wide;
the DB field and historical data remain, edit-mode save paths still pass it through unchanged).

## Employee experience

- **Visibility**: `canAccessTask` — only Tasks where they're an assignee, scoped to a Company they
  can access, plus read-only hierarchy visibility into a directly-related parent/child Task's
  existence (Phase 10).
- **Creation**: can create a Task (self-added) and Subtasks on Tasks they're a direct assignee of.
- **Editing**: full edit only for a Task they self-added (`canEditTask`: `selfAdded && createdById
  === viewer.id`); otherwise read-only on fields, but can still progress status/checklist as an
  assignee.
- **Assignment**: assignee selection is forced to themselves only (`resolveAssigneeIds` — employee
  branch always returns `[viewer.id]`); they never see or pick a coworker.
- **Status change**: any assignee can progress a Task's status (`canProgressTask`).
- **Time Tracking**: can log time only on Tasks where they're an assignee (`canLogTime` — identical
  rule for every role, not Employee-specific).
- **Subtask creation**: only on a top-level Task they're a direct assignee of.
- **Checklist**: can tick items on Tasks they can progress.
- **Project context**: sees Project/Workstream/Activity breadcrumbs read-only; the Tasks Home filter
  bar hides the "assignee" field and "assignee" group-by option entirely for Employee (`employeeView`
  in `tasks/page.tsx`).
- **Coworker information**: never sees a coworker's raw time entries; `TaskTimeTracking`'s multi-
  contributor display only ever activates when the entry list genuinely contains more than one
  contributor (which, for an Employee's own accessible Tasks, is rare and always already-authorized
  data via `resolveProfileDirectory`, never a new exposure).
- **Team views**: none — no team-wide Task view exists for Employee.

## Supervisor experience

Everything Employee has, for their own assigned work, plus:

- **Visibility**: `canAccessTask`/`canAccessTaskDirectly` extend to any Task where **any** assignee
  is one of their direct reports (`managesUser`), plus unassigned Tasks in an accessible Company (for
  triage).
- **Creation/editing**: `canManageTasks` (`isSupervisor || isSuperadmin`) grants full edit rights on
  any Task in scope, not just self-added ones.
- **Assignment**: `resolveAssigneeIds`/`assignableStaffFor` let a Supervisor assign to themselves or
  their own direct reports — never the whole org.
- **Status change**: on any Task in scope (via `canManageTasks`, independent of being an assignee).
- **Time Tracking / manual logging**: still bound by `canLogTime` — a Supervisor with no personal
  time on a Task cannot log time there merely by having management authority over it (deliberately
  narrower than edit/progress rights).
- **Subtask creation**: on any top-level Task where they manage at least one assignee, or are a
  direct assignee themselves (`TaskSubtasksSection`'s `canAddSubtask`).
- **Project context**: Tasks Home's filter bar and group-by include "assignee" for Supervisor.
- **Coworker information**: legitimately sees direct reports' names/assignments/status history on
  Tasks in scope — this is the intended team-visibility boundary, not a leak.
- **Team views**: Tasks Home itself becomes team-scoped ("Your own tasks, plus tasks assigned across
  your team"); Team Time / Team Updates (adjacent, non-Task pages) extend the same direct-report
  scope to time/update history.

## Superadmin experience

Everything Supervisor has, org-wide:

- **Visibility**: `canAccessTask`/`canAccessTaskDirectly` return `true` unconditionally.
- **Creation/editing/assignment**: `canManageTasks` true; `assignableStaffFor` returns every active
  user, not just direct reports.
- **Status change**: any Task, always.
- **Time Tracking**: still bound by `canLogTime` — a Superadmin does not automatically gain time-
  logging rights on a Task they aren't assigned to (no role bypass of this specific rule).
- **Subtask creation**: any top-level Task (`isSuperadmin(user)` short-circuits `canAddSubtask`).
- **Project context**: Tasks Home reads "Every task across the org."
- **Coworker information**: full org-wide visibility, same as Supervisor's team-scoped visibility
  just wider — no new category of information, only a wider scope of the same fields.
- **Team views**: Tasks Home, Team Time, Team Updates all org-wide; Superadmin's My Day additionally
  carries the (temporarily Superadmin-only, Phase 11D) `DailyVisitHoursCard`, which is Visit-related,
  not Task-related, but shares the My Day surface.

## Permission/security boundaries

Exact current helper names from `src/lib/data/permissions.ts` — Phase 12B must preserve every one of
these, regardless of any visual redesign:

- `canAccessTask(viewer, task, allUsers)` — READ/hierarchy-visibility gate for list/detail screens.
  Includes an optional `hierarchyAssigneeIds` one-hop (parent ↔ child) visibility grant — **read-only**,
  never edit/progress/time-log rights.
- `canAccessTaskDirectly(viewer, task, allUsers)` — the mutation/sensitive-aggregate gate (no
  hierarchy branch). Required for Subtask creation, Notes, Handoffs, the parent time roll-up. Being
  visible through a parent/child relationship must never, by itself, grant operating authority.
- `canManageTasks(user)` — `isSupervisor(user) || isSuperadmin(user)`. The full-field-edit boundary.
- `canEditTask(viewer, task)` — `canManageTasks(viewer) || (task.selfAdded && task.createdById ===
  viewer.id)`.
- `canProgressTask(viewer, task)` — `canManageTasks(viewer) || task.assigneeIds.includes(viewer.id)`.
- `canLogTime(viewer, task)` — `task.assigneeIds.includes(viewer.id)` **only** — deliberately
  narrower than progress rights, applies identically to every role including Superadmin. No manager
  role may log time on a Task they aren't personally assigned to.
- `canCreateHandoff(viewer, task, allUsers)` — requires `canAccessTaskDirectly`.
- One-level Subtasks: enforced structurally (`parentTaskId` on a Task; the create-Subtask RPC and
  `TaskDetailContent`'s conditional render of `TaskSubtasksSection` only for `!task.parentTaskId`) —
  a Subtask can never have children, and no UI anywhere offers "Add Subtask" on a Subtask.
- Parent/child assignment independence: a Subtask's own assignees/status are fully independent of
  its parent's; the only coupling is the confirmable (never automatic) "mark parent Done with open
  Subtasks" warning (`TaskDetailContent`/`TaskBoard`'s `confirmingDone`/`pendingDoneTaskId` flow).
- Parent context locking: not a Task-level lock today — a Subtask's Company/Workstream/Activity are
  inherited from its parent at creation and shown read-only in its breadcrumb; there is no separate
  "locked once children exist" rule found in the current codebase for a *parent* Task (Phase 12B
  should not assume one exists without re-verifying against the actual create/edit RPCs).
- Project access boundaries: Task visibility is gated through `canAccessCompany`, which in turn is
  Project/Company-assignment-based — a Task's Company must itself be accessible to the viewer,
  independent of the Task's own assignee list.
- Supervisor scope is **direct-report-based** (`managesUser`), never org-wide — this must not be
  broadened for design convenience in Phase 12B.

## Navigation baseline

Accepted, locked (Phase 11B), and re-confirmed by reading the current router calls in every listed
file:

| From | Behavior |
|---|---|
| Dashboard/Home (role dashboards, KPI drill-downs) | Opens Quick View (`TaskDrawer`) |
| Tasks Home — List | Navigates directly to `/dashboard/tasks/[id]` |
| Tasks Home — Grid | Navigates directly to `/dashboard/tasks/[id]` |
| Tasks Home — Board | Navigates directly to `/dashboard/tasks/[id]` |
| My Day | Navigates directly to `/dashboard/tasks/[id]` (`TaskGridCard`'s no-`onOpen` default) |
| Planner (Day/Week/Month/Group/Unscheduled) | Navigates directly to `/dashboard/tasks/[id]` |
| Planner "Today" | Jumps the calendar to today's date (unrelated to Task navigation) |
| Planner "Open My Day" | Navigates to `/dashboard/my-day` |
| Subtask row (from parent Task's Subtasks section) | Navigates directly to that Subtask's own full page |
| Quick View footer | "Open full task" → `/dashboard/tasks/[id]`; "Edit" (if authorized) opens `TaskFormDialog` inline, no navigation |

## Subtask constraints

- Exactly one level: a Task with `parentTaskId` set cannot itself have Subtasks. Enforced by data
  model + `TaskDetailContent` only rendering `TaskSubtasksSection` when `!task.parentTaskId`, and by
  `AddSubtaskDialog` only ever being reachable from that section.
- Independent status/checklist/time from the parent — no automatic propagation either direction.
- The only parent↔child coupling is the confirmable "mark parent Done with open Subtasks" warning
  (present in both `TaskDetailContent` and `TaskBoard`'s drag-to-Done path) — a warning, never a hard
  block.
- A parent's own Time Activity card shows an "Own time" vs. "Including Subtasks" rollup
  (`getTaskTimeRollup`) when it has Subtasks with logged time — display-only, doesn't affect either
  Task's own stored minutes.
- `canAddSubtask` (UI-level approximation of `canAccessTaskDirectly`) gates the "+ Add Subtask"
  button's visibility; the RPC itself remains the real authorization boundary regardless of what the
  button shows.

## Time Tracking constraints

- **One authoritative timer instance per rendered Task** — `useTaskTimer(taskId, assigneeIds)`,
  called exactly once per page/drawer render, shared via prop by every consumer on that
  page/drawer (`TaskTimerControl`, `TaskTimeTracking`). Never two independent pollers for the same
  Task in the same tree.
- Quick View and the full page each own their own separate `useTaskTimer` call — safe only because
  the two are never mounted simultaneously for the same Task.
- All primary actions (Start/Pause/Resume/Stop, Log time) live exclusively in `TaskTimerControl`
  (header variant on the full page, compact variant in Quick View) — `TaskTimeTracking` is
  history/read-only only, never duplicates an action button.
- `canLog` (from `canLogTime`) gates whether any action buttons render at all — a viewer who can't
  log time on this Task sees only the read-only clock.
- Cross-task awareness: a running/paused timer elsewhere is surfaced as a compact notice in the
  header variant only ("Running on X — starting here will pause it" / "X is paused — go resume it") —
  never in the compact/Quick View variant.
- "Time Activity" history defaults to the latest 3 entries, "View all N entries"/"View fewer" toggles
  the rest — no pagination infrastructure exists or is needed at current data volumes.
- Multi-contributor display (avatar + name per row) only activates when the entry list actually
  contains more than one distinct contributor.

## Shared components

Genuinely one implementation reused everywhere (Phase 12B should keep these shared unless a sample
specifically requires diverging behavior, not just diverging appearance):

- `TaskRow`/`TaskRowList` — every "list of tasks" surface (Tasks Home list, Subtasks section).
- `TaskGridCard` — Tasks Home grid view and My Day's bucket grid.
- `TaskSummaryItem` — every Planner view and every Dashboard KPI/list-widget drawer.
- `TaskStatusRail`, `TaskPriorityBadge`, `TaskStatusBadge` — every surface that shows status/priority.
- `TaskTimerControl`/`useTaskTimer` — the one timer implementation, full page and Quick View.
- `TaskFormDialog` — every Task create/edit entry point across the app (Tasks Home, Workstream page,
  full Task page, Quick View).
- `ChecklistProgress` — every checklist-progress indicator (row, grid card, full page metadata rail).

## Current inconsistencies/design debt

Separated into **real product inconsistency** (worth Phase 12B's attention) vs. **personal design
preference** (not a defect, just a look):

**Real product inconsistency:**
- `TaskGridCard` and `TaskSummaryItem` both render an almost-identical "Project → Workstream →
  Activity" breadcrumb line with slightly different punctuation/spacing logic, implemented twice
  rather than through one shared formatter.
- The Tasks Home list view (`TaskRow` inside a plain `<Table>` in `tasks/page.tsx`) and the grouped
  grid view (`TaskGridCard`) present different metadata for the same Task (the table shows a
  dedicated "Progress" column via `ChecklistProgress`; the grid card shows checklist progress inline
  plus assignee avatars/due date the table doesn't) — not wrong, but the two views don't show quite
  the same information set today.
- Due-date "overdue" styling logic (`task.status !== "done" && task.dueDate != null && task.dueDate <
  today`) is duplicated verbatim in `TaskGridCard`, `TaskSummaryItem`, and `tasks/page.tsx`'s
  `renderTaskRow`, instead of one shared helper.
- `formatDueDate`/date-formatting helpers are re-declared locally in multiple files
  (`task-grid-card.tsx`, `task-summary-item.tsx`, `tasks/page.tsx`, `task-drawer.tsx`) rather than
  imported from one shared date-format utility.

**Personal design preference (not a defect):**
- The metadata rail on the full Task page and the Quick View compact rail present the same fields
  (priority/due date/assignees) in a visually different arrangement — both are internally consistent
  with their own surface's density goals (full page = a bit more spacious; Quick View = tight), this
  is a deliberate density trade-off, not an inconsistency to fix.
- Board view's `TaskCard` (a distinct component from `TaskGridCard`, intentionally per Phase 8's own
  "Board view stays as-is" decision) has its own compact presentation — again a deliberate,
  previously-accepted divergence, not debt.

**Components that should probably remain shared in Phase 12B**: `TaskRow`, `TaskGridCard`,
`TaskSummaryItem`, `TaskStatusRail`, `useTaskTimer`/`TaskTimerControl`, `TaskFormDialog`,
`ChecklistProgress`.

**Components that may need extraction/refactoring** (mechanical, not visual): a shared
"Project → Workstream → Activity breadcrumb" formatter/component, a shared "is this Task overdue"
helper, and a shared date-formatting utility — all three are pure logic/formatting duplication, safe
to consolidate without touching any accepted visual design.

## Responsive/mobile considerations

There is no dedicated mobile layout or separate mobile component tree — every Task surface uses
Tailwind responsive utility classes on the same markup (e.g. `TaskRow`'s `flex-col ... sm:flex-row`,
the Tasks Home grid's `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`, `TaskDetailContent`'s
metadata rail wrapping via `flex-wrap`). The Tasks Home list view is a plain `<Table>`, which does not
reflow gracefully at narrow widths today (horizontal scroll is the current behavior, not a stacked
card layout) — this is the most likely mobile-specific gap a redesign sample might address. The full
Task page's header (title row + timer row) already stacks via `flex-wrap`/`flex flex-col` patterns.
No breakpoint-specific component swap exists anywhere in the Task system.

## Sample-to-product classification framework

When the user uploads reference/sample designs in Phase 12B, classify each surface's proposed change
against the current system using these four tiers before implementing anything:

- **A. VISUAL-ONLY** — spacing, color, iconography, card shape, typography, layout arrangement of
  data that's already fetched and already shown somewhere on that surface. No data/permission change.
  Example: restyling `TaskGridCard`'s border/shadow treatment.
- **B. COMPONENT RESTRUCTURE** — requires extracting/merging/renaming shared components (e.g. the
  breadcrumb-formatter consolidation noted above) but the underlying data, permissions, and
  navigation behavior are unchanged.
- **C. PRODUCT BEHAVIOR CHANGE** — would alter interaction or navigation (e.g. a sample that shows
  Tasks Home opening a drawer instead of navigating, which would violate the locked navigation
  baseline above unless the user explicitly re-opens that decision).
- **D. BACKEND/SECURITY CHANGE** — would require a new provider method, RLS policy, RPC, or schema
  change (e.g. a sample showing a field Corebridge X doesn't currently store, or a permission
  boundary — like Supervisor seeing org-wide Tasks — that doesn't exist today).

**A sample image showing a feature is never itself proof that the feature is required.** Any D-tier
(and most C-tier) implications found while mapping a sample must be surfaced and explicitly confirmed
with the user before implementation — the same "stop and report, don't invent" discipline used
throughout every prior phase of this project.

## Things Phase 12B must not regress

- The three-role model and the "Supervisor = Employee + team privileges" principle.
- Every permission helper listed above, verbatim in behavior (names may only change if the user
  explicitly asks for a rename, never as a side effect of a visual redesign).
- The locked navigation baseline (Dashboard → Quick View; every dedicated work surface → full page).
- One authoritative `useTaskTimer` instance per rendered Task; no duplicate timer/action UI.
- One-level Subtasks, and the confirmable (not automatic) parent-Done-with-open-Subtasks warning.
- Expected/Estimated Time's absence from all UI (Phase 11A) — the DB field stays untouched and
  historical data must keep round-tripping through edit-save paths unchanged.
- `canLogTime`'s narrower-than-`canProgressTask` boundary — no role may log personal time on a Task
  it isn't assigned to.
- The existing four-provider parity (`mock`/`supabase-auth`/`supabase-core`/`supabase`) — any new
  Task UI element must be backed by data every provider mode can actually supply, or the build matrix
  breaks.
