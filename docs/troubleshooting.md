# Troubleshooting / Gotchas

Verified issues encountered during this project's development. Only entries confirmed against actual code/behavior are listed here.

## `assignableStaffFor`/`listAssignableStaff` is team-scoped by design — don't reuse it for an org-wide picker

**Symptom** (found during CD-208 Phase 4 QA): a new "Additional Team Lead" picker appeared empty for a Supervisor who managed no other Supervisors, even though the locked requirement was "any active Supervisor, no direct-report restriction." In this app's actual seed org (exactly two Supervisors, neither managing the other), this meant **neither could ever add the other** through the UI at all — not just a narrower-than-ideal list, a complete dead end for the feature.

**Root cause**: `assignableStaffFor`/`listAssignableStaff` deliberately scopes a Supervisor caller to "self + your own direct reports" — correct and load-bearing for its existing uses (Company staff assignment, Workstream Lead/Team, where that restriction is the actual product rule). On hosted Supabase this scoping is enforced by `profiles`' own RLS, not just an app-layer filter, so it can't be worked around by filtering differently client-side — the restrictive rows are never returned from the query in the first place.

**Fix**: when a new picker genuinely needs an *unscoped* org directory (any active Employee/Supervisor, no reporting-line restriction), don't reuse `assignableStaffFor`/`listAssignableStaff` — add a new, narrow, purpose-specific SECURITY DEFINER RPC that deliberately bypasses `profiles` RLS for that one directory read (see `list_project_staffing_candidates`, `20261001090000_phase4_staffing_candidate_directory.sql`). The authorization decision for whatever action the picker feeds should live entirely in the RPC that performs the actual mutation, never in which candidates a listing happens to surface — a picker that's too narrow is a usability bug, not a security boundary, and conflating the two is what caused this.

## `tsc`/ESLint/build failing with immediate OOM even at tiny heap sizes — check system memory first, not tooling

**Symptom**: `npx tsc --noEmit` (or ESLint, or a Next.js build) crashes within 1-2 seconds with a V8 "FATAL ERROR: ... Allocation failed - JavaScript heap out of memory" or "Zone Allocation failed," even after raising `--max-old-space-size` to several GB, and even when the process had only allocated a tiny amount (well under 200MB) before crashing.

**Root cause (confirmed during CD-208 Phase 4 work, 2026-09-30/10-01)**: this is a *system-level* memory exhaustion, not a TypeScript/tooling complexity problem — raising Node's own heap cap does nothing because the OS itself is refusing the allocation. Confirmed via `powershell -Command "Get-Counter '\Memory\Available MBytes' ..."` (or `systeminfo`): available physical memory was as low as ~470MB–1GB out of 16GB total, with the pagefile also nearly exhausted. The cause was the machine's own other running applications (multiple browser windows/tabs, multiple editor instances) — nothing this session's own work created or left running (explicitly checked: no orphaned dev servers or leftover QA processes at the time).

**Fix / what to do**: before assuming a code change broke type-checking or blaming tooling, check available system memory directly (`Get-Counter '\Memory\Available MBytes'` or equivalent). If it's critically low (roughly ≤1GB free), do **not** keep retrying `tsc`/builds — each attempt just repeats the same immediate crash and wastes time. Report it plainly (state the actual measured available-memory number) and fall back to careful manual/static code review instead of automated verification until memory frees up — closing unrelated memory-heavy applications, or simply waiting and re-checking later, are the only real fixes; this is an environmental constraint, not something to work around by hand.

## Positive-UTC-offset date bucketing (the CD-190 timezone defect)

**Symptom**: a manually-logged "Duration" mode time entry for "today" silently appeared under *yesterday* in date-scoped views (My Day's Today card, Team Activity's Time tab), for any user in a positive-UTC-offset timezone (e.g. UTC+1).

**Root cause**: the entry's `startTime` was correctly stored as local midnight of the selected date, expressed as a UTC instant — e.g. `2026-09-14` local midnight in UTC+1 stores as `2026-09-13T23:00:00Z`. That's a *correct* absolute instant. The bug was that the code reading it back classified "which day does this belong to" by taking a naive UTC-string-slice (`startTime.slice(0, 10)`) instead of converting back to local calendar semantics — so it read `"2026-09-13"` and bucketed the entry onto the wrong day.

**Fix applied**: switched the affected read paths to `dateKeyFromTimestamp`/`localDayBoundsUtc` (local-calendar-aware), not to a different write-side anchor — see `architecture.md`'s Local-date utilities section and `decisions.md`.

**Where it was fixed**: mock and Supabase `listTimeEntriesForDate`, My Day's Today card, the manual time-entry dialog's date handling.

**Where it was *not* fixed (known, tracked separately)**: the same anti-pattern (`new Date().toISOString().slice(0, 10)`) still exists in roughly 20 other files as of CD-190 — task due-date/overdue classification, various default-date input fields, several dashboard cards. These were deliberately left alone (out of scope for CD-190's narrow fix) and tracked as CD-193. **Do not assume a UTC-slice call site elsewhere in the app has been fixed just because this one class of bug is documented** — check each one.

## Local calendar vs. UTC semantics, generally

Any time you're tempted to write `new Date().toISOString().slice(0, 10)` or `someTimestamp.slice(0, 10)` to answer "what day is this," stop — that's reading the *UTC* date embedded in the ISO string, not the viewer's local date, and the two disagree near midnight in any non-UTC timezone. Use `src/lib/planner-dates.ts` instead (see `architecture.md`).

## Mock provider state resets on reload

Mock data lives in a single in-memory module-level object (`mock-db.ts`) — no persistence. A hard navigation or dev-server restart loses any state you built up (e.g. a controlled QA scenario with specific Draft/Submitted people). Build test state via real UI flows in one continuous browser session. See `testing.md`.

## A migration file's own header comment can be stale

Two migrations dated 2026-09-11 still say "NOT YET APPLIED TO THE HOSTED PROJECT" in their own file header, but were in fact applied and verified against hosted Supabase shortly after being written — nobody went back to update the comment post-deployment. Treat a migration header as a snapshot of intent *at authoring time*, not a live status check. Confirm actual hosted state via `current-state.md` or the Supabase Dashboard, not by reading migration comments.

## A grid item won't shrink below its content's min-content width (the CD-196 mobile overflow)

**Symptom**: Team Lead's Dashboard overflowed horizontally at a ~400px mobile viewport (`document.documentElement.scrollWidth` 573 vs. `clientWidth` 400) — the page wasn't actually using any fixed-pixel width anywhere.

**Root cause**: a grid item's default `min-width` is `auto`, not `0` — meaning a flex/grid child won't shrink narrower than its own content's min-content size unless something overrides that default. `<div className="grid gap-4 lg:grid-cols-3">` renders as a single implicit column below `lg`, so its two child wrapper `<div className="lg:col-span-2">`/`<div className="flex flex-col gap-4">` were each still full grid items — and without `min-w-0`, one of their descendant cards' content (a status pill, a date string, an icon+text row) set a min-content width wide enough to force the whole grid track past the viewport, even though every individual element inside used `truncate`/`min-w-0` correctly at its own level.

**Fix applied**: added `min-w-0` to the grid-item wrapper `<div>`s themselves (`src/components/dashboard/supervisor-dashboard.tsx`, `src/components/dashboard/superadmin-dashboard.tsx`), not to anything inside them.

**Where else this can recur**: any `grid`/`flex` container whose direct child is itself a wrapper `<div>` (not the card component directly) — the wrapper is the thing that needs `min-w-0`, and adding more `truncate`s deeper inside won't fix it. Check new dashboard/My Day grid sections for this pattern before assuming a mobile overflow is caused by the card's own content.

## The same `min-w-0` gotcha, one level deeper: a measuring element needs its own override, not just its ancestors' (the CD-206 Template list truncation bug)

**Symptom**: on the Templates admin list (`/dashboard/admin/templates`), a Template with a long, single-line description rendered at full, unclipped content width instead of a one-line "…"-truncated preview with "View more" — visually forcing the Description column, and the table as a whole, wider than intended (the table only declares `min-w-[1040px]`, not a hard cap, so nothing stopped it growing).

**Root cause**: `TruncatedText` (`src/components/ui/truncated-text.tsx`) measures overflow via `scrollWidth > clientWidth` on a `<span>` that sits inside a `flex flex-col` wrapper. That wrapper, and its own ancestors up to the table cell, all correctly had `min-w-0` — but the measuring `<span>` itself did not. Per the CD-196 lesson above, `min-w-0` on a parent only fixes the parent's own sizing; it does not cascade to a child that is *itself* a flex item. The span's default `min-width: auto` resolved to its own unbroken (`white-space: nowrap`, via the `truncate` utility) content width, which won out over `max-w-full` — so the span (and the table cell/column containing it) rendered exactly as wide as the full description, `scrollWidth` and `clientWidth` came out equal, `overflows` computed `false`, and "View more" never appeared at all.

**Fix applied**: added `min-w-0` directly to the measuring `<span>` in `TruncatedText`, not just its wrapper divs.

**Where else this can recur**: any component that measures or constrains a *specific* nested element's overflow inside a multi-level flex chain — giving the outer wrapper `min-w-0` is necessary but not sufficient if a deeper descendant is also a flex item with its own unbreakable (`nowrap`) content. Check the actual overflow-prone leaf node itself, not just its containers, before concluding a `min-w-0` fix is complete.

## Next.js dynamic routes unexpectedly return 404 in development (the CD-196 `.next` incident)

**Symptom**: `/dashboard/projects/[id]` and `/dashboard/tasks/[id]` (and any other dynamic-segment route) started returning a genuine framework-level "404 — This page could not be found" in a running `next dev` session, while their sibling static list routes (`/dashboard/projects`, `/dashboard/tasks`) kept working fine. The route source files (`page.tsx`) were untouched and present the whole time — this was never a source or data/permissions problem (permission/not-found states in this app are always handled gracefully in-page, e.g. "This task doesn't exist, or you don't have access to it" — never a raw framework 404).

**Root cause**: a partial, targeted deletion of files inside the live dev server's own `.next/dev/types/` directory (done to work around an unrelated corrupted generated-typegen file, while `next dev` was still running against that same `.next`) left the dev server's on-disk route manifest (`.next/routes-manifest.json`) stale/inconsistent — confirmed via its file timestamp lagging behind the process's own restart time, and via `.next/server/app/dashboard/{projects,tasks}` only ever having the static list page compiled, never a `[id]` artifact.

**Diagnostic that proves this class of issue** (safe, read-only, no login needed): request a syntactically-valid-but-fake dynamic segment and a genuinely nonexistent path and compare status codes — `curl -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard/tasks/00000000-0000-0000-0000-000000000000` returning the same `404` as a request to a path that matches no route at all (e.g. `/dashboard/nope`) is the signature of a stale/corrupted dev route manifest, not a real not-found case (a real one still returns `200` with the app's own graceful in-page message, since these are client components).

**Fix applied**: stop the exact Corebridge X dev-server process (verify its command line points at this repo before stopping it — never a broad `node.exe` kill), confirm the port is free, delete the **entire** `.next` directory (never a subset of it), restart with the project's normal `npm run dev`, and re-verify with the same curl diagnostic.

**The generalized lesson — never partially touch a live dev server's `.next`**: this applies to more than deletion. `.next` is disposable, regenerable build/dev output, but it is *shared, mutable state* for whichever process currently owns it. Two things are unsafe to do against a `.next` directory a `next dev` process is actively running against: (1) deleting only part of it (leaves the manifest/dev-type-cache inconsistent, as above), and (2) running `next build` against it (a production build fully rewrites `.next` into an incompatible layout for a live dev session — a real risk discovered validating this same fix, though in practice the affected dev server kept responding correctly afterward, this was not verified safe by design and should not be relied on). If a build needs validating while a real dev server must stay up, build in a separate isolated copy of the repo instead (see `testing.md`'s isolated mock-provider QA technique — the same `robocopy` + `node_modules` junction pattern works for one-off `npm run build` runs too, not just `npm run dev`). Never delete `src/`, `node_modules/`, or `.env.local` as part of any `.next` recovery — only the generated `.next` directory itself is disposable.

## Old routes that intentionally redirect

`/dashboard/team-updates` and `/dashboard/team-time` no longer have their own pages — they 307-redirect (via `next.config.ts`) to `/dashboard/team-activity?view=updates`/`?view=time`. This is intentional bookmark-compatibility, not a bug. Similarly, `/dashboard/planner` redirects to `/dashboard/my-day?view=week` — Planner was absorbed into My Day and is not a separate nav destination; don't reintroduce it as one.

## Project/Service terminology mismatch between UI and internal code

"Service" is the only word that should ever appear in UI copy. The word "Workstream" is correct and expected in code (types, files, routes, table names) — this is not an inconsistency to "fix," it's the deliberate internal/external naming split. See `decisions.md`.

## Role vs. Service/Project membership confusion

"Global Team Lead" (Services Led) and "Works In Services" are org-wide staffing facts about a catalog Service Line. They do **not** automatically grant any permission or membership on a specific Project's Service instance — a Project Service Lead/Team assignment is always a separate, explicit action. See `domain-model.md`'s comparison table before assuming one implies the other.

## Task status spelling inconsistency (intentional, don't "fix" it)

`TaskStatus` uses single-L `canceled`; `ProjectStatus` uses double-L `cancelled` at the type/DB level (UI label is single-L "Canceled" either way). Both are locked/intentional per their own code comments — a well-meaning "consistency fix" would actually be a regression.

## `Project.status === "completed"` — code/comment disagreement

`project-status-badge.tsx`'s own comment says `completed` is "retired as a normal, selectable target" for a Project (the stated intent is that a client relationship becomes Archived, not Completed). As-coded, `project-status-control.tsx`'s `LIFECYCLE_STATUSES` array still includes it and it still renders as a normal dropdown choice. Verify actual current behavior in the live app before writing anything that assumes either description is authoritative — this is a real, unresolved discrepancy, not documentation error on our part.

## `canConfigureWorkstreamActivities`'s doc comment is stale — the RLS gap it describes is already closed

The comment directly above `canConfigureWorkstreamActivities` in `permissions.ts` says the hosted `workstream_activities_write` RLS policy "still technically permits an Employee-as-lead write" underneath the app-layer (Team Lead/Admin-only) gate. **This is no longer true.** Migration `20260910090000_employee_service_activity_authorization_parity.sql` (applied to hosted as part of CD-162) removed the Employee-as-lead clause from that exact RLS policy, plus `create_workstream()` and `create_task()`'s `may_extend_activities` check — all three now agree with the app layer, and no later migration reopens any of them. Verified by reading the full migration chain, not just the comment. See `authorization.md` for detail. The stale comment itself is a small, low-priority cleanup for whoever's next in that file — not a live authorization concern.

## `canAccessCompany`'s mock/app-layer version was missing a hosted-only branch (found during CD-208 QA)

The hosted `can_access_company(target_company_id)` SQL function (`supabase/migrations/20260815110000_company_access_via_project.sql`, Phase 8B) grants Company access via an accessible Project (owner or `project_members`, including a Supervisor's own reports) — not just via an explicit `user_companies` staff-assignment row. The app-layer/mock equivalent (`visibleCompanyIds`/`canAccessCompany` in `permissions.ts`) was **never updated to match** when that hosted migration was written — it only ever checked `assignedCompanyIds`. This stayed invisible for a long time because, before Phase 3 (CD-208), a Team Lead could only become a Project's `ownerId` via an Admin's own choice (a rare, incidental case) — Phase 3 made Team-Lead-owned Projects routine (a Team Lead who creates a Project always becomes its owner), which meant this gap started reliably breaking a real, common flow: a Team-Lead-owned Project's own `useCompany(project.companyId)` call would silently resolve to `null` whenever that Team Lead had no separate staff-assignment to the Company, which in turn hid the Administrative Details card's data and the "Add Template" button (`company && ...` gates) with no error, no console warning, nothing.

**Fixed** (CD-208) by widening `visibleCompanyIds`/`canAccessCompany` to accept the caller's Project data and mirror the hosted SQL's "via Project" branches exactly. Every mock-provider call site (`mock-companies-provider.ts`, `mock-notes-provider.ts`, `mock-workstreams-provider.ts`) now passes a small locally-derived `{companyId, ownerId, memberUserIds}[]` array built from `db.projects`/`db.projectMembers`. The Supabase provider needed no change — hosted RLS was already correct; only the mock/app-layer function was out of parity with it. If you find another "why does this resolve to null for a Team Lead who should have access" bug involving Company data, check this exact class of gap first — mock and hosted authorization logic can silently drift apart when only one side gets updated for a later migration.

## `useProject`/`useWorkstream`-style detail hooks can flash the PREVIOUS entity's data across a client-side route change (found during CD-208 QA)

`useProject(id)` (and the identically-shaped `useWorkstream(id)` — not touched, see below) fetch by `id` inside a `useCallback`/`useEffect` pair keyed on `[user, id]`, and correctly flip `isLoading`/`notFound` synchronously when `id` changes — but previously did **not** clear the actual data state (`project`) itself until the new async fetch resolved. Navigating client-side (no full reload) from one Project straight to another left the *previous* Project's `project` object sitting in state for the window between the route's `id` changing and the new `getProject` call resolving — any UI keyed off `project` (e.g. a role/ownership-gated button) could theoretically render using the OLD Project's data for a frame, even though the URL/breadcrumb already reflected the new one. This surfaced during CD-208 QA as a screenshot that appeared to show a Team Lead's "Add Template" button on a Project they didn't own, immediately after navigating there from one they did.

**Important**: this was never an actual authorization bypass — `apply_project_templates`/`update_project_record` (and the mock equivalents) independently re-validate `can_manage_project`/`canManageProjectRecord` server-side on every call, regardless of what the client's last-rendered UI showed. Worst case was a stale button that would fail on click, never a real unauthorized mutation.

**Fixed** in `useProject` only (the hook implicated in the QA finding, and the one Phase 3 actually added new role-sensitive UI on top of) — `project`/`notFound` now reset to `null`/`false` in a separate effect keyed on `[id]` alone, in the same synchronous batch as `isLoading` flipping to `true`, so no cross-Project value can ever be read during a pending fetch. `useWorkstream` has the identical pattern and was **not** changed — it predates Phase 3, isn't implicated by this QA finding, and fixing it is a separate, narrower follow-up rather than something to fold into this phase's diff. If you're debugging a similar "briefly shows the wrong entity's data after a client-side nav" report elsewhere, check whether the hook in question clears its own data state on key change, not just its loading/not-found flags.

**Follow-up recheck (same day)**: a dedicated browser-driven recheck (mock provider, DOM button-count checks across every step of a Project O → Project N SPA navigation, plus a hard reload) reproduced **zero** "Add Template" flashes at any checkpoint. It also surfaced a structural reason why: this app has **no in-app link anywhere that navigates directly from one Project's page to a different Project's page** — every path between two Project detail pages goes through the Projects list (a separate route/component), so `useProject` always fully unmounts and remounts (state starts fresh at `null`) rather than experiencing an in-place `id` change on an already-mounted instance. A fresh mount can never show stale data, fixed code or not, so this specific click-path was never capable of reproducing the original screenshot — whatever caused it, it likely wasn't this exact flow, and its precise cause remains unknown. The underlying `[id]`-change race the fix addresses is real and correctly fixed for the day this becomes reachable (e.g. a future "related Projects" link, quick-switcher, or similar), it just isn't reachable through any current UI affordance. One residual, purely theoretical nuance: the clearing effect uses `useEffect`, which fires after paint, so if that race ever does become reachable there's a single-paint window before the clear commits (closing it fully would need `useLayoutEffect` for just that effect) — left as `useEffect` deliberately, since introducing `useLayoutEffect` (unused elsewhere in this codebase, and prone to an SSR dev-console warning) to defend a currently-unreachable path isn't a trade worth making; revisit if/when a direct Project-to-Project navigation is ever added. A hard reload on the non-owned Project was also attempted as part of this recheck but is dominated by an unrelated, already-documented mock-provider quirk (no persistence across a full reload, see above) rather than being informative either way.

## Local-only files that must never be committed

`.claude/settings.local.json` and `references/` are standing local-only exclusions for this repo's Claude Code workflow — never stage or commit either, even accidentally via a broad `git add`. Check `git status --short` before any commit.

## Don't casually modify hosted Supabase

Migrations are applied manually, one at a time, with explicit verification (often a rollback-only transaction proof) before trusting a change live — there is no automated safety net (no CI, no staging environment). Treat every hosted-DB write as consequential and irreversible-by-default; confirm before applying, and check migration parity (local list vs. what's actually applied) rather than assuming.

## No AI attribution in commits

If you're an AI/coding agent working on this repo: never add `Co-Authored-By: Claude`, `Co-Authored-By: ChatGPT`, or any other AI attribution trailer to a commit message. See `decisions.md`.
