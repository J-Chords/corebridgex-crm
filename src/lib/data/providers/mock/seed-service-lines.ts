import type { ServiceLine } from "../../types";

/**
 * Reconciled to a clean, extensible set — structured so more can be added later without disturbing
 * these. Bookkeeping merged into Accounting (a subset of the same service); Digital Marketing and IT
 * Support merged into one new "IT/Digital" line; Tax Advisory and Human Resources renamed to their
 * shorter forms. Consulting stays its own line rather than being folded into "IT/Digital" — EdgeNovelty's
 * real "Consulting 2026" workstream doesn't read as IT work, so a forced merge would be a worse fit
 * than one extra line.
 */
export const seedServiceLines: ServiceLine[] = [
  { id: "svc-accounting", name: "Accounting" },
  { id: "svc-payroll", name: "Payroll" },
  { id: "svc-hr", name: "HR" },
  { id: "svc-tax", name: "Tax" },
  { id: "svc-compliance", name: "Compliance" },
  { id: "svc-file-management", name: "File Management" },
  { id: "svc-it-digital", name: "IT/Digital" },
  { id: "svc-consulting", name: "Consulting" },
];
