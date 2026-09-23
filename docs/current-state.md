# Current State

**Last verified: 2026-09-23.** This document changes often — re-verify against Jira and `git log`/`gh pr list` before relying on it for anything consequential.

## Current `main`

```
726c0f98dd346a5ce427a297a1bb2e455bd3f0dd
```

Verify freshly with `git rev-parse origin/main`.

## Completed / merged

| Ticket | Summary | PR | Jira status |
|---|---|---|---|
| **CD-162** | Boss Feedback MVP Simplification — Dashboard naming, My Day (Planner merge), Project tab consolidation (9→7 tabs), Service/Task hierarchy UI polish, employee-service-activity authorization parity | [#1](https://github.com/J-Chords/corebridgex-crm/pull/1) — MERGED | `pending deployment` |
| **CD-190** | Merge Team Updates + Team Time into Team Activity, plus a local-calendar-date time-entry stabilization fix | [#2](https://github.com/J-Chords/corebridgex-crm/pull/2) — MERGED | `pending deployment` |
| **CD-196** | Clarify Dashboard and My Day information architecture — role-scoped overview (Dashboard) vs. personal execution (My Day), Notifications/Needs Attention/Upcoming placement cleanup, Admin personal-default schedule fix, Team Lead mobile Dashboard overflow fix, Dashboard KPI drill-down made read-only/navigation-oriented, Services-inspired Notifications redesign, notification safe-routing fix | [#4](https://github.com/J-Chords/corebridgex-crm/pull/4) — MERGED (merge commit `fa65e33`) | `pending deployment` |
| **CD-205** | Retire the legacy "Project Template" bundle architecture — `project_templates`/`project_template_services`/`project_template_activities`, their RPCs/triggers/RLS/grants, and dead provider/hook/type source removed at both the schema and source level; hosted Supabase migration `20260921090000_retire_project_template_bundle.sql` applied and independently re-verified live (tables/functions/triggers confirmed absent; `admin_delete_activity`/`create_project`/`create_client_project` confirmed repaired/compatible via direct live function-body inspection). The separate, still-live Service-recipe system (`templates`/`template_tasks`/`template_checklist_items`, `apply_template`, Company-detail "Apply template") is explicitly preserved, unchanged — confirmed present on hosted. No operational Project/Workstream/Activity/Task/Checklist data removed (live row counts verified). | [#5](https://github.com/J-Chords/corebridgex-crm/pull/5) — MERGED (merge commit `83bff9c`) | `pending deployment` |
| **CD-206** | Phase 1 Template workspace and terminology — visible product term for the Service catalog becomes "Template" (Admin nav + new `/dashboard/admin/templates` list/detail routes, Project-facing "Templates" tab with the "Global Service Staffing" display block removed, Task List column changes — Assignee column removed, Start Date added — staffing-terminology relabel, Activity catalog "Suggested Tasks"→"Tasks"). `service_lines`/`workstreams` persistence and all authorization/RLS/RPCs are unchanged — visible-terminology and UX only, no migration needed. The separate, still-live Service-recipe system (Company-detail "Apply template" and the Accomplishments Report's own unrelated "Add service" Activity-picker) is explicitly preserved. Product Owner Try-It-Yourself review approved. See `decisions.md`'s "Phase 1 — Template workspace and terminology" entry for the full scope. | [#7](https://github.com/J-Chords/corebridgex-crm/pull/7) — MERGED (merge commit `ab9aa8f`) | `pending deployment` |

All five are merged into `main` and validated (TypeScript/ESLint/all four provider builds/role-based or isolated QA all passed at merge time). None have been deployed anywhere — see `deployment.md`.

## Product Owner-approved, being checkpointed for merge

| Ticket | Summary | Branch | Jira status |
|---|---|---|---|
| **CD-207** | Phase 2 Project Overview redesign + KPI navigation — one shared Overview structure for every role; locked 5-tile KPI row (Templates/Open Tasks/Attention/Due/Members), each tile real and clickable; Attention = deduplicated overdue-or-Waiting Tasks (Blocked excluded from this one KPI only, untouched everywhere else); Due gets a Today/Week/Month period selector reusing `planner-dates.ts`; the former separately-gated "Project Details"/"Administrative Details" cards consolidated into one `AdministrativeDetailsCard` with zero field loss (read-gate widened to all roles, edit affordances stay Admin-only); a real, audit-confirmed Project tab/URL desync bug (5 call sites bypassing `handleTabChange`) fixed as a consequence of the redesign; Projects list page rows converted to real `<Link>` navigation matching the Templates tab's `ServiceRow` pattern. See `decisions.md`'s "Phase 2 — Project Overview redesign + KPI navigation" entry for full scope, including the AttentionPanel/ServicesSummaryPanel/TeamPanel removal decision. Blocked→Waiting retirement is explicitly out of scope and remains Phase 5 — Blocked exists globally, unchanged. | `feature/CD-207-project-overview-redesign` (based on `main` at `726c0f9`) | `In Progress` |

**Product Owner manual review: approved (2026-09-23).** TypeScript/ESLint/`git diff --check` all pass; all 4 provider builds (mock/supabase-auth/supabase-core/supabase) built cleanly in an isolated copy; isolated interactive QA (Admin/Team Lead/Employee, responsive) passed. This checkpoint commits the approved implementation for PR/merge — see the top of this document once the PR merges for the resulting `main` HEAD.

## Open / future work

| Ticket | Summary | Status |
|---|---|---|
| **CD-193** | Normalize local-date handling across task and dashboard date surfaces — the remaining UTC-slice anti-pattern instances not covered by CD-190's narrower fix (due-date/overdue classification, various default-date fields, dashboard/My Day date displays) | `New` — not started, not assigned a branch |

## Deployment

**Frontend hosting is not configured.** No GitHub Actions, no GitHub Deployments/Environments, no hosting-provider config files, zero evidence of any deploy ever having occurred. See `deployment.md` for the full audit.

**Hosted Supabase** is real and live — the database backend has been used and migrated against directly throughout this project's history. The current `main` is database-compatible: CD-190 introduced zero migrations, and CD-162's migrations are confirmed applied to hosted (including two whose own file headers say "not yet applied" — that text is stale; see `data-and-supabase.md`).

## Jira workflow states seen on this project

`New → Groomed → Ready to start → In Progress → Code review → End to end testing → pending deployment → Ready for demo → Sign-off` (plus a parallel `Blocked` state). CD-162, CD-190, CD-196, CD-205, and CD-206 currently sit at `pending deployment` — they are merged and validated, awaiting an actual hosting decision before progressing further. CD-207 sits at `In Progress` — implemented, validated, and Product Owner-approved; moving to `Code review` once the implementation PR is opened. See `HANDOVER.md` for the Git/Jira workflow this project follows end-to-end.

## Immediate next milestone

A hosting decision for the frontend application, then a first real deployment, then production verification (per `deployment.md`'s smoke test), then — only after that — Jira progression past `pending deployment`.
