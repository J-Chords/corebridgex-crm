# Current State

**Last verified: 2026-09-16.** This document changes often — re-verify against Jira and `git log`/`gh pr list` before relying on it for anything consequential.

## Current `main`

```
0c077827e453c8e7da44aeffd5cc2e4731952d51
```

Verify freshly with `git rev-parse origin/main`.

## Completed / merged

| Ticket | Summary | PR | Jira status |
|---|---|---|---|
| **CD-162** | Boss Feedback MVP Simplification — Dashboard naming, My Day (Planner merge), Project tab consolidation (9→7 tabs), Service/Task hierarchy UI polish, employee-service-activity authorization parity | [#1](https://github.com/J-Chords/corebridgex-crm/pull/1) — MERGED | `pending deployment` |
| **CD-190** | Merge Team Updates + Team Time into Team Activity, plus a local-calendar-date time-entry stabilization fix | [#2](https://github.com/J-Chords/corebridgex-crm/pull/2) — MERGED | `pending deployment` |

Both are merged into `main` and validated (TypeScript/ESLint/all four provider builds/role-based QA all passed at merge time). Neither has been deployed anywhere — see `deployment.md`.

## Open / future work

| Ticket | Summary | Status |
|---|---|---|
| **CD-193** | Normalize local-date handling across task and dashboard date surfaces — the remaining UTC-slice anti-pattern instances not covered by CD-190's narrower fix (due-date/overdue classification, various default-date fields, dashboard/My Day date displays) | `New` — not started, not assigned a branch |
| **CD-196** | Clarify Dashboard and My Day information architecture — role-scoped overview (Dashboard) vs. personal execution (My Day), Notifications/Needs Attention/Upcoming placement cleanup, Admin personal-default schedule fix, Team Lead mobile Dashboard overflow fix, Dashboard KPI drill-down made read-only/navigation-oriented | `Code review` — branch `feature/CD-196-dashboard-myday-information-architecture`, implemented and validated (TypeScript/ESLint/all 4 provider builds/isolated-mock role QA all passed across all 9 role×surface combinations at 400px), PR opened against `main`, not yet merged — see the repo's PR list for the exact number |

## Deployment

**Frontend hosting is not configured.** No GitHub Actions, no GitHub Deployments/Environments, no hosting-provider config files, zero evidence of any deploy ever having occurred. See `deployment.md` for the full audit.

**Hosted Supabase** is real and live — the database backend has been used and migrated against directly throughout this project's history. The current `main` is database-compatible: CD-190 introduced zero migrations, and CD-162's migrations are confirmed applied to hosted (including two whose own file headers say "not yet applied" — that text is stale; see `data-and-supabase.md`).

## Jira workflow states seen on this project

`New → Groomed → Ready to start → In Progress → Code review → End to end testing → pending deployment → Ready for demo → Sign-off` (plus a parallel `Blocked` state). Both CD-162 and CD-190 currently sit at `pending deployment` — they are merged and validated, awaiting an actual hosting decision before progressing further. See `HANDOVER.md` for the Git/Jira workflow this project follows end-to-end.

## Immediate next milestone

A hosting decision for the frontend application, then a first real deployment, then production verification (per `deployment.md`'s smoke test), then — only after that — Jira progression past `pending deployment`.
