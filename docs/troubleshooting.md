# Troubleshooting / Gotchas

Verified issues encountered during this project's development. Only entries confirmed against actual code/behavior are listed here.

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

## Local-only files that must never be committed

`.claude/settings.local.json` and `references/` are standing local-only exclusions for this repo's Claude Code workflow — never stage or commit either, even accidentally via a broad `git add`. Check `git status --short` before any commit.

## Don't casually modify hosted Supabase

Migrations are applied manually, one at a time, with explicit verification (often a rollback-only transaction proof) before trusting a change live — there is no automated safety net (no CI, no staging environment). Treat every hosted-DB write as consequential and irreversible-by-default; confirm before applying, and check migration parity (local list vs. what's actually applied) rather than assuming.

## No AI attribution in commits

If you're an AI/coding agent working on this repo: never add `Co-Authored-By: Claude`, `Co-Authored-By: ChatGPT`, or any other AI attribution trailer to a commit message. See `decisions.md`.
