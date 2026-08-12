import type { TemplateChecklistItem } from "../../types";

export const seedTemplateChecklistItems: TemplateChecklistItem[] = [
  // Collect employee payroll data
  { id: "tci-payroll-1-1", templateTaskId: "tt-payroll-1", description: "Gather employee list and pay rates", position: 0 },
  { id: "tci-payroll-1-2", templateTaskId: "tt-payroll-1", description: "Collect completed tax withholding forms (W-4/state)", position: 1 },
  { id: "tci-payroll-1-3", templateTaskId: "tt-payroll-1", description: "Confirm pay frequency and pay dates", position: 2 },

  // Set up payroll system access
  { id: "tci-payroll-2-1", templateTaskId: "tt-payroll-2", description: "Create company profile in payroll system", position: 0 },
  { id: "tci-payroll-2-2", templateTaskId: "tt-payroll-2", description: "Add direct deposit bank account", position: 1 },
  { id: "tci-payroll-2-3", templateTaskId: "tt-payroll-2", description: "Configure pay schedule and deductions", position: 2 },

  // Review and approve first payroll run
  { id: "tci-payroll-3-1", templateTaskId: "tt-payroll-3", description: "Verify gross pay and deduction calculations", position: 0 },
  { id: "tci-payroll-3-2", templateTaskId: "tt-payroll-3", description: "Verify tax withholding amounts", position: 1 },
  { id: "tci-payroll-3-3", templateTaskId: "tt-payroll-3", description: "Get client sign-off before submitting", position: 2 },

  // Gather quarterly financial statements
  { id: "tci-tax-1-1", templateTaskId: "tt-tax-1", description: "Collect profit & loss statement", position: 0 },
  { id: "tci-tax-1-2", templateTaskId: "tt-tax-1", description: "Collect balance sheet", position: 1 },
  { id: "tci-tax-1-3", templateTaskId: "tt-tax-1", description: "Reconcile bank and credit card accounts", position: 2 },

  // Prepare quarterly tax filing
  { id: "tci-tax-2-1", templateTaskId: "tt-tax-2", description: "Calculate estimated tax liability", position: 0 },
  { id: "tci-tax-2-2", templateTaskId: "tt-tax-2", description: "Complete filing forms", position: 1 },
  { id: "tci-tax-2-3", templateTaskId: "tt-tax-2", description: "Prepare supporting schedules", position: 2 },

  // Review and file with tax authority
  { id: "tci-tax-3-1", templateTaskId: "tt-tax-3", description: "Review filing for accuracy", position: 0 },
  { id: "tci-tax-3-2", templateTaskId: "tt-tax-3", description: "Obtain client approval", position: 1 },
  { id: "tci-tax-3-3", templateTaskId: "tt-tax-3", description: "Submit filing", position: 2 },
  { id: "tci-tax-3-4", templateTaskId: "tt-tax-3", description: "Confirm receipt with tax authority", position: 3 },

  // Reconcile bank and credit card accounts
  { id: "tci-bk-1-1", templateTaskId: "tt-bk-1", description: "Import bank and card transactions", position: 0 },
  { id: "tci-bk-1-2", templateTaskId: "tt-bk-1", description: "Match transactions to the ledger", position: 1 },
  { id: "tci-bk-1-3", templateTaskId: "tt-bk-1", description: "Flag and research discrepancies", position: 2 },

  // Categorize and code transactions
  { id: "tci-bk-2-1", templateTaskId: "tt-bk-2", description: "Review uncategorized transactions", position: 0 },
  { id: "tci-bk-2-2", templateTaskId: "tt-bk-2", description: "Apply correct chart-of-accounts codes", position: 1 },

  // Prepare monthly financial summary
  { id: "tci-bk-3-1", templateTaskId: "tt-bk-3", description: "Generate profit & loss statement", position: 0 },
  { id: "tci-bk-3-2", templateTaskId: "tt-bk-3", description: "Generate balance sheet", position: 1 },
  { id: "tci-bk-3-3", templateTaskId: "tt-bk-3", description: "Send summary to client", position: 2 },
];
