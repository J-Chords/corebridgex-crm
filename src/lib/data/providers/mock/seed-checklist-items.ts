import type { ChecklistItem } from "../../types";

export const seedChecklistItems: ChecklistItem[] = [
  // task-1 — Reconcile Q2 books (2/3 done)
  { id: "ci-1-1", taskId: "task-1", description: "Pull Q2 bank statements", isDone: true, position: 0, completedById: "user-employee-1", completedAt: "2026-07-18T10:00:00.000Z" },
  { id: "ci-1-2", taskId: "task-1", description: "Match transactions to ledger", isDone: true, position: 1, completedById: "user-employee-1", completedAt: "2026-07-20T14:00:00.000Z" },
  { id: "ci-1-3", taskId: "task-1", description: "Flag discrepancies for review", isDone: false, position: 2, completedById: null, completedAt: null },

  // task-2 — Send monthly financial summary (0/2)
  { id: "ci-2-1", taskId: "task-2", description: "Draft summary from latest figures", isDone: false, position: 0, completedById: null, completedAt: null },
  { id: "ci-2-2", taskId: "task-2", description: "Get sign-off before sending", isDone: false, position: 1, completedById: null, completedAt: null },

  // task-3 — Social campaign creative review (3/4)
  { id: "ci-3-1", taskId: "task-3", description: "Collect creative drafts", isDone: true, position: 0, completedById: "user-employee-1", completedAt: "2026-07-06T09:00:00.000Z" },
  { id: "ci-3-2", taskId: "task-3", description: "Internal review pass", isDone: true, position: 1, completedById: "user-employee-1", completedAt: "2026-07-09T09:00:00.000Z" },
  { id: "ci-3-3", taskId: "task-3", description: "Send to client for approval", isDone: true, position: 2, completedById: "user-employee-1", completedAt: "2026-07-16T11:30:00.000Z" },
  { id: "ci-3-4", taskId: "task-3", description: "Incorporate client feedback", isDone: false, position: 3, completedById: null, completedAt: null },

  // task-4 — Payroll run (5/5, done)
  { id: "ci-4-1", taskId: "task-4", description: "Verify hours for all employees", isDone: true, position: 0, completedById: "user-employee-2", completedAt: "2026-07-15T09:00:00.000Z" },
  { id: "ci-4-2", taskId: "task-4", description: "Apply approved rate changes", isDone: true, position: 1, completedById: "user-employee-2", completedAt: "2026-07-16T09:00:00.000Z" },
  { id: "ci-4-3", taskId: "task-4", description: "Run payroll batch", isDone: true, position: 2, completedById: "user-employee-2", completedAt: "2026-07-17T10:00:00.000Z" },
  { id: "ci-4-4", taskId: "task-4", description: "Reconcile payroll ledger", isDone: true, position: 3, completedById: "user-employee-2", completedAt: "2026-07-17T14:00:00.000Z" },
  { id: "ci-4-5", taskId: "task-4", description: "Send confirmation to client", isDone: true, position: 4, completedById: "user-employee-2", completedAt: "2026-07-17T16:00:00.000Z" },

  // task-5 — Vendor bookkeeping cleanup (1/3)
  { id: "ci-5-1", taskId: "task-5", description: "List duplicate vendor entries", isDone: true, position: 0, completedById: "user-employee-2", completedAt: "2026-07-14T09:00:00.000Z" },
  { id: "ci-5-2", taskId: "task-5", description: "Confirm merges with finance lead", isDone: false, position: 1, completedById: null, completedAt: null },
  { id: "ci-5-3", taskId: "task-5", description: "Apply merges in the ledger", isDone: false, position: 2, completedById: null, completedAt: null },

  // task-6 — Prepare workstream proposal (1/2)
  { id: "ci-6-1", taskId: "task-6", description: "Draft scope of work", isDone: true, position: 0, completedById: "user-employee-2", completedAt: "2026-07-22T09:00:00.000Z" },
  { id: "ci-6-2", taskId: "task-6", description: "Add pricing tiers", isDone: false, position: 1, completedById: null, completedAt: null },

  // task-7 — Q3 campaign asset delivery (0/3)
  { id: "ci-7-1", taskId: "task-7", description: "Finalize asset list", isDone: false, position: 0, completedById: null, completedAt: null },
  { id: "ci-7-2", taskId: "task-7", description: "Export final files", isDone: false, position: 1, completedById: null, completedAt: null },
  { id: "ci-7-3", taskId: "task-7", description: "Upload to shared drive", isDone: false, position: 2, completedById: null, completedAt: null },

  // task-8 — Brand guideline refresh (2/4)
  { id: "ci-8-1", taskId: "task-8", description: "Update color palette", isDone: true, position: 0, completedById: "user-employee-3", completedAt: "2026-07-12T09:00:00.000Z" },
  { id: "ci-8-2", taskId: "task-8", description: "Update logo lockups", isDone: true, position: 1, completedById: "user-employee-3", completedAt: "2026-07-19T09:00:00.000Z" },
  { id: "ci-8-3", taskId: "task-8", description: "Update typography section", isDone: false, position: 2, completedById: null, completedAt: null },
  { id: "ci-8-4", taskId: "task-8", description: "Circulate for sign-off", isDone: false, position: 3, completedById: null, completedAt: null },

  // task-9 — Reactivation outreach call (0/1)
  { id: "ci-9-1", taskId: "task-9", description: "Call primary contact", isDone: false, position: 0, completedById: null, completedAt: null },

  // task-10 — Contract renewal review (0/3)
  { id: "ci-10-1", taskId: "task-10", description: "Pull current contract terms", isDone: false, position: 0, completedById: null, completedAt: null },
  { id: "ci-10-2", taskId: "task-10", description: "Note proposed changes", isDone: false, position: 1, completedById: null, completedAt: null },
  { id: "ci-10-3", taskId: "task-10", description: "Schedule review call", isDone: false, position: 2, completedById: null, completedAt: null },

  // task-11 — Zoning consult prep (1/2)
  { id: "ci-11-1", taskId: "task-11", description: "Gather zoning documents", isDone: true, position: 0, completedById: "user-employee-4", completedAt: "2026-07-21T09:00:00.000Z" },
  { id: "ci-11-2", taskId: "task-11", description: "Draft briefing memo", isDone: false, position: 1, completedById: null, completedAt: null },

  // task-12 — Payroll compliance audit (3/3, done)
  { id: "ci-12-1", taskId: "task-12", description: "Sample Q2 payroll records", isDone: true, position: 0, completedById: "user-employee-4", completedAt: "2026-07-12T09:00:00.000Z" },
  { id: "ci-12-2", taskId: "task-12", description: "Cross-check tax withholding", isDone: true, position: 1, completedById: "user-employee-4", completedAt: "2026-07-13T09:00:00.000Z" },
  { id: "ci-12-3", taskId: "task-12", description: "File audit summary", isDone: true, position: 2, completedById: "user-employee-4", completedAt: "2026-07-14T09:00:00.000Z" },

  // task-13 — Update onboarding checklist template (1/3)
  { id: "ci-13-1", taskId: "task-13", description: "Add updated benefits section", isDone: true, position: 0, completedById: "user-supervisor-1", completedAt: "2026-07-20T09:00:00.000Z" },
  { id: "ci-13-2", taskId: "task-13", description: "Update IT setup steps", isDone: false, position: 1, completedById: null, completedAt: null },
  { id: "ci-13-3", taskId: "task-13", description: "Review with HR", isDone: false, position: 2, completedById: null, completedAt: null },

  // task-14 — Q3 all-hands prep (0/2)
  { id: "ci-14-1", taskId: "task-14", description: "Draft agenda", isDone: false, position: 0, completedById: null, completedAt: null },
  { id: "ci-14-2", taskId: "task-14", description: "Build slide deck", isDone: false, position: 1, completedById: null, completedAt: null },

  // task-15 — Final close-out billing (2/2, done)
  { id: "ci-15-1", taskId: "task-15", description: "Reconcile final hours billed", isDone: true, position: 0, completedById: "user-superadmin-1", completedAt: "2026-06-18T09:00:00.000Z" },
  { id: "ci-15-2", taskId: "task-15", description: "Send final invoice", isDone: true, position: 1, completedById: "user-superadmin-1", completedAt: "2026-06-19T09:00:00.000Z" },

  // task-16 — Initial discovery call (0/1)
  { id: "ci-16-1", taskId: "task-16", description: "Schedule call with Bea Holloway", isDone: false, position: 0, completedById: null, completedAt: null },

  // task-17 — Reconcile Q1 books (3/3, done) — reuse-from-past demo data
  { id: "ci-17-1", taskId: "task-17", description: "Pull Q1 bank statements", isDone: true, position: 0, completedById: "user-employee-1", completedAt: "2026-04-10T10:00:00.000Z" },
  { id: "ci-17-2", taskId: "task-17", description: "Match transactions to ledger", isDone: true, position: 1, completedById: "user-employee-1", completedAt: "2026-04-12T14:00:00.000Z" },
  { id: "ci-17-3", taskId: "task-17", description: "Flag discrepancies for review", isDone: true, position: 2, completedById: "user-employee-1", completedAt: "2026-04-15T16:00:00.000Z" },

  // task-18 — Reconcile FY2025 year-end books (4/4, done) — reuse-from-past demo data
  { id: "ci-18-1", taskId: "task-18", description: "Pull FY2025 bank statements", isDone: true, position: 0, completedById: "user-employee-1", completedAt: "2026-01-10T09:00:00.000Z" },
  { id: "ci-18-2", taskId: "task-18", description: "Match transactions to ledger", isDone: true, position: 1, completedById: "user-employee-1", completedAt: "2026-01-14T09:00:00.000Z" },
  { id: "ci-18-3", taskId: "task-18", description: "Reconcile against audit trial balance", isDone: true, position: 2, completedById: "user-employee-1", completedAt: "2026-01-18T09:00:00.000Z" },
  { id: "ci-18-4", taskId: "task-18", description: "File year-end reconciliation summary", isDone: true, position: 3, completedById: "user-employee-1", completedAt: "2026-01-20T15:00:00.000Z" },

  // task-19 — Q3 payroll variance review (0/2) — Client Health demo data
  { id: "ci-19-1", taskId: "task-19", description: "Pull Q3 variance report", isDone: true, position: 0, completedById: "user-employee-4", completedAt: "2026-07-28T10:00:00.000Z" },
  { id: "ci-19-2", taskId: "task-19", description: "Flag anomalies to payroll lead", isDone: false, position: 1, completedById: null, completedAt: null },

  // task-20 — Zoning appeal follow-up (0/1) — Client Health demo data
  { id: "ci-20-1", taskId: "task-20", description: "Call the zoning office for a status update", isDone: false, position: 0, completedById: null, completedAt: null },
];
