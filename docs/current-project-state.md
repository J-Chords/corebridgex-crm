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

- The user's local `.env.local` still reads **mock** (`NEXT_PUBLIC_DATA_PROVIDER=mock`) as of this writing — an in-memory dataset, reset to seed data on every full page reload.
- There are **14 provider groups** in `src/lib/data/providers/` (Auth, Companies, Workstreams, Tasks, TimeEntries, Notes, Notifications, Templates, TaskHandoffs, ActivityCatalog, AccomplishmentsReport, SavedViews, DailyUpdates, ClientReport).
- **`NEXT_PUBLIC_DATA_PROVIDER` now has three valid values**, centralized in `src/lib/data/provider-mode.ts` (`providerMode`/`usesSupabaseAuth`/`usesSupabaseData` — everything else compares against these instead of raw strings): `mock` (every provider mock — the default and an unrecognized/invalid value both fail safe to this), `supabase-auth` (Auth is real Supabase, **every other provider stays mock**), `supabase` (every provider real Supabase — same behavior `providers/index.ts` always had, just renamed/centralized). `supabaseAuthProvider` (`src/lib/data/providers/supabase/supabase-auth-provider.ts`) is now a real implementation; every other `src/lib/data/providers/supabase/*` file is still a `notImplemented`/stubbed contract — **no business-data provider has real behavior yet**.
- **Current RBAC is enforced in the mock provider layer only** for every provider except Auth. It is a correct behavioral specification for what real security must do, but it is **not** itself production security for the still-mock providers — real security requires the equivalent enforcement in Supabase RLS once each backend is real. Auth is the first exception: `supabaseAuthProvider` reads role/active/supervisorId/assignedCompanyIds from `public.profiles`/`public.user_companies` through the signed-in user's own session, with Postgres RLS (hardened in Foundation C) as the real access-control boundary — never from JWT/`user_metadata`, never through a service-role client.

**Existing Supabase target**: **Corebridgex** organization → **corebridgex-crm** project (ref `qxqxzuoaivyddwxqqoog` — not a secret, safe to record). No credentials, keys, or URLs for it are recorded in this document or should ever be committed to this repository.

**The repository is now linked to this project, and the Foundation A schema is live there**: all four migrations pushed and confirmed matching (`supabase migration list` shows identical local/remote versions), the reference/test seed applied (idempotently — see below), RLS confirmed enabled on all 7 tables, `handle_new_user()`'s trigger confirmed present on `auth.users`. `profiles`/`user_companies` are confirmed empty — no Auth users exist yet. This is strictly schema + fake/test reference data; no real client information, no Auth users, no secrets were ever placed there by this process.

**Supabase Foundation A (local scaffolding) is complete** — the following was built locally, then applied to the hosted project as described above:
- `@supabase/supabase-js`, `@supabase/ssr` installed; `supabase` CLI pinned as a devDependency (no global install).
- `supabase/` initialized locally (`supabase init`) — config only, no remote link.
- `src/lib/supabase/client.ts` (browser) and `server.ts` (server) — the sole Supabase-client construction points; not yet called from any provider.
- `src/proxy.ts` — **Next.js 16 uses this file, not `middleware.ts`** (Middleware was renamed to Proxy in Next 16; same runtime behavior). Scoped to session-cookie refresh only, never an authorization decision. No-ops cleanly when the Supabase env vars are absent (today's normal state) — verified the mock app still starts and serves pages correctly with this file present.
- First migration set written under `supabase/migrations/` (local files only, never run against the hosted project): `profiles` (+ `handle_new_user` trigger, `is_superadmin`/`is_supervisor`/`is_employee`/`manages_user` helpers, `admin_set_user_role`/`admin_set_supervisor`/`admin_set_active` RPCs), `brands`/`service_lines`, `companies`/`client_contacts`/`company_service_lines`/`user_companies` (+ `can_access_company` helper). RLS enabled and policies written for every table in this set, mirroring current provider behavior exactly (including the discovered `is_internal` company flag needed because the mock's `"company-internal"` string id can't be a `uuid` PK — see the migration file's own header comment).
- `supabase/seed.sql` — reference/company data only (brands, service lines, 3 fake test companies plus the internal one, 2 fake contacts). No `auth.users`/plaintext passwords, no real client information. Made idempotent (`ON CONFLICT DO NOTHING` / `NOT EXISTS` guards keyed to the schema's own uniqueness invariants) after review found the original version would hard-fail on a second `db push --include-seed`. Applied to the hosted project and verified by row count — safe to re-run.
- `.env.example` added (git-ignore has an explicit `!.env.example` exception) — variable **names** only (`NEXT_PUBLIC_DATA_PROVIDER`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), no values. `.env.local` remains ignored and untouched.
- `src/proxy.ts` uses `supabase.auth.getClaims()` (not `getUser()`) — the current-recommended call: it refreshes the session first if the token is close to expiring, then verifies the JWT, typically locally via a cached JWKS endpoint rather than always round-tripping to the Auth server.

**Development strategy**: the local Docker-based Supabase stack is **not** being used. The user is new to Supabase; the hosted **corebridgex-crm** project itself is the development/test backend, connected directly (see above) rather than through a local Postgres.

Tables intentionally **not yet created**: workstreams, tasks, task_assignees, checklist_items, time_entries, time_entry_corrections, notes, notifications, task_handoffs, reports (either kind), daily_updates, templates, saved_views, documents. These are later migrations, once this slice is applied and re-tested.

A prior `initial_workops_schema.sql` reportedly exists from earlier planning and **predates the current role/hierarchy architecture** (Company → Workstream → Task, the flat `supervisorId` model, the current permission functions). It was not found in this repository — if it's supplied later, treat it as historical input to be reconciled against the *current* code, not applied as-is.

### First-superadmin bootstrap (documented, not yet performed)

Every new Supabase Auth user gets a `profiles` row defaulted to `role = 'employee'` via `handle_new_user()` — there is no signup path that can pick a different role (deliberate: role is never signup-controlled). This creates a one-time chicken-and-egg problem: someone has to become the first Superadmin before the superadmin-only `admin_set_user_role` RPC can be used on anyone, including that very first user. Planned resolution, to be performed interactively (not yet done):
1. Create the first real dev Auth user through the Supabase Dashboard's Authentication UI (email, in the `corebridgex-crm` project).
2. `handle_new_user()` fires automatically and creates their `profiles` row as `role = 'employee'`.
3. The **project owner**, using the Dashboard's SQL Editor (a privileged, human-in-the-loop context — not an app code path, not a migration file, not a public endpoint), runs a single one-time `update public.profiles set role = 'superadmin' where id = '<that user's id>';` for that specific row only.
4. From that point on, every further role/supervisor/active change goes through the normal `admin_set_*` RPCs, exercised by that first Superadmin — no further manual SQL needed.

Explicitly not done, and not planned: no signup-metadata role selection, no public "promote to superadmin" endpoint, no user IDs/emails/passwords ever placed in a migration file or committed anywhere.

**Status: complete and verified.** One development Auth user exists; `handle_new_user()` fired correctly (its `profiles` row was auto-created, matched by `id`, defaulted to `role = 'employee'`/`active = true`/`supervisor_id = null` — confirmed read-only before any bootstrap SQL ran); the project owner then ran the one-time bootstrap SQL in the Dashboard SQL Editor. Read-only re-verification afterward confirmed that same profile now has `role = 'superadmin'`, with `active = true` and `supervisor_id = null` unchanged. **One development Superadmin now exists on the hosted project.** No Supervisor or Employee test users have been created yet — that's deliberately deferred so the normal `admin_set_*` RPC path (exercised by this Superadmin) becomes the mechanism for creating them, rather than more one-off SQL Editor use.

### Internal Company representation (`companies.is_internal`)

Approved as the Supabase equivalent of the mock's `INTERNAL_COMPANY_ID` string sentinel. Rules preserved: at most one company may ever be flagged `is_internal` (enforced by a partial unique index, not just convention); it's visible to every authenticated staff member regardless of their own `user_companies` rows (via `can_access_company()`'s explicit `is_internal` check); being the internal company grants **no** access to any other, unrelated company — the check is scoped to that one row's id, never a blanket bypass. Any future real Supabase provider implementation should resolve "the" internal company by querying `is_internal = true`, never by matching a hardcoded id string.

## Current phase status

**Phase 3.36 — Supervisor Time Review & Correction: COMPLETE and manually verified.**

**Supabase Foundation A — Local Scaffolding + First Migration Set: schema and test seed are live on the hosted `corebridgex-crm` project.** The app still runs entirely on mock — nothing in the running application talks to Supabase yet.

**Supabase Foundation B — Hosted Seed + First Auth/Profile Verification: COMPLETE.** Remote schema/seed verified, `handle_new_user()` verified, first-superadmin bootstrap verified (see above). One development Superadmin exists on the hosted project; no Supervisor/Employee test users yet. The app still runs entirely on mock — `NEXT_PUBLIC_DATA_PROVIDER=mock`, no provider talks to Supabase yet.

**Supabase Foundation C — Explicit Grants + Function Execution Hardening: COMPLETE.** An audit of the hosted project found that Supabase's platform-level default ACLs (`pg_default_acl`, for role `postgres` in schema `public`) had been auto-granting every new table/function/sequence full privileges to `anon`/`authenticated`/`service_role` — broader than any migration's own `GRANT` statements intended (GRANT is additive, it never replaces a pre-existing broader default). One new migration (`20260813162744_harden_public_grants.sql`, applied on top of the existing Foundation A set — none of those four files were modified) now establishes an explicit least-privilege model:
- Table privileges are now exact per the real provider contracts: `anon` has zero privileges on any of the 7 public tables; `authenticated` gets only what current providers actually use (e.g. `profiles` is SELECT + column-scoped UPDATE on `full_name`/`email` only — `role`/`supervisor_id`/`active` stay unreachable by ordinary UPDATE; `companies`/`client_contacts` get no DELETE, since neither provider has a delete path; `company_service_lines`/`user_companies` get no UPDATE, since both are always fully replaced rather than row-edited); `service_role` gets ordinary CRUD only. No role retains TRUNCATE/REFERENCES/TRIGGER on any table.
- Function EXECUTE is now explicit: `PUBLIC`/`anon` have none of the 9 application functions; `authenticated`/`service_role` can call the 5 RLS helpers + 3 admin RPCs only (the admin RPCs keep their own internal `is_superadmin()` check — EXECUTE privilege was never the authorization boundary); `handle_new_user()` is not directly callable by any role and remains attached to the `on_auth_user_created` trigger on `auth.users` unchanged (trigger firing doesn't require the triggering role to hold EXECUTE on the trigger function).
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` now excludes `anon`/`authenticated`/`service_role` from future tables/functions/sequences — a future migration must GRANT explicitly rather than inheriting broad access automatically. (Supabase's own `supabase_admin` role default ACL is untouched — out of scope, platform-managed.)
- No data was touched, no RLS policy was changed (all 13 pre-existing policies remain, same names/commands), RLS remains enabled on all 7 tables. Committed as `628021e0f8b254490241bf4fbac274823dd24d72` ("checkpoint: harden Supabase public privileges").

**Supabase Auth — Controlled Transitional Mode: COMPLETE and manually verified.** `NEXT_PUBLIC_DATA_PROVIDER` gained a third value, `supabase-auth` (real Auth, every other provider stays mock — see "Current backend status" above for the full three-mode model). `supabaseAuthProvider` is a real implementation of the existing `AuthProvider` contract (`getCurrentUser`/`login`/`logout`/`updateProfile`), mapping the signed-in session to the app's `User` type from `public.profiles` (role/active/supervisorId/email/fullName/createdAt) and `public.user_companies` (assignedCompanyIds) — never from JWT/`user_metadata`, never through a service-role key (none exists in this app). An Auth identity with no matching `profiles` row, or with `active = false`, is denied app access (signed out, not fabricated as a default Employee). Editing a profile's email to a different value is explicitly rejected for now (`"Changing your sign-in email isn't supported yet"`) rather than letting `public.profiles.email` diverge from the real Supabase Auth sign-in email — fullName-only edits still work, gated the same `canEditOwnProfile` (superadmin-only) way as mock. The login page's quick-demo account buttons only render in `mock` mode.

**Manually verified by the user in the running app** (real hosted `corebridgex-crm` project, real Superadmin credentials — no email/UUID/password recorded here): real Supabase Superadmin login succeeds; mock quick-login controls are hidden in `supabase-auth` mode; the authenticated dashboard loads with the Superadmin identity/role recognized correctly; a page refresh preserves the authenticated session (`getCurrentUser` restores it, no re-login needed); logout correctly clears the session and returns to `/login`; a wrong password produces a clear authentication error without creating a session, and a subsequent correct login still succeeds afterward; existing mock business-data pages (Companies, Tasks, etc.) remain fully usable while signed in as the real Auth user. **All Auth acceptance criteria passed — no regressions found.**

**Known transitional limitation (expected and accepted)**: the real Superadmin's Supabase UUID doesn't exist anywhere in the mock's own task/time/notification seed data, so in `supabase-auth` mode some self-specific mock views (My Day's own assignments, personal notifications/time history) can legitimately look empty for that user — organization-wide Superadmin visibility (where permission logic already short-circuits for the role) still works. This is expected and temporary; do not "fix" it by injecting the real UUID into mock seed data. Email-change support also remains intentionally deferred (see above) until a real confirmation flow is built.

**Next: Companies + minimum Workstream compatibility — AUDIT/DESIGN ONLY**, not started, do not begin without explicit instruction. The previous audit proved real Companies can't yet coexist with mock Workstreams (`mockWorkstreamsProvider.createWorkstream` looks up company ids in the mock's own array) — that compatibility gap needs its own audit before any `supabaseCompaniesProvider` implementation begins.

## Next roadmap

1. ~~Supabase ground-truth/schema reconciliation~~ — done (audit approved).
2. ~~Supabase Foundation A (local scaffolding + Auth/Companies migration set)~~ — done, reviewed, checkpointed.
3. ~~Connect to the hosted `corebridgex-crm` project, apply the migration set + test seed~~ — done, verified.
4. ~~Create the first development Auth user, verify `handle_new_user()`, run the first-superadmin bootstrap SQL~~ — done, verified. One development Superadmin exists.
5. ~~Supabase Foundation C — explicit least-privilege table/function grants + safer default privileges for future objects~~ — done, verified read-only against the actual effective privileges, committed `628021e`.
6. ~~Supabase Auth — Controlled Transitional Mode (real `supabaseAuthProvider`, `supabase-auth` provider mode)~~ — done, manually verified end-to-end by the user (real login, refresh, logout, wrong-password handling, mock pages still usable).
7. **Companies + minimum Workstream compatibility — audit/design only** — next, not started. Must resolve the mock-Workstream/`createWorkstream` company-id lookup gap before any `supabaseCompaniesProvider` implementation. Supervisor/Employee test users get created through the now-real Auth path once needed, not more Dashboard SQL.
8. Continue with Workstreams/Activity Catalog, then Tasks/Time, then Notes/Notifications/Handoffs, then Reports/Daily Updates/Templates/Saved Views — see the audit for the full dependency-ordered plan.
9. Real Auth/Postgres/RLS migration completes in controlled slices — not a single big-bang cutover.
10. Sub-tasks — one nesting level (real child Task: own status/assignee/time/checklist). `tasks.parent_task_id` will be reserved (nullable, unused) in the Tasks migration when reached.
11. Client long-lived/forever note + Client activity/history/reporting.
12. Batch Task creation from multiple Activities at once (workflow improvement, not a data-model change).
13. Attendance/clock-in/geolocation — future only, not scoped now.

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
- Do not create a second Supabase organization or project — reuse the **Corebridgex** organization's **corebridgex-crm** project.
- Do not expose `role`/`supervisor_id`/`active` as ordinary client-editable profile columns (in RLS or in the UI) — they're authorization-sensitive and, in the schema, reachable only through superadmin-gated RPCs (`admin_set_user_role`/`admin_set_supervisor`/`admin_set_active`).
- Do not treat `src/proxy.ts` (Next.js 16's renamed `middleware.ts`) as an authorization layer — it only refreshes the session cookie; RLS is the real access control.
- Do not add per-provider environment variables (`NEXT_PUBLIC_AUTH_PROVIDER`, etc.) — there is exactly one source of truth, `NEXT_PUBLIC_DATA_PROVIDER`, with exactly three valid values (`mock`/`supabase-auth`/`supabase`) centralized in `src/lib/data/provider-mode.ts`.
- Do not derive a real user's role/active/supervisorId/assignedCompanyIds from JWT claims or `user_metadata` — always from `public.profiles`/`public.user_companies`, read through the signed-in user's own session (never a service-role client).
- Do not let `public.profiles.email` diverge from the real Supabase Auth sign-in email — an email-change request must be rejected until a real confirmation flow exists, never applied to one side only.

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
- Foundation C checkpoint: `628021e0f8b254490241bf4fbac274823dd24d72` ("checkpoint: harden Supabase public privileges"). Previous checkpoint: `244dba8595d3f88e79beb44163105beb03cb5aa1`.
- Current verified checkpoint: this document is being committed alongside the Supabase Auth transitional-mode implementation (commit message: "checkpoint: real Supabase auth transitional mode") — see `git log -1` for the exact hash.
- Current phase: **Supabase Auth — Controlled Transitional Mode — COMPLETE, manually verified by the user, checkpointed.** `supabaseAuthProvider` is real; `NEXT_PUBLIC_DATA_PROVIDER=supabase-auth` is a valid mode where Auth is real Supabase and every other provider stays mock. Real login/refresh/logout/wrong-password flows all manually verified against the hosted project; mock business-data pages remain usable.
- Next phase: Companies + minimum Workstream compatibility — **audit/design only** — not started.
