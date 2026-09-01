/**
 * Phase 14B — supersedes the old, pre-Phase-8 `Document` stub (companyId/taskId/noteId shape,
 * never wired to any provider/table/UI — confirmed dead in `docs/phase-14a-documents-architecture-
 * audit.md`, Part 1/B11). One model for both Project Documents and Task Attachments — a Task
 * Attachment is simply a Document with `taskId` set (see the Phase 14A architecture lock).
 */
export type DocumentUploadState = "pending" | "ready";

export type DocumentCategory =
  | "engagement_letter"
  | "working_paper"
  | "client_provided"
  | "deliverable"
  | "compliance"
  | "other";

export interface Document {
  id: string;
  /** Mandatory, immutable — set once at reservation. */
  projectId: string;
  /** Optional, immutable after creation (Phase 14A Correction 3 — no "change context" in v1). */
  taskId: string | null;
  uploadedById: string;
  /** As the browser reported it — never used to build the Storage path (Correction 6). */
  originalFilename: string;
  /** Optional user-facing rename — falls back to `originalFilename` for display. Renaming never
   * moves the Storage object. */
  displayName: string | null;
  /** Server-generated, immutable: `projects/{projectId}/{id}.{safeExtension}`. */
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  /** Only meaningful when `taskId` is null — a Task-linked Document derives its context from the
   * Task itself instead. */
  category: DocumentCategory | null;
  /** `pending` until the Storage upload is confirmed (`finalize_document_upload`) — invisible to
   * every normal list/count/download path until then. */
  uploadState: DocumentUploadState;
  /** Soft delete / Trash — non-null means Trash. No automatic purge in Phase 14B (Correction 4). */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
