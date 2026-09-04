import type { ServiceLine } from "../../types";

/**
 * Reconciled to a clean, extensible set — structured so more can be added later without disturbing
 * these. Bookkeeping merged into Accounting (a subset of the same service); Digital Marketing and IT
 * Support merged into one new "IT/Digital" line; Tax Advisory and Human Resources renamed to their
 * shorter forms. Consulting stays its own line rather than being folded into "IT/Digital" — EdgeNovelty's
 * real "Consulting 2026" workstream doesn't read as IT work, so a forced merge would be a worse fit
 * than one extra line.
 */
const SEED_TIMESTAMP = "2026-08-13T00:00:00.000Z";

/** Legacy seed rows predate the Admin Service catalog (Service Level Phase B) — createdById stays
 * null (a truthful "creator not recorded" state, never fabricated) rather than pointing at an
 * arbitrary user. A newly Admin-created Service always gets a real createdById. */
function legacyServiceLine(id: string, name: string): ServiceLine {
  return {
    id,
    name,
    description: null,
    isActive: true,
    createdById: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

export const seedServiceLines: ServiceLine[] = [
  legacyServiceLine("svc-accounting", "Accounting"),
  legacyServiceLine("svc-payroll", "Payroll"),
  legacyServiceLine("svc-hr", "HR"),
  legacyServiceLine("svc-tax", "Tax"),
  legacyServiceLine("svc-compliance", "Compliance"),
  legacyServiceLine("svc-file-management", "File Management"),
  legacyServiceLine("svc-it-digital", "IT/Digital"),
  legacyServiceLine("svc-consulting", "Consulting"),
];
