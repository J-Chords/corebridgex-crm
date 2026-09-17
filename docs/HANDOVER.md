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
0c077827e453c8e7da44aeffd5cc2e4731952d51
```

Re-verify with `git rev-parse origin/main` — this file goes stale the moment another PR merges. See `current-state.md` for the live picture.

## 4. Recently completed tickets

- **CD-162** — Boss Feedback MVP Simplification (Dashboard naming, My Day/Planner merge, Project tab consolidation 9→7, Service/Task hierarchy UI polish, employee-service-activity authorization parity). PR #1, merged.
- **CD-190** — Merge Team Updates + Team Time into Team Activity, plus a local-calendar-date time-entry stabilization fix. PR #2, merged.
- **CD-194** — Technical documentation and developer handover (this document set). PR #3, merged.

## 5. Open ticket(s)

- **CD-196** — Clarify Dashboard and My Day information architecture. Status `Code review`, branch `feature/CD-196-dashboard-myday-information-architecture`, PR open against `main`, not yet merged. Locks Dashboard = role-scoped overview/attention, My Day = personal execution/planning (personal by default for every role); see `decisions.md` for the full placement decisions (Notifications, Needs Attention, Upcoming, header differentiation) and the two real defects it fixes (Admin's My Day schedule defaulting org-wide instead of personal; a Team Lead mobile Dashboard horizontal-overflow bug).
- **CD-193** — Normalize local-date handling across task and dashboard date surfaces. Status `New`, not started, no branch created. See `decisions.md` and `troubleshooting.md` for exactly what this covers and what it deliberately excludes (CD-190 already fixed the time-entry-specific instance of this bug class).

## 6. Current Jira states

CD-162, CD-190, and CD-194: `pending deployment`/`Sign-off` (merged + validated, awaiting a hosting decision — see `current-state.md` for each ticket's exact status). CD-196: `Code review`. CD-193: `New`. Full workflow state list and the reasoning behind each transition: `current-state.md`.

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

1. **A hosting decision** for the frontend, followed by a first real deployment and production verification (`deployment.md` has the smoke test). This is the actual current bottleneck — both merged tickets are otherwise done.
2. **CD-193** (local-date normalization for the remaining UTC-slice call sites) — well-scoped, already has its audit boundaries written down in the ticket and in `decisions.md`/`troubleshooting.md`.
3. Two smaller, non-urgent items surfaced during recent audits, worth a look whenever someone's in that area: the `Project.status === "completed"` code/comment disagreement, and the `canConfigureWorkstreamActivities` app-layer/RLS parity gap (both in `troubleshooting.md`).

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

CURRENT MAIN HEAD: 0c077827e453c8e7da44aeffd5cc2e4731952d51 (re-verify — this drifts)

RECENTLY COMPLETED (merged to main):
- CD-162: Boss Feedback MVP Simplification (PR #1)
- CD-190: Merge Team Updates + Team Time into Team Activity, + a local-calendar-date
  time-entry stabilization fix (PR #2)
- CD-194: Technical documentation and developer handover (PR #3)
CD-162 and CD-190 currently sit at "pending deployment" (merged + validated, no hosting
target exists yet to deploy to); CD-194 at "Sign-off".

OPEN TICKETS:
- CD-196 — Clarify Dashboard and My Day information architecture. Status "Code review,"
  branch feature/CD-196-dashboard-myday-information-architecture, PR open against main,
  not yet merged. See decisions.md for the full scope.
- CD-193 — Normalize local-date handling across task and dashboard date surfaces.
  Status "New," not started. Do not implement unless explicitly asked to.

DOMAIN HIERARCHY (locked): Project → Service → Activity → Task → Checklist.
No Subtask level exists — it was built, then deliberately fully removed. "Service" is
the only user-facing term; "Workstream" is the internal/code name only (types, table
names, routes) — never write "Workstream" in UI copy.

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

TASK MODEL: statuses not-started/in-progress/waiting/blocked/completed/canceled (single-L).
Waiting/Blocked require a reason. Closed = completed or canceled. Checklist completion
can auto-complete/reopen a Task. No dedicated "reopen" action — just change status back.
Comments is canonical; Task Notes and Task Handoff authoring are both retired
(read-only history only).

PROJECT MODEL: statuses active/on-hold/completed/cancelled (double-L)/archived/trash.
isProjectActiveForNewWork() gates new-work creation; historical data always stays
readable. Archive and Trash are two distinct lifecycle actions with different
semantics — see docs/domain-model.md.

LOCAL-DATE RULE: never use new Date().toISOString().slice(0, 10) or
someTimestamp.slice(0, 10) to answer "what calendar day is this for the user" — that
reads the UTC date, which disagrees with local date near midnight in any non-UTC
timezone. Use src/lib/planner-dates.ts (todayDateOnly, dateKeyFromTimestamp,
localDayBoundsUtc, parseDateOnly). This exact bug was found and partially fixed in
CD-190; CD-193 (open, not started) covers the remaining unfixed call sites.

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
verification (docs/deployment.md has the audit and a smoke-test checklist), OR
starting CD-193 if that's what's being asked for. Do not deploy, transition Jira past
"pending deployment," or start CD-193 unless explicitly instructed to.
```
