# Testing / QA Strategy

There is no automated test suite (no Jest/Vitest/Playwright dependency in `package.json`). Validation is a combination of static checks and manual/agent-driven role-based QA.

## Automated validation (every change)

1. `npx tsc --noEmit` — 0 errors required.
2. `npm run lint` (ESLint) — 0 errors required. Pre-existing accepted warnings (currently 2, both `react-hooks/exhaustive-deps` in unrelated dialog components) are allowed to persist; don't chase them down as part of an unrelated change.
3. `git diff --check` — no whitespace/conflict-marker errors.
4. All four provider builds (`npm run build` under each `NEXT_PUBLIC_DATA_PROVIDER` value) — all must pass. See `development.md` for the exact commands.

## Manual / role-based QA

Corebridge X has three roles with materially different views of the same data (see `authorization.md`). A change touching any shared surface should be checked from at least:

- **Admin** — org-wide visibility, all management actions available.
- **Team Lead** — scoped to self + direct reports; confirm no data from outside that scope leaks in.
- **Employee** — most management surfaces blocked entirely; confirm blocked surfaces stay blocked (both nav-hidden and direct-URL-blocked).

Also check:
- **Mobile** (~400px width) — no horizontal overflow, sensible stacking.
- **Browser console** — zero errors/warnings introduced.

## Mock-provider QA technique (used throughout this project's history)

Mock data is **in-memory and resets on a full page reload** (see `architecture.md`). This has two practical consequences for QA:

1. **Build all test state in one continuous browser session.** If you need "one person Submitted, one Draft, one with logged time," create that state via real UI flows (open My Day, submit an update, log time) in a single session — a hard navigation or dev-server restart loses it. Never edit mock arrays/seed files directly to fake a QA scenario; that doesn't exercise the real code path.
2. **Isolating a QA run from a live dev server**: this repo's dev server usually runs against the real `supabase` provider (per `.env.local`), and this Next.js version won't allow a second `next dev` in the same project directory. The established pattern: copy the working tree to an isolated directory (same drive — a different drive letter has caused a libuv crash in practice), junction/symlink `node_modules` rather than reinstalling, run `NEXT_PUBLIC_DATA_PROVIDER=mock npm run dev -- -p <free-port> --webpack` from the copy (Turbopack has been observed to refuse to follow a `node_modules` junction — fall back to `--webpack` if you hit that), do the QA, then delete the copy and kill that dev server. This leaves the real dev server and `.env.local` untouched throughout.

Browser automation for this kind of QA (Playwright or similar) is a **technique**, not a project dependency — it is not installed in `package.json`; when used, it's installed ad hoc into an isolated/scratch location for the duration of the QA pass, never added to the repo's own dependencies.

## Deterministic timezone QA (CD-193)

For a change to local-calendar-date logic specifically (not just "verify it looks right once"), two complementary techniques were established during CD-193's normalization pass — prefer both over a single real-time spot-check:

1. **Deterministic unit-level QA, multiple real timezones, one process per zone.** Node's `Date`/`Intl` read the OS/process `TZ` environment variable once at startup; it cannot be changed reliably mid-process. The reliable technique (already used for CD-190's own timezone regression) is a small "runner" script that `spawnSync`s itself once per required zone with `TZ` set in that child's own `env`, each child asserting against fixed, hardcoded instants (e.g. `2026-10-12T00:30:00.000Z`, deliberately chosen to fall on different local calendar dates depending on zone) rather than the real "now" — real "now" only tells you today's zone-vs-UTC relationship, not whether the logic is correct in general. Cover at least one UTC-negative zone (`America/Los_Angeles`) and one strongly UTC-positive zone (`Pacific/Kiritimati`, UTC+14), plus a DST-transition day in a DST-observing zone (`America/New_York`) if the helper under test does its own day-boundary arithmetic (`localDayBoundsUtc`) — assert the transition day is 23h or 25h, never a hardcoded 24h.
2. **Deterministic browser QA via Playwright's `clock` API.** Playwright 1.45+ exposes `page.clock.setFixedTime(date)`, which freezes the browser's own `Date.now()`/`new Date()` to an exact instant — call it immediately after `browser.newContext()` (before any navigation), combined with that context's own `timezoneId` option. This lets two browser contexts load the *same* pinned instant under two different `timezoneId`s and observe the *same* underlying data (e.g. the same Task `dueDate`) produce genuinely different, both-correct classifications (Due Today in one zone, not-yet-due in the other) — a far stronger proof than checking real "now" once in whatever zone the test machine happens to be in. Still follow this project's own pure-client-side-mock-state discipline throughout (SPA Link/button clicks only once state exists that must survive — see below; a pinned clock does not change that constraint).

## What "done" looks like for a UI-touching change

1. Automated validation (above) passes.
2. Role-based QA passes for every role that can reach the changed surface.
3. Zero new console errors.
4. If the change touches date/time handling, explicitly verify behavior in a positive-UTC-offset timezone — see `troubleshooting.md`.
