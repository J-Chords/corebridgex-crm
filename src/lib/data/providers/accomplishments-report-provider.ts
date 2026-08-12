import type { AccomplishmentsReport, AccomplishmentsReportBrandSection, ReportKind, ReportRangeLabel, User } from "../types";

export interface GenerateReportInput {
  kind: ReportKind;
  /**
   * companyId when kind === "client". Ignored when kind === "person" — the provider always
   * forces the report's subject to the requesting viewer; a person report is always your own.
   */
  subjectId: string;
  rangeLabel: ReportRangeLabel;
  /** ISO date, inclusive. */
  rangeStart: string;
  /** ISO date, inclusive. */
  rangeEnd: string;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement. Every method takes the
 * requesting `viewer` and enforces `canViewAccomplishmentsReport` (src/lib/data/permissions.ts)
 * itself, so an employee can never reach another person's report through any provider method —
 * `updateDraft`/`finalizeReport` additionally require `canEditAccomplishmentsReportEntries`
 * (owner-only), and `addComment` requires `canCommentOnAccomplishmentsReport` (supervisor/superadmin, non-owner).
 */
export interface AccomplishmentsReportProvider {
  /** Computes a fresh auto-drafted report and persists it with status "draft". Never mutates an existing report. */
  generateReport(viewer: User, input: GenerateReportInput): Promise<AccomplishmentsReport>;
  /** Every report this viewer may view — employees: their own only; supervisors: own + team; superadmin: all. Excludes trashed. */
  listReports(viewer: User): Promise<AccomplishmentsReport[]>;
  /** Reports this viewer has trashed access to, most-recently-trashed first. */
  listTrashedReports(viewer: User): Promise<AccomplishmentsReport[]>;
  getReport(viewer: User, id: string): Promise<AccomplishmentsReport | null>;
  /** Replaces the editable tree (ticks/details) on a draft report. Owner-only; rejected once finalized. */
  updateDraft(viewer: User, id: string, brandSections: AccomplishmentsReportBrandSection[]): Promise<AccomplishmentsReport>;
  /** Freezes a draft — status becomes "finalized", finalizedAt set, no further edits accepted. Owner-only. Appends a history event. */
  finalizeReport(viewer: User, id: string): Promise<AccomplishmentsReport>;
  /** Unfreezes a finalized report back to "draft" so the *same* report can be corrected and re-finalized. Owner-only, regardless of role. Appends a history event. */
  reopenReport(viewer: User, id: string): Promise<AccomplishmentsReport>;
  /** Appends a reviewer comment and notifies the report's owner. Supervisor (team)/superadmin (any) only, never the owner. */
  addComment(viewer: User, id: string, body: string): Promise<AccomplishmentsReport>;
  /** Soft-deletes — works on draft or finalized. Anyone with view access, not just the owner. */
  trashReport(viewer: User, id: string): Promise<AccomplishmentsReport>;
  /** Un-trashes. No-op if not currently trashed. */
  restoreReport(viewer: User, id: string): Promise<AccomplishmentsReport>;
  /** Hard delete. Only valid on an already-trashed report. */
  permanentlyDeleteReport(viewer: User, id: string): Promise<void>;
}
