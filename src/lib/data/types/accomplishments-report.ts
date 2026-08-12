export type ReportKind = "person" | "client";
export type ReportRangeLabel = "today" | "this-week" | "custom";
export type ReportStatus = "draft" | "finalized";

/** One checklist row — either a real catalog Activity, or a brand's "Other (untagged)" catch-all. */
export interface AccomplishmentsReportActivityLine {
  /** Null only for a brand section's untagged catch-all line. */
  activityId: string | null;
  /** Snapshotted at generation time — a later catalog rename never rewrites a past report. */
  activityName: string;
  /** Auto-ticked when matching work was found; freely tickable/untickable afterward. */
  done: boolean;
  /** Editable free text, pre-filled by the auto-draft from task titles/notes/time-entry descriptions. */
  detail: string;
  /** Provenance only (not rendered) — which tasks fed this line's auto-draft. */
  sourceTaskIds: string[];
  /** Distinct client company name(s) behind this line's matched work — empty string if none. Only shown on person reports; a client report is already scoped to one client. */
  companyLabel: string;
}

export interface AccomplishmentsReportDepartment {
  departmentId: string;
  departmentName: string;
  /** Only activities with real evidence, plus any added by hand via "+ Add service" — not the department's full catalog. */
  activities: AccomplishmentsReportActivityLine[];
}

export interface AccomplishmentsReportBrandSection {
  brandId: string;
  brandName: string;
  /** Only departments with at least one such activity — a department with nothing in it isn't included at all. */
  departments: AccomplishmentsReportDepartment[];
  /** Untagged work under this brand — a sibling to the departments, not nested in one. */
  other: AccomplishmentsReportActivityLine;
  /** Whether `other` should render at all — true when auto-detected (`other.done`) or manually added via "+ Add service > Other". */
  otherIncluded: boolean;
}

/**
 * A reviewer's note on someone else's report — append-only, same shape/philosophy as task/company
 * Notes. Written only by a supervisor/superadmin reviewing someone else's report; the owner can
 * always read their own report's comments, but never writes one (there's no one to review).
 */
export interface AccomplishmentsReportComment {
  id: string;
  authorId: string;
  /** Snapshotted display name. */
  authorName: string;
  body: string;
  createdAt: string;
}

/** "re-finalized" is used for every finalize after the first — decided at write time, not derived at render time. */
export type ReportHistoryEventType = "finalized" | "reopened" | "re-finalized";

/** One entry in a report's integrity log — plain event log, no version-diffing. */
export interface AccomplishmentsReportHistoryEvent {
  id: string;
  type: ReportHistoryEventType;
  actorId: string;
  /** Snapshotted display name. */
  actorName: string;
  createdAt: string;
}

/**
 * A stored snapshot document, not a live query. Auto-drafted on generate, freely editable by its
 * owner while `status === "draft"`. Finalizing locks entries — but only the owner can Reopen it
 * back to draft to correct and re-finalize the *same* report (never a duplicate for the same
 * subject/period); every finalize/reopen is appended to `history`, so any post-finalize change is
 * visible and attributed. `deletedAt` is a soft-delete: trashed reports are hidden from the main
 * list but stay restorable (mock only — the automatic 30-day purge is a real-backend job, not
 * implemented here; see product-brief.md).
 */
export interface AccomplishmentsReport {
  id: string;
  kind: ReportKind;
  /** userId when kind === "person", companyId when kind === "client". */
  subjectId: string;
  /** Snapshotted display name (person full name or company name). */
  subjectLabel: string;
  rangeLabel: ReportRangeLabel;
  /** ISO date, inclusive. */
  rangeStart: string;
  /** ISO date, inclusive. */
  rangeEnd: string;
  status: ReportStatus;
  brandSections: AccomplishmentsReportBrandSection[];
  comments: AccomplishmentsReportComment[];
  /** Finalize/reopen/re-finalize events, oldest first. Empty for a report that's never been finalized. */
  history: AccomplishmentsReportHistoryEvent[];
  generatedById: string;
  /** Snapshotted display name. */
  generatedByName: string;
  generatedAt: string;
  /** Timestamp of the *most recent* finalization — null while draft (including after a reopen). */
  finalizedAt: string | null;
  /** Null unless trashed — soft-delete timestamp. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
