# Phase 12B — Task Redesign Spec (as implemented)

Describes the final implemented architecture of the Phase 12B redesign — not the original brief.
Built against three local reference images (`references/phase-12b/*.png.png`, never committed):
a task-list-plus-split-sidebar reference, a Kanban board reference, and a checklist-table
reference. No backend/RLS/RPC/schema change anywhere in this phase; one narrow, currently-unwired
permission helper was added in a final-polish pass — see "Final polish" at the end of this document.

## Navigation shell

`src/components/dashboard/app-sidebar.tsx` — a full rewrite, still mounted the same way inside
`SidebarProvider` in `dashboard/layout.tsx`.

- **Desktop**: two plain `sticky top-0 h-svh` flex children (not the shadcn `<Sidebar>` component's
  fixed/gap/offcanvas machinery, which isn't a good fit once there are two independently-sized
  panels sitting in the same row as page content):
  - `IconRail` (56px, `w-14`) — brand mark, Search (opens the command palette), then Home/My Day/
    Tasks/Planner/Reports as tooltip-labeled icon buttons (`RailButton`). Always visible, even when
    the wide panel is collapsed.
  - `NavPanel` (240px, `w-60`) — rendered only when `useSidebar().state === "expanded"`. Header row
    (wordmark + collapse toggle wired to the existing `toggleSidebar()`), the existing
    `SearchTriggerBar`, then grouped nav (`NavGroupSection`): **Workspace** (Home/My Day/Tasks/
    Planner/Reports), **Client work** (Companies — Superadmin only, Projects), **Team** (Team Time/
    Team Updates — omitted as a whole group, not shown empty, when neither gate passes). Footer:
    Settings, Help, and the existing account dropdown (Settings/Log out), unchanged in content.
  - The existing `SidebarTrigger` in `dashboard-topbar.tsx` and the Cmd/Ctrl+B shortcut are
    untouched — they still call the same `toggleSidebar()` from `useSidebar()`, which now maps to
    "show/hide the wide panel" instead of "expanded/icon-only sidebar."
- **Mobile** (`useSidebar().isMobile`): one `Sheet` (`MobileNavPanel`) with the same brand mark,
  a real Search button (opens the command palette directly, then closes the sheet — no invisible
  overlay), the same grouped nav (event-delegated: any `<a>` click inside the group list closes the
  sheet), and the same Settings/Help/account footer. No permanent two-panel footprint.
- **Project tree**: NOT implemented. `useProjects()` is not called anywhere in the persistent shell
  — doing so would add a fetch to every dashboard page load app-wide. Projects stays a flat nav item
  under "Client work." (Explicit decision, not an oversight — see Part A/4 of the brief.)

## Tasks Home (`/dashboard/tasks`)

`src/app/dashboard/tasks/page.tsx` — full rewrite.

- **View state**: `useState<"board" | "list">("list")` (corrected from an initial `"board"` default
  per final user feedback), page-local, resets to List on every load. No persisted preference
  exists in the data model; none was added.
- **Header**: "Tasks" + role-specific description, "+ New Task" top-right.
- **View switcher**: a two-button segmented control, List first (primary/default), Board second.
- **Toolbar** (one row): `TaskGroupBySelect` (List only) → a `Popover`-based **Filters** button
  (badge-counted; contains `TaskStatusQuickFilters` + `TaskFilterBar`, both unmodified in
  behavior) → a `Popover`-based **Views** button (contains `SavedViewsBar`, unmodified) → a
  standalone Search `Input` bound to `filters.search`, pushed right via `ml-auto`.
- **Board**: `<TaskBoard user tasks={filtered} onChanged={refresh} runningTaskId />`.
- **List**: `filters.groupBy === "none"` → `<FlatTaskList>`; otherwise one `<TaskListSection>` per
  `groupTasksBy(...)` group, collapse state in a local `Set<string>`.
- **Grid**: not a switcher option (never was one — see the compatibility note below). `TaskGridCard`
  itself is untouched and still imported by `src/components/my-day/bucket-task-grid.tsx`.
- **Saved-view compatibility**: `SavedViewFilters` (`src/lib/data/types/saved-view.ts`) has no
  view-mode field — only filter criteria including `groupBy`. A saved view with a non-`"none"`
  `groupBy` continues to apply that exact grouping; the only change is that the List view now
  renders every grouping as dense rows instead of switching to a `TaskGridCard` grid. No data
  migration, no schema touch, nothing lost.

## Board

`src/components/tasks/task-board.tsx`, `src/components/tasks/task-card.tsx`.

- Columns: fixed `w-64`, `flex gap-3 overflow-x-auto` row (horizontal scroll for all 5 statuses on
  narrow desktop/tablet widths, matching the reference).
- Column header: status dot + label + count + a small "+" (opens `TaskFormDialog` with
  `defaultStatus` preselected to that column).
- Card (`TaskCard`): title (+ small running-timer pulse dot, + SUBTASK badge) → `Client · Service`
  line → priority pill + tiny `ListChecks`/`Layers` count icons → assignee avatars + due date.
  No description, no progress bar, no colored left border (status already = column), no oversized
  status badge.
- `subtaskCount` is derived per-card via `subtaskSummary(taskId, allTasks)` — a pure filter over the
  already-fetched flattened task list (`allTasks.filter(t => t.parentTaskId === taskId)`), zero new
  fetches, mirroring the N+1-avoidance convention `TaskBoard`'s own Done-confirmation check already
  used.
- Drag-and-drop, `canProgressTask` per-card gating, and the parent-Done-with-open-Subtasks
  `ConfirmDialog` are unchanged from Phase 11.
- `TaskFormDialog` gained one new optional prop, `defaultStatus?: TaskStatus` (threaded into
  `emptyForm`) — purely a form-state default; the create path is identical either way.

## List

New files: `src/components/tasks/task-list-row.tsx`, `task-list-section.tsx`.

- `TaskListSection`: header (status dot when `groupBy === "status"`, else neutral background) +
  label + count + collapse chevron + a "+" (status grouping only, since only status has an obvious
  value to preselect) + the group's `TaskListRow`s.
- `TaskListRow`: desktop is a true `grid grid-cols-[1fr_88px_140px_96px_88px]` row (Task / Priority /
  Service / Due date / Assignee); mobile (`sm:hidden` / `hidden sm:grid` pair) collapses to a
  stacked block (title + a wrapped line of priority/service/due/assignee) instead of forcing five
  columns into a phone width.
- Task cell: title (+ running dot, + SUBTASK badge, + small checklist/Subtask count icons) then a
  secondary Client line. Service cell: Workstream name, Activity as a smaller secondary line below
  it. No Status column (the section header already carries it).
- `FlatTaskList`: the `groupBy === "none"` fallback — the same rows, no section headers.

## Checklist

`src/components/tasks/task-checklist.tsx` — full rewrite, same public props shape aside from taking
`task: TaskWithRelations` instead of `taskId`/`items`/`assigneeIds` separately (needed to
reconstruct a full `TaskInput` for add/remove — see below).

- Rows: checkbox → item text (line-through + muted when done) → a subtle "Open"/"Completed" text
  (no badge) → a hover-revealed delete (×), compact height, alternating faint row tint, faint
  dividers.
- Toggle: unchanged — `tasksProvider.toggleChecklistItem`, gated by `canProgressTask`.
- Add/remove: **no new provider method.** `taskToInput(task, nextItems)` rebuilds the exact
  `TaskInput` shape `TaskFormDialog`'s own edit-mode submit already builds from the same loaded
  `task` object, then calls the existing `tasksProvider.updateTask`. Gated by `canEditTask` — the
  same authorization boundary that already governed adding/removing checklist lines via Edit Task;
  this just exposes it inline instead of requiring the full dialog. No Code/Duration/Period/
  Maintenance Level/Department/MTA/per-item-assignee fields — this app's checklist model has never
  stored any of those, and none were added.

## Full Task / Subtask page

`src/app/dashboard/tasks/[id]/page.tsx`, `src/components/tasks/task-detail-content.tsx`,
`task-properties-rail.tsx` (new), `task-status-rail.tsx` (rewritten), `task-timer-control.tsx`
(rewritten).

- **Layout**: `grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6`. Main content uses `order-2
  lg:order-1`, the rail `order-1 lg:order-2` — so mobile stacks header → properties/time → main
  content (per the brief's explicit mobile order), while desktop keeps main-left/rail-right.
- **Header**: back link, breadcrumb (SUBTASK badge + parent link when applicable, then Client →
  Project → Service → Activity), title, Edit button top-right. No decorative "•••" — there's no real
  menu content to put there yet.
- **Right rail**:
  - "Properties" (`TaskPropertiesRail`): label→value rows — Status (`TaskStatusRail`, now a compact
    `Select` instead of the old 5-segment bar, same `canProgressTask` gating and Done-with-open-
    Subtasks confirmation, read-only chip when the viewer can't progress), Priority, Due date,
    Assignees.
  - `TaskTimerControl` `variant="rail"` (replacing the old `"header"` variant, now unused): idle
    shows "Tracked" + total + "Start timer"; running shows a live H:MM:SS + Pause/Stop; paused shows
    the tracked total + Resume/Stop (paused elapsed isn't tracked to the second in this data model,
    so this reuses the same total the old header variant showed rather than inventing a frozen
    stopwatch); "+ Log time" and the cross-task notices are unchanged.
- **Main content** (`TaskDetailContent`, rewritten to hold only this): Description → Checklist →
  Subtasks (top-level Tasks only) → Handoff → Notes → Time Activity → a small "Created by / status
  last changed by" footer line. Light section headings + `Separator`s instead of one card per
  section — `TaskHandoffSection`/`NotesSection`/`TaskSubtasksSection` keep whatever Card chrome they
  already owned.
- **Status-change state** (pending flag, the Done-with-open-Subtasks `ConfirmDialog`) now lives in
  `LoadedTaskDetailPage` itself, since both the rail's status control and the confirmation dialog
  need to share it — `tasksProvider.updateTaskStatus`/`canProgressTask` are unchanged.
- **`useTaskTimer`**: exactly one call, in `LoadedTaskDetailPage`, shared via prop by the rail widget
  and `TaskDetailContent`'s Time Activity section — unchanged from Phase 11.

## Subtasks

`src/components/tasks/task-row.tsx` — rewritten (only consumer: `TaskSubtasksSection`). Desktop: one
row (status dot, title, status label, assignee, due date). Mobile: a stacked block (title line, then
a wrapped status/due line) instead of forcing four fixed-width fields into a phone screen. Click
still navigates straight to the Subtask's own full page (`TaskRow`'s default, no `onOpen` passed
here) — one nesting level, unchanged.

## Quick View

`src/components/tasks/task-drawer.tsx` — not restructured, only aligned: added the same
`ListChecks`/`Layers` count icons Board/List now use, and swapped its local due-date formatter for
the shared `formatDueDateShort`. Still the exact Phase 11B structure/props, still Dashboard-only per
the locked navigation rule, still never renders another `TaskDrawer`. **Final polish**: removed a
leftover Phase 11A `!isSelfOnlyAssignee &&` condition that hid the assignee line entirely whenever
the sole assignee was the viewer themselves — Quick View now always shows "Unassigned" or the real
assignee(s), matching every other assignee-display surface in the app.

## Shared helpers

`src/lib/data/task-display.ts` (new) — `isTaskOverdue`, `formatDueDateShort`, `taskServiceLabel`,
`taskContextLine`, `subtaskSummary`. Consolidates logic Phase 12A's baseline audit found duplicated
across `TaskGridCard`/`TaskSummaryItem`/the old Tasks Home row renderer. `TaskGridCard`,
`TaskSummaryItem`, and `TaskDrawer` now import from here instead of keeping local copies — same
output for the same input, zero behavior change.

`src/components/ui/popover.tsx` (new) — a thin `@base-ui/react/popover` wrapper following the exact
same `Root`/`Trigger`/`Portal`/`Positioner`/`Popup` shape already used by `tooltip.tsx`/
`dropdown-menu.tsx` in this codebase. Used by the Tasks Home toolbar's Filters/Views triggers.

## What was deliberately left alone

- `TaskGridCard` (My Day) — untouched visually. It already has its own accepted hover/mark-done
  animation language; forcing it to match Board's new quieter cards wasn't requested and risks
  regressing something already accepted.
- Planner, Dashboard role pages, Project/Workstream Task-creation entry points — no redesign; only
  the shared components/tokens they already depend on flow through automatically.
- `TaskTimeTracking` (Time Activity) — not modified at all in this phase. Its container changed
  (light section instead of a Card), its content/behavior did not.

## Final polish — assignee visibility + assigned-Employee checklist add

**Assignee visibility (shipped).** `TaskDrawer`'s leftover self-only hide condition removed — this
was the only surface in the app still hiding a self-assigned Employee's own assignment.
`TaskFormDialog`'s "People" section already showed a read-only self-chip in both create and edit
mode; `TaskPropertiesRail` already rendered Assignees unconditionally since it was written in the
initial 12B pass. No other surface needed a change.

**Assigned-Employee checklist add — fully implemented, backend included.** `permissions.ts` gained:

```ts
export function canAddTaskChecklistItem(
  viewer: User,
  task: { assigneeIds: string[]; createdById: string; selfAdded: boolean }
): boolean {
  return canEditTask(viewer, task) || task.assigneeIds.includes(viewer.id);
}
```

Deliberately narrower than `canEditTask` — a direct assignee gets exactly the ability to add one
checklist line, never broader Task-edit rights, never delete/rename of an existing line.

This was initially defined but NOT wired in, because the real Postgres backend rejected the only
path that existed to act on it: `checklist_items`' own RLS (`checklist_items_write`) is
`USING/WITH CHECK can_edit_task(task_id)` for every operation including INSERT, and the client's
only prior checklist-write path, `tasksProvider.updateTask`, updates the `tasks` row FIRST — gated
by `tasks_update`'s own `can_edit_task(id)` RLS — before it ever reaches `checklist_items`. Both
independently rejected a directly-assigned-but-non-editing Employee. The user then explicitly
authorized the narrow migration this required.

**Migration**: `supabase/migrations/20260826090000_add_task_checklist_item.sql`:

```sql
create function public.add_task_checklist_item(target_task_id uuid, p_description text)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tasks;
  trimmed text;
  new_position int;
begin
  select * into existing from public.tasks where id = target_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;
  if not public.can_progress_task(target_task_id) then
    raise exception 'You don''t have permission to add a checklist item to this task.';
  end if;
  trimmed := trim(p_description);
  if trimmed = '' then
    raise exception 'Checklist item description cannot be empty.';
  end if;
  select coalesce(max(position), -1) + 1 into new_position
    from public.checklist_items where task_id = target_task_id;
  insert into public.checklist_items (task_id, description, position)
    values (target_task_id, trimmed, new_position);
  return existing;
end;
$$;

revoke all on function public.add_task_checklist_item(uuid, text) from public, anon;
grant execute on function public.add_task_checklist_item(uuid, text) to authenticated, service_role;
```

Mirrors `toggle_checklist_item` exactly: `SECURITY DEFINER`, gated on `can_progress_task`
(confirmed by inspection to mean "manager, or a direct assignee" only — no hierarchy-read-only
leakage, since that concept doesn't exist at the SQL layer at all), touches only a single
`checklist_items` INSERT, never the `tasks` row. Requires no change to any existing RLS policy —
`tasks_update`/`checklist_items_write` are untouched. Anonymous execution is impossible
(`revoke all ... from public, anon`). Applied to the existing hosted project
(`qxqxzuoaivyddwxqqoog`) via `supabase db push`; `supabase migration list` confirmed clean
local/remote history both before and after.

**Provider abstraction**: `TasksProvider.addChecklistItem(viewer, taskId, description)`.
`supabaseTasksProvider` calls the new RPC and re-hydrates (used by `supabase`/`supabase-core`
modes). `mockTasksProvider` implements the identical `canAddTaskChecklistItem` authorization in JS,
via `requireDirectAccess` (never the hierarchy-inclusive `canAccessTask`), appending one item at
the end (used by `mock`/`supabase-auth` modes) — so mock mode is never more permissive than real
Supabase. `updateTask` was never called or modified for this operation.

**`TaskChecklist`'s three permissions, now fully separated**: TOGGLE → `canProgressTask`
(unchanged). ADD → `canAddTaskChecklistItem`, calling `tasksProvider.addChecklistItem` (no
`TaskInput` reconstruction). REMOVE → `canEditTask`, still via the existing
`updateTask`/`taskToInput` reconstruction (unchanged — no per-item creator/owner field exists to
safely support a narrower self-delete rule, and none was invented). A failed add surfaces its error
inline, never silently swallowed.

**Unchanged**: `canEditTask`, `canProgressTask`, `updateTask`'s own authorization, Employee/
Supervisor/Superadmin assignment scope, every other `permissions.ts` helper (`canAccessTask`,
`canAccessTaskDirectly`, `canManageTasks`, `canLogTime`, `canCreateHandoff`).

## Final correction pass — List default, Service/Project UX, Activity confirmation, Employee form simplification

**List is now the default Tasks Home view** (see the "View state"/"View switcher" notes above) —
the only other change this correction made to Board/List/Checklist/sidebar/full-Task visuals.
Everything else in those surfaces is exactly as described earlier in this document.

**Service creation from the Task form — the actual bug.** `TaskFormDialog`'s "+ New service"
button was always correctly gated on a resolved `selectedProject` (there is no separate "Client"
selector in this form — the Project `<Select>` already serves that role, listing only real
accessible Projects), but its `<WorkstreamFormDialog>` render never passed that resolved value
through its own optional `projectId` prop:

```tsx
// Before — projectId silently omitted despite selectedProject already being required and known
{companyForNewWorkstream && (
  <WorkstreamFormDialog company={companyForNewWorkstream} onSaved={() => {}} onCreated={handleWorkstreamCreated} />
)}

// After
{companyForNewWorkstream && selectedProject && (
  <WorkstreamFormDialog
    company={companyForNewWorkstream}
    projectId={selectedProject.id}
    onSaved={() => {}}
    onCreated={handleWorkstreamCreated}
  />
)}
```

With `projectId` omitted, `create_workstream`'s `enforce_workstream_project_link` BEFORE INSERT
trigger has to auto-resolve a Project from `company_id` alone — raising "Company has no Project
yet" (zero matches) or "Company has more than one Project" (multiple matches), and only silently
succeeding when the company happens to have exactly one. This is why the bug surfaced
inconsistently. The fix makes the Task form's own already-correct three-case gating (one Project →
already auto-selected by the existing `<Select>`; multiple → the user already had to pick one
before the button appears; none → the button doesn't render, with an existing "Pick a project
above…" hint) actually reach the RPC. No new UI, no new case-handling — the cases were already
handled; only the prop was dropped. `WorkstreamFormDialog`'s post-create refresh/select/no-reload
behavior (`handleWorkstreamCreated`) was already correct and untouched.

**Service→Activities multi-select — audited and confirmed already correct, zero changes.**
`workstream_activities` is already a many-to-many join (`primary key (workstream_id, activity_id)`
in `20260814090001_activity_catalog.sql`); `create_workstream`'s `p_activity_ids uuid[]` already
takes many; `WorkstreamFormDialog` already renders a full multi-select checkbox grid per Activity
department. A Task's own `activityId` remains a scalar column with a single-select `<Select>`,
scoped to whichever Activities the chosen Service has enabled — confirmed unchanged; no schema, no
join table, no reporting-aggregation change, no migration.

**Employee create/edit forms drop the Assignees control entirely** (supersedes the earlier "make
self-assignment visible" instruction, per updated user preference): `TaskFormDialog`'s "People"
section and `AddSubtaskDialog`'s "Assignee(s)" field are both now `{!employeeView && (...)}`.
Backend self-assignment (`resolveAssigneeIds`/`create_task`/`createSubtask`) is completely
unaffected — this is a pure form-display simplification. Supervisor/Superadmin keep full Assignees
controls, unchanged. The Task's real assignee(s) are still shown unconditionally everywhere else —
`TaskPropertiesRail`, `TaskDrawer` (Quick View), Board cards, List rows — since a manager may
legitimately reassign work later and the persisted Task identity must stay visible regardless of
who's looking at the create/edit form.

**No migration** in this pass. **No RLS/permission change.** The already-applied checklist RPC
(`add_task_checklist_item`) and its ADD/TOGGLE/REMOVE permission split were not touched.
