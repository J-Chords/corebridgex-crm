import type { Document, DocumentCategory, User } from "../types";

/**
 * Phase 14B — Storage + Metadata Security Foundation. Contract every provider (mock, Supabase)
 * implements; no UI consumes this yet (14C/14D build the Project Documents tab and Task Attachments
 * section against this exact interface — see `docs/phase-14a-documents-architecture-audit.md`).
 *
 * `uploadDocument` orchestrates the full reserve -> browser upload -> finalize lifecycle behind one
 * call (see the Supabase implementation's own doc comment for the exact steps and failure handling)
 * — callers never see `reserve_document_upload`/`finalize_document_upload`/`cancel_document_upload`
 * individually. Raw Storage client calls never leak past `supabase-documents-provider.ts`.
 *
 * Phase 14B hotfix — initial metadata (`displayName`/`description`/`category`) is written as part of
 * the reservation itself, not as a separate step after finalize: a successful `finalize` is the only
 * remaining requirement for a normal upload to be considered complete, so there is no window where
 * finalize succeeds but a required metadata write can still fail.
 */
export interface DocumentsProvider {
  /** All ready, active Documents for a Project — includes every Task Attachment inside it (a Task
   * Attachment IS a Project Document with `taskId` set, never a duplicate row). */
  listProjectDocuments(viewer: User, projectId: string, filters?: DocumentFilters): Promise<Document[]>;
  /** The subset scoped to one Task — ready, active only. */
  listTaskAttachments(viewer: User, taskId: string): Promise<Document[]>;
  /** Mints a fresh, short-lived (300s) signed URL for Preview/Download — never persisted, never
   * requested for a whole list up front. */
  getDocumentDownloadUrl(viewer: User, documentId: string): Promise<string>;
  uploadDocument(viewer: User, input: UploadDocumentInput): Promise<Document>;
  /** `displayName`/`description` only — every other field is immutable (Phase 14A Correction 3/6). */
  updateDocumentMetadata(viewer: User, documentId: string, input: UpdateDocumentInput): Promise<Document>;
  /** Soft delete only — never touches the Storage object (Phase 14A Correction 4). */
  deleteDocument(viewer: User, documentId: string): Promise<void>;
  /** Clears `deletedAt` — same manage-authorization as edit/delete. */
  restoreDocument(viewer: User, documentId: string): Promise<Document>;
}

export interface DocumentFilters {
  search?: string;
  category?: DocumentCategory;
  /** Part 14 — Trash view. False/omitted (default): the normal ready+active list. True: ready,
   * soft-deleted Documents only, scoped to whoever could restore them (mirrors the hosted
   * `documents_select_trash` RLS policy — `can_manage_document_row`, not the broader read gate). */
  trashed?: boolean;
}

export interface UploadDocumentInput {
  /** The browser's own `File` — the mock provider reads only `name`/`type`/`size` from it and
   * never persists real bytes (Phase 14A Part 22). */
  file: File;
  /** Exactly one of `projectId`/`taskId` must be set — a Task-scoped upload derives its Project
   * server-side from the Task itself, never trusting a caller-supplied `projectId` alongside it
   * (Phase 14A Correction 2). */
  projectId?: string;
  taskId?: string;
  displayName?: string;
  description?: string;
  category?: DocumentCategory;
}

export interface UpdateDocumentInput {
  displayName?: string | null;
  description?: string | null;
  /** Only meaningful for a Project-level Document (`taskId` null) — rejected for a Task Attachment. */
  category?: DocumentCategory | null;
}
