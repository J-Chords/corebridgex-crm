import type { ClientReport, ClientReportDepartmentSection, ReportRangeLabel, User } from "../types";

export interface GenerateClientReportInput {
  /** The Project this report is scoped to — Company/brand are derived from it server-side, never
   * trusted from the browser. Replaces the pre-9B `companyId` input; see ClientReport.projectId. */
  projectId: string;
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
   * Auto-drafts a new client report for one Project over a date range, from confirmed Daily Updates
   * where available, falling back to raw task/time evidence per person per day where not (see the
   * mock provider for the exact resolution rule). Task/time evidence is gathered by Project (via each
   * Task's own Workstream.projectId), never by Company alone — see ClientReport.projectId. Never
   * mutates an existing report — every generate creates a brand-new row, same "generate never merges
   * into a draft" convention as the internal Accomplishments Report. **Phase 9B**: open to any role
   * with legitimate access to the chosen Project (`canGenerateClientReport`) — Employee may generate
   * a draft for a Project they can access, Supervisor for their own + team scope, Superadmin org-wide.
   */
  generateReport(viewer: User, input: GenerateClientReportInput): Promise<ClientReport>;
  /** Every client report this viewer may view (own + reports' — see canViewClientReport). Excludes trashed. */
  listReports(viewer: User): Promise<ClientReport[]>;
  listTrashedReports(viewer: User): Promise<ClientReport[]>;
  getReport(viewer: User, id: string): Promise<ClientReport | null>;
  /** Replaces the editable department tree wholesale — this is also how "+ Add section" and "+ Add line" persist. Owner-only; rejected once finalized. */
  updateDraft(viewer: User, id: string, departments: ClientReportDepartmentSection[]): Promise<ClientReport>;
  /**
   * Phase 9E — a reporting reviewer's narrower "wording only" edit lane (`canEditClientReportWording`):
   * only ever changes the `details` text of the named line items (matched by `ClientReportLineItem.id`)
   * — Task identity, Service/Activity, work date, Actual Duration, and every total stay untouched,
   * since only the operational source (Tasks/Time Entries) should ever change those. Rejected once
   * finalized, same as `updateDraft`. Deliberately a separate method from `updateDraft` rather than a
   * flag on it, so the two edit contracts (full tree vs. wording-only) can never be confused at a
   * call site.
   */
  updateDraftWording(viewer: User, id: string, edits: { id: string; details: string }[]): Promise<ClientReport>;
  /**
   * Freezes the report — status becomes "finalized", ready to export and send, and permanently
   * immutable (Phase 9B locked rule — a finalized true Client Report can never be reopened, unlike
   * the internal Accomplishments Report). Phase 9E replaced the interim "Supervisor may finalize
   * their team's" rule with a capability-based one: Superadmin always, or anyone with the explicit
   * `reportingReviewAccess` capability, regardless of role — a Supervisor without it can never
   * finalize, not even a direct report's own draft (see `canFinalizeClientReport`/
   * `hasReportingReviewAccess`). Appends a history event.
   */
  finalizeReport(viewer: User, id: string): Promise<ClientReport>;
  /** Internal reviewer feedback — never rendered in the exported document. Supervisor (their reports' reports)/superadmin (any), never the owner. */
  addComment(viewer: User, id: string, body: string): Promise<ClientReport>;
  /**
   * Soft-deletes — works on draft or finalized. Deliberately narrower than view access (Phase 9B
   * hotfix): only the report's own generator, or Superadmin, may trash/restore it — a Supervisor
   * who can view/comment on/finalize a direct report's report does not thereby also gain
   * destructive control over it.
   */
  trashReport(viewer: User, id: string): Promise<ClientReport>;
  restoreReport(viewer: User, id: string): Promise<ClientReport>;
  /** Hard delete. Only valid on an already-trashed report. Superadmin-only, always — never the
   * generator, regardless of role (an administrative retention action, not a personal "undo"). */
  permanentlyDeleteReport(viewer: User, id: string): Promise<void>;
}
