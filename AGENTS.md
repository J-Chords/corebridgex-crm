<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working on Corebridge X

- **Read `docs/README.md` first**, then whichever linked doc matches the task (`docs/domain-model.md` and `docs/authorization.md` before touching product logic or permissions; `docs/current-state.md` before starting any ticket, since it changes often).
- Follow the locked domain terminology and hierarchy in `docs/domain-model.md` — "Service" is the only visible term ("Workstream" stays internal-only); there is no Subtask level; do not reintroduce either.
- Preserve the authorization boundaries in `docs/authorization.md` (`src/lib/data/permissions.ts` is the source of truth) — especially that global Service staffing never implies Project-level authority.
- Audit before adding; reuse before creating. This applies to code and to documentation — don't duplicate what already exists in `docs/`, update it instead.
- Never write a "what calendar day is this" check with raw `.toISOString().slice(0, 10)` — use `src/lib/planner-dates.ts`. See `docs/troubleshooting.md`.
- Do not casually modify migrations or RLS policies against hosted Supabase — see `docs/data-and-supabase.md` for the verification discipline this project follows (parity checks, rollback-only proofs before trusting a change live).
- **No AI/assistant attribution in Git commits** — never `Co-Authored-By: Claude`, `Co-Authored-By: ChatGPT`, or similar. Human authorship only.
- Update `docs/` (especially `docs/current-state.md` and `docs/decisions.md`) when you make an architectural decision or complete a milestone that changes what a future session needs to know — don't let the documentation drift the way the pre-consolidation docs did.
