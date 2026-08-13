# Corebridge X — Current Project State

## Purpose

Corebridge X is an internal PSA (project + team-ops) tool for a B2B outsourcing hub serving several partner brands. It is **internal-staff-only** — accounts are invite-only, there is no self-signup, and there is no client login of any kind. "Clients" are modeled as **Companies**; Client Contacts are reference-only data (name/title/email/phone), never accounts.

Operational focus: who is doing what, for which client, current status, time spent, and what's blocked — not a generic project-management tool and not an analytics/BI product.

Architecture is **frontend-first, provider-swap**: every feature has a mock provider (in-memory data, fully functional) and a Supabase provider (same interface, not yet implemented — see "Current backend status" below). Screens and hooks only ever talk to the provider interface, never to mock or Supabase specifics directly, so swapping the backend is meant to be a wiring change, not a rewrite.

Stack: Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui (Base UI primitives). Supabase (Auth + Postgres) is the intended real backend, owned by a separate team.

## How to use this document

Source-of-truth order, most authoritative first:

1. **The current live repository/code** — what's actually implemented, always wins over any document.
2. **`docs/current-project-state.md`** (this file) — current verified status and handoff point.
3. **`docs/product-brief.md`** — detailed product rules, locked decisions, and full phase-by-phase history.
4. **`docs/route-map.md`** — routes and application structure.
5. **Git checkpoints** — recovery points; see "Latest verified checkpoint" below.
6. **AI chat transcripts** — historical context only. Never authoritative over what the repository and docs currently say.

**When starting a fresh AI/Claude Code session, first read, in this order:**
1. `docs/current-project-state.md`
2. `docs/product-brief.md`
3. `docs/route-map.md`

Then inspect the current repository (git status, the relevant source files) before assuming anything or changing code.

## Latest verified checkpoint

**Current:**
```
ddc6d4c250b0d83434cfb045854133e28725b7a8
checkpoint: supervisor time review and correction
2026-08-13
Manually verified and accepted by the user (Phase 3.36).
```

**Previous:**
```
4b09995baabe849904db73c9950708f553379c20
checkpoint: task notifications and verified workstream task flow
```

**Baseline:**
```
76b8301d6cfc3c8b120d6529fd525d8faa896c77
checkpoint: working PSA frontend baseline before supervisor/subtask expansion
```

(There is one earlier commit, `0c47dccc11f9ad50dc793ac8d86f6a62f2f04002` — "Initial commit" — before the baseline above.)

## Current product hierarchy

```
Client / Company
  → Workstream        (service container)
      → Task          (executable work)
          → Checklist (simple completion steps, inside a Task)
          → [Activity] (optional single tag — see below)
  → Sub-task           PLANNED, NOT YET BUILT
```

- **Workstream** = one service delivered to one client (e.g. "Payroll 2026"). A lightweight container — name, service line, lead + team, status, optional start/renewal dates, optional recurrence. It carries **no** effort/estimate field of its own.
- **Activity** = a service-specific work category from the brand's Activity Catalog (Brand → Department → Activity). A Task may optionally carry a single `activityId` tag, scoped to the Task's own Workstream's service line when one is set. **This tag is optional, never required** — work is never blocked for lack of one.
- **Task** = the actual unit of executable work — title, status, priority, due date, expected time, assignees, checklist.
- **Checklist** = plain completion steps inside a Task (no sub-status, no assignee of its own).
- **Sub-task** = a real child Task with its own status/assignee/time/checklist — **planned, not yet built**.

**Locked data-model decision**: each Task belongs to exactly **one Workstream** (required — `Task.workstreamId`) and optionally **one Activity** (`Task.activityId: string | null`). `Task.companyId` is a denormalized copy of the Workstream's own company, kept in sync by the provider, never independently editable. **Do not** introduce `workstreamIds[]` or `activityIds[]` — if several Activities are ever needed at once, the intended direction is batch-creating separate Tasks, not one Task belonging to several Activities/Workstreams.

## Workstream / Activity rules

- Picking a Client scopes the Workstream picker to that Client's own Workstreams.
- Picking a Workstream scopes the Activity picker to that Workstream's own service line (e.g. a Payroll Workstream shows only Payroll Activities; File Management shows only File Management Activities). A Workstream with no service line set falls back to the whole brand's catalog.
- Changing the Client clears an incompatible Workstream/Activity selection; changing the Workstream clears an incompatible Activity selection.
- The inline "+ New Workstream" action from Task creation works, creates the Workstream under the selected Client without leaving the Task form, and auto-selects the new Workstream back on the Task.
- Workstream has **no** manual expected-time field. Its Time-vs-Budget figure is a roll-up: expected = sum of its own Tasks' `expectedMinutes`; actual = sum of completed time entries against those Tasks.

## Roles and access

Exactly **three roles**: `superadmin`, `supervisor`, `employee`. No configurable permission matrix.

- **Superadmin** — organization-wide visibility and management.
- **Supervisor** — self + direct-report team scope; is also a worker themselves, not purely a manager; manages/reviews the Tasks, Companies, and time of the people they directly supervise. **Does not** get organization-wide visibility.
- **Employee** — sees and acts on their own assigned work and assigned Companies only.

Key mechanics:
- `User.supervisorId` is the single flat field every "who manages whom" check (`managesUser`, `assignableStaffFor`, `visibleCompanyIds`, `canAccessTask`, `canAccessWorkstream`, `canViewTimeForUser`, `canCorrectTimeEntry`, …) is built on — a flat, single-supervisor hierarchy, not a configurable org chart.
- RBAC is enforced **inside the mock provider layer** (`src/lib/data/permissions.ts`, called from provider methods), not merely by hiding UI buttons — a direct call to a provider method from an unauthorized role/relationship is rejected the same way a hidden button would have prevented it.
- This provider-level enforcement is the mock backend's own discipline. It must be **mirrored in Supabase RLS** once that backend is real — RBAC today is not yet production security (see "Current backend status").

## Task assignment / execution

- Employees can self-add a Task; it goes live immediately (no approval) and notifies their supervisor + superadmin.
- An employee's own assignment is always forced to themselves (`resolveAssigneeIds`) — they can never assign someone else.
- A Supervisor can assign within their own team scope; a Superadmin has broad assignment scope.
- Ticking every checklist item on a Task auto-sets it to Done; unticking one on an already-Done Task reverts it to In Progress.
- `task-assigned` and `task-status-changed` notifications fire on genuine assignment/status changes (Phase 3.35) — never for the actor's own action on themselves, never duplicated by a no-op edit.
- Notification recipients are filtered through the same `canAccessTask` check the linked page itself uses, so a notification is never created whose link would then dead-end for its recipient (the "notification access protection" fix).

## Time tracking — verified current behavior

- Start / Pause / Resume / Stop a timer; manual "Log time" entry (time-range or duration).
- Exactly **one active (running) timer per user**, ever — starting a new one auto-pauses (not stops) whatever that same user had running elsewhere.
- A paused entry's elapsed time is excluded from further counting until resumed; resuming chains to the prior paused entry so the visible elapsed time is continuous.
- Every `TimeEntry` is owned by exactly one `userId` — there is no shared/team entry.

**Locked rule (Phase 3.36 refinement)**: **personal time logging requires being an explicit assignee of the Task.** Supervisor/Superadmin management visibility over a Task does **not**, by itself, grant permission to log their own time against it. If a Supervisor genuinely participates in the work, add them as a real assignee — their logged time then stays fully and separately attributed from the original assignee's. This is enforced in the provider (`canLogTime`, called from `startTimer`/`resumeTimer`/`createManualEntry`), not just a hidden button.

Also locked: a Supervisor/Superadmin may **review** an Employee's time (Team Time) without being assigned to the underlying Task — assignment gates *logging your own* time, not *reviewing someone else's*. Nobody may start/pause/resume/stop **another user's** live timer, regardless of role — this predates Phase 3.36 and was re-verified unchanged by it.

## Supervisor Time Review & Correction — Phase 3.36

**Core rule**: Estimated time is a planning/review benchmark. Actual/logged time is what really happened. Exceeding the estimate is a review *signal* only — it never automatically invalidates, reduces, or flags a time record. A **correction** is only for a genuinely inaccurate record (forgot to stop the timer, a duplicate entry, a typo'd manual duration).

Correction rules, all provider-enforced:
- Only a **completed** entry (`durationMinutes !== null`) can be corrected — never a running one.
- Supervisor → their own direct reports only. Superadmin → organization-wide. Employee → can never correct, including their own — there is no self-correction for any role in this phase.
- A **reason is always required**.
- Confirming a correction updates `TimeEntry.durationMinutes` to the corrected value in place (the "effective" duration every existing total/rollup reads) — `startTime`/`endTime` are untouched.
- Every correction is stored **separately and append-only** (`TimeEntryCorrection`, its own `db.timeEntryCorrections` table) — never overwritten. Correcting an already-corrected entry adds a new record whose "previous" value is the entry's value at that moment, so repeated corrections chain correctly and nothing is ever lost.
- The Employee whose time it is can always see the full correction history for their own entries (view-only — they cannot alter it). Visibility is a separate, broader gate (`canViewTimeForUser`) from correction ability (`canCorrectTimeEntry`).
- Correction duration is entered as plain **Hours / Minutes** fields (not the Task/Workstream expected-time unit control) — no unit conversion required from the Supervisor.
- A correction never grants any control over another user's live timer.

**Task estimate-vs-actual review signal**: always **Task `expectedMinutes` vs. the cumulative effective actual minutes across every completed entry logged against that Task** (any assignee, summed) — never one individual `TimeEntry` compared against the whole Task's estimate. Team Time shows this cumulative Task-level context beside (not instead of) each entry's own duration.

## Notifications

`task-assigned` and `task-status-changed` notify the relevant assignees/supervisor (never the actor about their own action, never duplicated). All notification links are filtered so they only ever point somewhere the recipient can actually open. Full rules live in `docs/product-brief.md`'s "Task Assignment & Status Notifications" section — not repeated here.

## Current backend status

- The **active** provider today is **mock** (`NEXT_PUBLIC_DATA_PROVIDER=mock` in `.env.local`) — an in-memory dataset, reset to seed data on every full page reload.
- Every `src/lib/data/providers/supabase/*` file exists only as a `notImplemented`/stubbed contract — **none of them have real behavior yet**, including auth.
- **Current RBAC is enforced in the mock provider layer only.** It is a correct behavioral specification for what real security must do, but it is **not** itself production security — real security requires the equivalent enforcement in Supabase RLS once that backend exists. Do not represent current RBAC as production-ready.

**Existing Supabase project**: the user already has a Supabase free-plan project named **Codebridgex**. Do **not** create another Supabase project when the Supabase phase begins. No credentials, keys, or URLs for it are recorded in this document or should ever be committed to this repository.

A prior `initial_workops_schema.sql` reportedly exists from earlier planning and **predates the current role/hierarchy architecture** (Company → Workstream → Task, the flat `supervisorId` model, the current permission functions). It was not found in this repository during this audit — if it's supplied later (e.g. from the Supabase project's own migration history), treat it as historical input to be reconciled against the *current* code, not applied as-is.

## Current phase status

**Phase 3.36 — Supervisor Time Review & Correction: COMPLETE and manually verified.**

**Next major phase: Supabase Foundation / Schema Reconciliation** — not started. Do not begin it without explicit instruction.

## Next roadmap

1. Supabase ground-truth/schema reconciliation — map current provider contracts + permission rules to an intended Postgres schema.
2. Connect provider contracts to the existing **Codebridgex** Supabase project (no new project).
3. Real Auth/Postgres/RLS migration, in controlled slices — not a single big-bang cutover.
4. Sub-tasks — one nesting level (real child Task: own status/assignee/time/checklist).
5. Client long-lived/forever note + Client activity/history/reporting.
6. Batch Task creation from multiple Activities at once (workflow improvement, not a data-model change).
7. Attendance/clock-in/geolocation — future only, not scoped now.

## Known deferred / do not build now

- No configurable roles/permission matrix (three fixed roles only).
- No deep/infinite sub-task nesting (one level, when built).
- No employee surveillance, screenshots, or idle tracking.
- No geolocation/attendance/clock-in.
- No AI auto-generated reports, estimates, or summaries.
- No duplicate manual Workstream expected-time field (it stays Task-derived).

## Do not regress

- Do not flatten Client → Workstream → Task back into Client → Task.
- Do not put Task-shaped fields (expected time, due date, checklist) back onto Workstream.
- Do not restore a manual `Workstream.expectedMinutes` — Workstream time budget stays Task-derived.
- Do not broaden Supervisor to organization-wide visibility.
- Do not make personal time-logging manager-based again — it is assignee-only, for every role.
- Do not let a Supervisor/Superadmin start/pause/resume/stop another user's live timer.
- Do not silently overwrite a corrected time value without preserving audit history.
- Do not compare one individual TimeEntry against a whole Task's `expectedMinutes` — always cumulative Task actual vs. Task estimate.
- Do not introduce multiple Workstream/Activity IDs on a single Task (`workstreamIds[]`/`activityIds[]`).
- Do not create a second Supabase project — reuse **Codebridgex**.

## Standard development workflow

1. Read `current-project-state.md` → `product-brief.md` → `route-map.md`.
2. Inspect the current code before assuming anything about existing behavior.
3. Audit first for risky/cross-cutting changes (permissions, data model) before writing code.
4. Implement one small, scoped slice at a time.
5. Run `npx tsc --noEmit`, `npx eslint src`, `npm run build` — no new errors/warnings.
6. Report the exact diff and what was verified, in a structured report.
7. Give the user a concrete "try it yourself" manual checklist.
8. The user manually verifies the feature and direction in the running app.
9. Fix any regressions found before proceeding to anything else.
10. Create a Git checkpoint commit **only after** manual acceptance — never before.
11. Update `current-project-state.md` after each meaningful accepted phase.

**Automated verification (`tsc`/`eslint`/`build`) is necessary but is not a substitute for manual UX testing.** Both are required before a checkpoint.

## How to hand off to another AI

Paste this to start a fresh session (ChatGPT, Claude.ai, or Claude Code):

```
First read:
- docs/current-project-state.md
- docs/product-brief.md
- docs/route-map.md

Use the current repository as the implementation source of truth.
Do not regress newer verified behavior.
Read the Current phase and Next roadmap sections before proposing changes.
```

## Last updated

- Date: 2026-08-13
- Current verified checkpoint: `ddc6d4c250b0d83434cfb045854133e28725b7a8` — "checkpoint: supervisor time review and correction"
- Current phase: Phase 3.36 — Supervisor Time Review & Correction (complete, manually verified)
- Next phase: Supabase Foundation / Schema Reconciliation (not started)
