# Domain Model

## The locked hierarchy

```
Project → Template → Activity → Task → Checklist
```

This is the accepted, final product hierarchy. **There is no "Subtask" concept.** A Subtask model existed historically (`tasks.parent_task_id`) but was deliberately, fully removed — schema, triggers, and UI — by migration `20260908130000_remove_subtask_architecture.sql`, whose own header states the decision plainly: *"THERE ARE NO SUBTASKS IN COREBRIDGE X... Unexpected additional work becomes another ordinary Task."* If you're tempted to add nested tasks, don't — read [decisions.md](decisions.md) first.

## "Template" vs. "Service Line"/"Workstream" — one concept, several names

**Template** is the current, locked, user-facing term (Phase 1 Template workspace, CD-206) for both the global catalog item (e.g. "Accounting," "Payroll," "Compliance") and the one instance of it a Project has. This replaced "Service" as the visible term — see [decisions.md](decisions.md) for the full rationale and scope.

**Internal persistence is deliberately unchanged.** `service_lines` (catalog table) / `ServiceLine` (type) and `workstreams` (per-Project instance table) / `Workstream` (type) keep their existing names — no renaming migration exists or is planned. Code, table names, the route `/dashboard/workstreams/[id]`, RPC/RLS helper names, and internal variables/component names still say "Service"/"Workstream" throughout, and that's expected — only what a user actually reads on screen changed. Visible and internal naming are allowed to diverge; don't "fix" internal identifiers to match the new visible word.

**Do not confuse this with the separate "Service Template" recipe feature** (`templates`/`template_tasks`/`template_checklist_items` tables, `apply_template` RPC, the Company-detail "Apply template" button/dialog) — that is a different, older, still-live feature, explicitly untouched and unrenamed by this terminology change. See `decisions.md`'s CD-205/CD-206 entries.

A Workstream's *displayed* name is derived, not stored verbatim — see `src/lib/data/workstream-name.ts`:
- `workstreamDisplayHeading(name)` returns `name` as-is. **Phase 3 (CD-208) changed this** — it previously took a second `serviceLineName` argument and preferred it live (`serviceLineName ?? name`), meaning a later catalog Service Line rename would retroactively change what every Project using it displayed. `name` is already frozen at write-time by `deriveWorkstreamName` (called with whatever the Service Line's name was *at that moment*), so the fix was simply to stop re-joining the live name at display time — see "Template → Project snapshot semantics" below.
- `deriveWorkstreamName` / `workstreamCompactLabel` handle the optional "reference/qualifier" suffix (e.g. "Payroll — UK Payroll").

### Template → Project snapshot semantics (Phase 3, CD-208)

Applying a canonical Template to a Project is a **true snapshot**, not a live reference: `workstream_activities` stores its own frozen `name`/`description`/`defaultTaskTitles`/`position` for each applied Activity, copied at the moment of application (`create_workstream`, "Configure/Add Activities"). Editing the global Activity/Service Line catalog afterward (`/dashboard/admin/templates`) never retroactively changes an already-created Project's own display — only *future* Template applications pick up the new catalog state. `activityId` remains on the row as a pure lineage pointer (nullable — survives the source Activity later being deleted, `on delete set null`), but is never used as a live display join after this phase.

**`tasks.activityId`/`project_issues.activityId` are explicitly unaffected** — they still point at the live global `activities` table by design. A Task's own Activity link is a stable identity reference (which catalog Activity this unit of work is categorized under), not part of what needed to snapshot; only "what does the Project believe this Activity currently looks like" (its display name/description/suggested Task titles) needed to freeze.

Canonical Template Activities are also now **Brand-independent** (Phase 3) — previously `departments.brand_id` was `not null` and actively filtered which Activities were selectable, meaning the same nominal Template could have structurally different Activities per Brand. The canonical Department scoping a Service Line's Activities now has `brand_id = null` (a single, Brand-independent container per Service Line). Selecting/setting a Project's Partner Brand never restricts which Templates/Activities are available.

See `decisions.md`'s "Phase 3 — Project creation, ownerId-based management authority, true Template snapshots, Partner Brand decoupling" entry for the full implementation.

## Four staffing/identity concepts that look similar but are not

These are frequently confused and are **deliberately separate authorization axes** — confirmed directly against `permissions.ts` and the Workstream/ServiceStaffing types, not just documented intent. Visible labels changed in Phase 1; storage and authorization behavior did not:

| Concept | Visible label | Scope | Storage | Grants elevated permission on a specific Project's Template? |
|---|---|---|---|---|
| **Global Team Lead** | "Templates Led" | Org-wide, per catalog Service Line | `service_team_leads` table / `ServiceStaffing.teamLeadUserIds` | **No.** `canManageWorkstreams`/`canConfigureWorkstreamActivities` check `workstream.leadUserId`, never `ServiceStaffing` |
| **Project Template Lead** | "Project Template Lead" | One Project's one Template instance | `workstream.leadUserId` | This is the actual authority-bearing field for Template-level actions (Team Lead scope) |
| **Works In Templates** | "Works In Templates" | Org-wide, per catalog Service Line | `service_employees` table / `ServiceStaffing.employeeUserIds` | **No.** Never auto-populates a Workstream's `team` or a Task's assignees — confirmed no code path reads it for either |
| **Project Template Team** | "Project Template Team" | One Project's one Template instance | `workstream.team` (join table `workstream_members`) | This is the actual per-Project team roster |
| **Creator** (`createdById`) | "Created by" | Historical, immutable | Separate field on Workstream/Project/Task | Never implies leadership or ownership for permission purposes |

**The rule to remember**: a Global Team Lead relationship is informational/preferred-candidate labeling only (the Workstream form surfaces Global Team Leads as suggested picks when choosing a *Project* Template Lead) — it never auto-grants or auto-populates anything. Every Project-level staffing decision (lead, team) is an explicit, separate action. **No authorization behavior changed in Phase 1** — only display labels.

The code states this directly (`workstream-form-dialog.tsx`): *"Global Team Leads for the selected Template — surfaced as preferred/contextual candidates when picking a Project Template Lead, never auto-selected or auto-authorized... a global Team Lead relationship grants no automatic Project authority in V1."*

## Project

### Ownership and management authority (Phase 3, CD-208)

`Project.ownerId` is now the Project-management (write) authorization boundary — see `docs/authorization.md`'s `canManageProjectRecord`/`can_manage_project`. This is a change in *meaning*, not a new field: `ownerId` already existed and already fed `canAccessProject`'s Team Lead read-visibility branch; Phase 3 additionally made it the boundary for *writing* to a Project record. A Team Lead who creates a Project always becomes its owner (server-forced, never client-chosen); an Admin-created Project becomes manageable by whichever Team Lead the Admin sets as owner. Team Lead may never reassign a Project's owner themselves (Admin-only, even for the owning Team Lead).

### Additional Team Leads (Phase 4)

`Project.ownerId` is now formally the **Primary Team Lead** — exactly one per Project, Admin-only to reassign. A Project may additionally have 0..many **Additional Team Leads**, represented by the dedicated `project_team_leads(project_id, user_id)` relation — deliberately NOT layered onto `project_members`/`projectRole` (both stay descriptive-data-only; see below). An Additional Team Lead gets the exact same normal Project-management authority as the Primary TL via `canManageProjectRecord`/`can_manage_project`, with one exception: changing `ownerId` itself stays Admin-only. Eligibility (active Supervisor, never the Project's own owner) is enforced at the database level by a trigger, not just the application layer. An Additional TL may add or remove another Additional TL, but never remove themselves; no Team Lead pathway can touch the Primary TL. A user may independently be Primary TL, Additional TL, and/or a plain Project Member, in any combination — the relations are fully independent (removing one never affects the others). Project Members gained incremental (not bulk-replace) add/remove RPCs usable by any authorized Team Lead, not just Admin. See `docs/authorization.md` and `docs/decisions.md`'s Phase 4 entry for the full authorization map.

### Statuses

`ProjectStatus = "active" | "on-hold" | "completed" | "cancelled" | "archived" | "trash"`

(Note the double-L `cancelled` at the type/DB level — the UI label is the single-L "Canceled." This split is intentional, to avoid a schema rename; don't "fix" the spelling.)

| Value | Label | Notes |
|---|---|---|
| `active` | Active | Accepts new operational work |
| `on-hold` | On Hold | Requires a reason; historical data stays readable |
| `completed` | Completed | Requires a reason. **Product intent is that a client relationship becomes Archived, not Completed** — `completed` is described in the badge component's own comment as "retired as a normal, selectable target," but as-coded, it is still present in `project-status-control.tsx`'s `LIFECYCLE_STATUSES` and still renders as a normal dropdown choice. This is a real code/comment disagreement — verify current behavior in the live app before relying on either description. |
| `cancelled` | Canceled | Requires a reason |
| `archived` | Archived | A separate lifecycle action (not in the normal status dropdown) — see below |
| `trash` | Trash | A separate, more destructive lifecycle action — see below |

### Active-for-new-work

`isProjectActiveForNewWork(status)` (`src/lib/data/project-display.ts`) returns true only for `"active"` or `null` (a legacy Workstream with no Project link). This gates creating new Tasks, new Services, and new Activity configuration — **historical data always remains fully readable** regardless of status; only *new* work creation is blocked. `projectNotActiveMessage(status)` supplies the exact user-facing explanation per status.

### Archive vs. Trash

Both are triggered from the Project overflow ("⋯") menu, Admin-only (`canManageProjects` = Superadmin only):

- **Archive** — *"excluded from active work by default, but every Service, Task, Comment, document, and time entry stays fully accessible — reactivate this same workspace any time."* Sets `status = "archived"`, stamps `archivedAt`.
- **Trash** — *"hidden from the default Projects list. Restore it any time from the Trash view."* A separate `trashProject` call; records `preTrashStatus` so Restore can return the Project to whatever status it held before.

**No automatic purge exists.** A configurable `retentionDays` setting exists on `ProjectTrashSettings`, but nothing in the codebase currently schedules an actual deletion — it's a stated-but-unimplemented concept. Don't assume Trashed projects ever disappear on their own.

**Reactivate/Restore**: an Archived project shows a single "Reactivate" button (→ `active`); a Trashed project shows a single "Restore" button (→ `preTrashStatus`).

### Timestamps

- `completionDate` — set once, the first time status transitions to `completed`; never overwritten by a later transition.
- `archivedAt` — stamped fresh every time status transitions to `archived` (the *latest* archive date), never cleared by Reactivate — so "Previously Archived On" stays visible after returning to Active.

### Contract (Phase 6A/6B, CD-215/CD-216)

Three distinct date facts, easy to conflate because two of them share a column name across tables — see `docs/architecture.md`'s "Contract / renewal information" section for the full table. In short:

- **Company Contract Start** (`companies.contract_start_date`) — the original client relationship start, master/reference data. Admin-only to correct after creation.
- **Project Client Since** (`projects.contract_start_date`) — the original Project/engagement start, a Project-owned fact independent of the Company's own value even though they're usually equal at creation. Admin-only to correct after creation. Displayed as "Client Since" only while Active/On Hold.
- **Current Contract** (`project_contract_periods` rows) — the authoritative, Project-owned operational contract period, derived (never stored) as "current" via `period_start <= today <= period_end`. Every period ends December 31 of its own start year; a renewal period always starts the following January 1. Admin-only to record the first period (`create_initial_project_contract_period`) or renew (`renew_project_contract_period`, Phase 6B — Active/On Hold lifecycle only, both dates server-derived from the current leaf).

A Project's Contract History list derives each recorded period's display state the same way — **Current**, **Upcoming** (a renewal recorded before its own `period_start` arrives — the prior period stays Current until its own `period_end`), or **Past** — never a stored column. Narrow correction (Phase 6B): an Admin may remove ONLY the current leaf period (never a non-leaf, which would disconnect the chain) via `delete_latest_project_contract_period`, or correct the root period's start (`correct_initial_project_contract_period_start`) ONLY while it remains the Project's sole recorded period — both reject once the relevant precondition no longer holds, and neither is a lifecycle transition.

`projects.contract_months`/`projects.contract_end_date` (the pre-Phase-6A rolling-duration pair) and `companies.renewal_date` are all preserved, unchanged, **no longer read as any Project's authoritative current contract** — do not reintroduce a fallback to them.

Contract-period data is deliberately independent of Project lifecycle: no status transition (Active/On Hold/Completed/Canceled/Archived/Trash, in either direction) reads or writes `project_contract_periods` (renewal eligibility checks the CURRENT status at call time, but a transition itself never touches contract-period rows, and Reactivation never auto-creates or restores one), and recording/renewing/correcting/removing a period has zero effect on Templates/Services/Activities/Tasks/checklists/staffing/Partner Brand/Tags/Project Group.

### What counts as "active work" on dashboards

Two related but distinct filters:
- `isTaskInActiveProject` + `isTaskClosed` combine in My Day to hide **open** tasks whose Project isn't Active — but a **closed** (completed/canceled) task still shows in its own historical bucket regardless of Project state.
- `isTaskActiveWork` (`task-display.ts`) — the stricter "counts as active operational work" rule used across every dashboard KPI/summary card: `!isTaskClosed(status) && isTaskInActiveProject(task)`.
- The main Projects list itself does **not** filter Archived/Trash out — it just starts those two status groups collapsed by default, while every other status group starts expanded.

## Template (Workstream)

A Template is one client-facing service line delivered within one Project (e.g. "Accounting" inside the "Alderleaf Manufacturing" Project). Status values: `active | on-hold | completed | cancelled`. The UI's "Archive" action for a Template reuses `cancelled`, relabeled **"Archived"** (neutral, not destructive) — this is intentional reuse of an existing status value, not a new column.

Duplicate prevention: a Project may not have two *active* Templates for the same catalog Service Line (`workstreams_project_service_line_active_unique_idx`, a partial unique index excluding archived rows) — a previously-archived instance doesn't block re-adding the Template.

Archived-Template task guard: a Task's `workstream_id` can never be newly set (create, or move) to a Template whose status is `cancelled` (archived) — enforced by the `enforce_task_invariants` trigger, with a friendlier duplicate check also in `create_task()` for better error UX.

> **Hosted-DB status note**: both of the above guarantees were introduced by migrations dated 2026-09-11 whose own file headers say "NOT YET APPLIED TO THE HOSTED PROJECT." That header text is stale — both were subsequently applied and verified against hosted Supabase during CD-162's final deployment (see `current-state.md` and `data-and-supabase.md`'s migration table). **Don't trust a migration file's own header comment as a live status indicator** — check `current-state.md` or the actual hosted schema.

## Activity

A catalog tag (grouped under a Department) that a Template can be configured to use. Configuring which Activities a Template uses is Supervisor/Superadmin only (`canConfigureWorkstreamActivities`) — Employees, even as the Template's own lead, cannot, at either the application layer or the hosted RLS layer. (An older code comment on `canConfigureWorkstreamActivities` still describes this as an open app-layer/RLS parity gap — it was closed by migration `20260910090000_employee_service_activity_authorization_parity.sql`, applied to hosted; the comment itself is just stale. See `troubleshooting.md`.)

## Task

### Statuses

`TaskStatus = "not-started" | "in-progress" | "waiting" | "completed" | "canceled"`

(Single-L `canceled` here — vs. double-L `cancelled` on Project. Both intentional, both locked; don't "fix" either.)

| Value | Label |
|---|---|
| `not-started` | Not Started |
| `in-progress` | In Progress |
| `waiting` | Waiting |
| `completed` | Completed |
| `canceled` | Canceled |

Phase 5 (CD-214) retired a sixth status, `blocked`, in favor of `waiting` — see `decisions.md`'s Phase 5 entry. A legacy `blocked` value may still appear in stale client-side filter state (a bookmarked URL, sessionStorage, a Saved View); `src/lib/data/task-status.ts` normalizes it to `waiting` on read only — it is never a valid value to *write*.

**Waiting requires a reason** (`Task.statusReason`), collected via a dedicated dialog and server-enforced (auto-cleared the instant status leaves it). A handful of legacy pre-migration rows are exempt from the requirement on unrelated edits, but any genuinely *new* transition into Waiting still requires one.

### Open vs. Closed / Overdue

- **Closed** = `completed` or `canceled`. Everything else (including Waiting) is **Open**.
- **Overdue** = not closed, has a due date, and that due date is strictly before today (a plain string comparison on `YYYY-MM-DD`, not a timezone-aware timestamp comparison — see `troubleshooting.md` for why that distinction matters).

### Checklist — the only sub-item concept, and it can drive status automatically

A Task's Checklist is a flat, unnested list (`ChecklistItem`: description, `isDone`, position, who/when completed — no per-item assignee or due date). **Checking the last remaining item auto-completes the Task; unchecking any item on an already-Completed task auto-reverts it to `in-progress`** (never back to `not-started`) — this only fires when the Task actually has checklist items, and it's the only place a checklist toggle triggers a status change.

### Reopening a Completed/Canceled Task

There is no dedicated "Reopen" action. A Completed/Canceled Task is reopened by changing its status back to any open value through the normal status controls (`TaskStatusPicker`/`TaskStatusRail`) — no special permission beyond the ordinary status-change gate.

### Comments is canonical; Notes and Handoff authoring are retired

- **Comments** (`ProjectComment`, scoped by `taskId`) is the one canonical Task/Project discussion mechanism.
- **Task Notes**: authoring is retired for Tasks and Projects (both render a read-only "Legacy Notes"/"Historical notes" section only). Notes is *not* retired everywhere — Company-level Notes ("Client Context") is still a live, creatable feature.
- **Task Handoff**: authoring is retired — no create-handoff UI exists anywhere. Historical Handoff rows remain read-only (surfaced in a `TaskLegacyHistorySection`). Ownership transfer today is: change Assignee(s) + add a Comment.

### Views

List (default) / Board / Timeline. Board deliberately omits a Canceled column (it's closed/historical, still fully visible in List). Timeline is a Gantt-style view driven by plain `startDate`/`dueDate` strings.

### Create/Edit fields (`TaskFormDialog`)

Title (required), Description, Project, Template (required), Activity (optional/conditionally required, with an auto-suggest + "reuse from past task" feature), Status + conditional reason, Priority, Start date, Due date, Estimated time, Assignees (**hidden from Employee viewers** — self-assignment is implicit for them), Checklist items.

### Task List columns (Phase 1)

The Task List's locked visible column set is **Task / Priority / Project-Template / Start Date / Due Date**. The Assignee column was removed from the List's visible columns — Assignee remains fully available as Task detail data, a List filter (`TaskFilters.assigneeId`), and assignment functionality; only the List's own column was dropped. Start Date reuses `Task.startDate` (already a real field, previously shown only in the Task Drawer/Properties Rail and Timeline, never in the List) and the same `formatDueDateShort` helper Due Date already used.

## Team Activity (Updates + Time)

Team Activity (`/dashboard/team-activity`, tabs `?view=updates` / `?view=time`) is a **UI/navigation merge only** — it replaced two separate pages (formerly `/dashboard/team-updates` and `/dashboard/team-time`, both now 307-redirected to the merged page) with one shared shell (roster, date stepper, selected-person state). **The underlying business models were never merged** — Updates still reads/writes `daily_updates`; Time still reads/writes `time_entries`. Neither model gained or lost any field as part of this merge.

### Updates (`daily_updates`)

Three states, defined purely by row presence/status (there is no literal "not-started"/"submitted" enum value):
- **Not started** — no `daily_updates` row exists for that person/date.
- **Draft** — a row exists, `status = "draft"`. Created/refreshed automatically the moment the person opens **My Day** (entries are computed from that day's Task/TimeEntry/Handoff activity, never hand-typed from scratch).
- **Submitted** — `status = "confirmed"`. The *only* way a row reaches this state is the person clicking "Submit Daily Update" on My Day. Team Activity is read/review-only — it has no path to create or submit an update on someone's behalf.

Keep the two empty states distinct in any UI: "no row exists" ("hasn't opened My Day on this day") is a different, meaningful signal from "row exists but has zero entries" ("opened, nothing logged yet").

A Team Lead/Admin can "Mark Reviewed" on a *Submitted* (never Draft, never their own) update — one-shot, can't be re-reviewed once marked.

### Time (`time_entries`)

One single time-tracking model, fed by exactly two write paths: the **Task timer** (start/pause/resume/stop) and **manual Log Time**. Team Activity's Time tab is a team-scoped, date-scoped *read* over the same table — no separate "team time" model, no aggregation RPC (totals are computed client-side from the fetched entry list).

Team Activity's Time summary row shows three always-visible metrics: **Total Logged** (sum of completed, non-running minutes for the visible roster/date), **With Time** (count of visible people with ≥1 entry that date), **No Time** (roster size minus With Time). A "Correct Time" action exists for a completed entry belonging to someone other than the viewer.

## Local-calendar-date semantics

See [architecture.md](architecture.md#local-date-utilities) for the utilities and [troubleshooting.md](troubleshooting.md) for the specific defect this discipline exists to prevent — in short: a timestamp is stored in UTC, but "which day does this belong to *for the user*" must always be answered using **local calendar semantics**, never a naive `.slice(0, 10)` on the UTC ISO string.
