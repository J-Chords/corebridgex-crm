import type { ClientReport, ClientReportDepartmentSection, ReportRangeLabel, User } from "../types";

export interface GenerateClientReportInput {
  companyId: string;
  rangeLabel: ReportRangeLabel;
  rangeStart: string;
  rangeEnd: string;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement. A deliberate sibling of
 * AccomplishmentsReportProvider, not an extension of it — see ClientReport's own doc comment for why.
 * Every method takes the requesting `viewer` and enforces `canViewClientReport` itself, so an employee
 * (or an unrelated supervisor) can never reach a client report through any provider method.
 */
export interface ClientReportProvider {
  /**
   * Auto-drafts a new client report for one company over a date range, from confirmed Daily Updates
   * where available, falling back to raw task/time evidence per person per day where not (see the
   * mock provider for the exact resolution rule). Never mutates an existing report — every generate
   * creates a brand-new row, same "generate never merges into a draft" convention as the internal
   * Accomplishments Report. Supervisor/superadmin only.
   */
  generateReport(viewer: User, input: GenerateClientReportInput): Promise<ClientReport>;
  /** Every client report this viewer may view (own + reports' — see canViewClientReport). Excludes trashed. */
  listReports(viewer: User): Promise<ClientReport[]>;
  listTrashedReports(viewer: User): Promise<ClientReport[]>;
  getReport(viewer: User, id: string): Promise<ClientReport | null>;
  /** Replaces the editable department tree wholesale — this is also how "+ Add section" and "+ Add line" persist. Owner-only; rejected once finalized. */
  updateDraft(viewer: User, id: string, departments: ClientReportDepartmentSection[]): Promise<ClientReport>;
  /** Freezes the report — status becomes "finalized", ready to export and send. Owner-only. Appends a history event. */
  finalizeReport(viewer: User, id: string): Promise<ClientReport>;
  /** Unfreezes a finalized report back to "draft" so the *same* report can be corrected and re-finalized. Owner-only. Appends a history event. */
  reopenReport(viewer: User, id: string): Promise<ClientReport>;
  /** Internal reviewer feedback — never rendered in the exported document. Supervisor (their reports' reports)/superadmin (any), never the owner. */
  addComment(viewer: User, id: string, body: string): Promise<ClientReport>;
  /** Soft-deletes — works on draft or finalized. Anyone with view access, not just the owner. */
  trashReport(viewer: User, id: string): Promise<ClientReport>;
  restoreReport(viewer: User, id: string): Promise<ClientReport>;
  /** Hard delete. Only valid on an already-trashed report. */
  permanentlyDeleteReport(viewer: User, id: string): Promise<void>;
}
