import { INTERNAL_COMPANY_ID, INTERNAL_PROJECT_ID } from "../../constants";

/**
 * Deterministic Project id for a Company — kept as a tiny standalone helper (rather than importing
 * `seedProjects` directly) so `seed-workstreams.ts` and `seed-projects.ts` can each depend on this
 * one rule without a circular import between the two seed files (seed-projects.ts already reads
 * seed-workstreams.ts for owner resolution).
 */
export function projectIdForCompany(companyId: string): string {
  return companyId === INTERNAL_COMPANY_ID ? INTERNAL_PROJECT_ID : `project-${companyId}`;
}
