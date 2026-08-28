/**
 * Phase 13B — deterministic Company/Project identity color assignment. Exactly 3 dedicated
 * identity tokens exist (`--identity-1/2/3`, `src/app/globals.css`) — never a status-semantic
 * color (destructive/warning/success/info). Keyed by `companyId`, NOT Project id/name, so every
 * related yearly Project under the same Company (e.g. "Alderleaf 2025"/"2026"/"2027") always
 * resolves to the identical color, and renaming a Project never changes it (only changing which
 * Company it belongs to would — which never happens for an existing Project).
 */

import { INTERNAL_COMPANY_ID, INTERNAL_PROJECT_ID } from "@/lib/data/constants";

const IDENTITY_TOKENS = [
  { background: "var(--identity-1)", foreground: "var(--identity-1-foreground)" },
  { background: "var(--identity-2)", foreground: "var(--identity-2-foreground)" },
  { background: "var(--identity-3)", foreground: "var(--identity-3-foreground)" },
] as const;

/** Plain string hash (djb2-style) — stable across sessions/renders, no external dependency. */
function stableHash(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33 + value.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

export function identityColorForCompany(companyId: string): { background: string; foreground: string } {
  const index = stableHash(companyId) % IDENTITY_TOKENS.length;
  return IDENTITY_TOKENS[index];
}

/**
 * Best-effort "is this Task's Company/Project the permanently-seeded Internal/Non-billable one"
 * check for surfaces that only have a `TaskWithRelations` in hand (no already-fetched
 * `ProjectWithRelations.isInternal`, the one fully reliable signal — see its own doc comment).
 * `INTERNAL_COMPANY_ID`/`INTERNAL_PROJECT_ID` are fixed literal ids the mock fixtures are seeded
 * with; the real hosted Supabase project generates its own random ids for the same rows, so this
 * check is reliable in mock data and a no-op (never a false positive, just a missed negative) in
 * every Supabase-backed provider mode. Prefer passing a real `isInternal` through as a prop
 * wherever one is already in scope (e.g. a Project-scoped page already holds
 * `ProjectWithRelations.isInternal`) — this is the documented fallback for surfaces that don't.
 */
export function isLikelyInternalTask(task: { company: { id: string }; workstream: { projectId: string | null } }): boolean {
  return task.company.id === INTERNAL_COMPANY_ID || task.workstream.projectId === INTERNAL_PROJECT_ID;
}
