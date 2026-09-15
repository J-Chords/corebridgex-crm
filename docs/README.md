# Corebridge X — Documentation

**Start here.** This is the canonical entry point for the `docs/` directory.

Corebridge X is an internal Project Management / PSA (Professional Services Automation) web app for Croki Digital, built on Next.js 16 (App Router) + React 19 + TypeScript, backed by Supabase (Postgres + Auth). It tracks client work through the hierarchy **Project → Service → Activity → Task → Checklist**, with role-based visibility for Admin / Team Lead / Employee.

## Read in this order

1. **[current-state.md](current-state.md)** — what's merged, what's in-flight, what's deployed. Check this first; it changes often.
2. **[domain-model.md](domain-model.md)** — the product hierarchy, terminology, Task/Project lifecycle, Team Activity.
3. **[authorization.md](authorization.md)** — the three roles and every permission rule that gates them.
4. **[architecture.md](architecture.md)** — codebase layout, data-provider architecture, routes.
5. **[data-and-supabase.md](data-and-supabase.md)** — the database, migrations, RLS patterns.
6. **[development.md](development.md)** — get it running locally.
7. **[testing.md](testing.md)** — how changes are validated.
8. **[deployment.md](deployment.md)** — current deployment state (frontend hosting is **not yet configured** — read this before assuming anything is live).
9. **[decisions.md](decisions.md)** — the "why," for decisions a new contributor would otherwise have to reverse-engineer.
10. **[troubleshooting.md](troubleshooting.md)** — verified gotchas, so you don't rediscover them the hard way.
11. **[HANDOVER.md](HANDOVER.md)** — the single document written to let a new engineer (or a new AI session with zero prior context) pick up the project cold. If you only read one file, read this one.

## If you are a new developer or a new AI session

Go straight to **[HANDOVER.md](HANDOVER.md)**. It has a "start here" checklist and, at its end, a copy-pasteable context block for starting a fresh AI/chat session.

## About the older documents in this directory

Before this consolidation, `docs/` accumulated a long series of point-in-time development-phase documents (some over 400KB). They were audited, not deleted — they remain valuable historical record and are not rewritten here. **They are not reliable as current-state references**; several describe features that have since been merged, renamed, or retired (e.g. a separate "Team Updates"/"Team Time" nav, a standalone "Planner" nav item, Project tabs that have since been consolidated, or a Subtask concept that has been fully removed). Treat anything below as historical unless cross-checked against the numbered docs above:

| File | What it covers | Status |
|---|---|---|
| `current-project-state.md` | The prior living append-log — richest single historical source | Historical; superseded by this `docs/` set. Does not yet reflect CD-190 (Team Activity). |
| `product-brief.md` | Early product/RBAC decisions | Historical; stops mid-project (before the real Supabase backend, the Project module, and everything after) |
| `admin-foundation-user-service-architecture.md` | Admin Foundation module (users, global Service staffing, RLS deactivation hardening) | Historical, largely still accurate — mined into `authorization.md` |
| `project-level-product-architecture.md` | The Project module's original design | Historical — its Project-tab list predates the current 7-tab consolidation |
| `phase-12-task-redesign-baseline.md` | Pre-redesign Task system snapshot | Historical — references Subtasks and Planner, both retired |
| `phase-12b-task-redesign-spec.md` | Task UI redesign (rail+nav sidebar, List/Board) | Historical — nav description predates Team Activity and Planner's retirement |
| `phase-13-client-history-audit.md` | Client History surface audit | Historical — self-documents its own IA recommendation as rejected |
| `phase-13b-project-workspace-history-spec.md` | Project workspace redesign (5-tab IA + History tab) | Historical — superseded by the current 7-tab IA |
| `phase-13c-13e-project-history-intelligence-spec.md` | Task delete RPC, Project Time/Timeline | Historical — the `delete_task` security design it documents is still live; IA claims are stale |
| `phase-14a-documents-architecture-audit.md` | Documents/Storage architecture (locked) | Historical — the Storage/security design is still live; Documents is no longer a standalone tab |
| `phase-14b-documents-security-foundation-spec.md` | Documents security implementation | Historical — same caveat as 14a |
| `route-map.md` | Old route table | Superseded — see `architecture.md`'s route table for the current one |

## Documentation conventions

- **Environment variable VALUES are never committed to this repo or this documentation** — only variable names. See `.env.example`.
- Claims here are cross-checked against current source as of the date in `current-state.md`. When something can't be verified from the repo, it's marked **UNKNOWN** rather than guessed.
- No AI/assistant attribution appears in this repo's Git history. See `decisions.md`.
