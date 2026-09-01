import type {
  DocumentsProvider,
  DocumentFilters,
  UpdateDocumentInput,
  UploadDocumentInput,
} from "../documents-provider";
import type { Document, DocumentCategory, DocumentUploadState } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Phase 14B — the only place `supabase.storage` is ever called (Phase 14A Part 21 — no UI component
 * imports the raw Storage client directly). `uploadDocument` orchestrates the full reserve -> browser
 * upload -> finalize lifecycle behind one call:
 *
 *   1. `reserve_document_upload` (RPC) — derives/validates project_id server-side, validates
 *      extension/MIME/size, validates category (rejected outright for a Task-scoped upload), writes
 *      the initial display_name/description/category as part of THIS SAME insert (Phase 14B
 *      hotfix — no longer a separate post-finalize step), generates the immutable storage_path,
 *      inserts a `pending` row.
 *   2. The browser's own authenticated upload straight to the private `documents` bucket, gated by
 *      the Storage INSERT policy (only the caller's own just-reserved path, re-checked against
 *      `can_manage_document_row` at upload time, not merely at reservation time). No service-role
 *      key anywhere in this file.
 *   3. `finalize_document_upload` (RPC) — confirms the object exists, flips `pending` -> `ready`.
 *      This is the LAST step — a successful finalize means the complete initial Document is ready;
 *      no metadata mutation is required afterward for a normal upload to be considered successful.
 *
 * Reserve/upload/finalize are three separate systems (Postgres RPC, the Storage API, another
 * Postgres RPC) — never one transaction. Failure at step 2 or 3 triggers best-effort cleanup (remove
 * the Storage object if it exists, cancel the reservation, in that order — the Storage DELETE policy
 * requires the matching pending row to still exist, so the object must be removed BEFORE
 * `cancel_document_upload` deletes that row); neither cleanup call is retried automatically, so a
 * failure there can honestly leave an orphaned pending row/object — a known, documented residual gap
 * in Phase 14B (see docs/phase-14a-documents-architecture-audit.md, Part B7), not silently claimed
 * to be impossible.
 */

const BUCKET = "documents";
const SIGNED_URL_EXPIRY_SECONDS = 300;

interface DocumentRow {
  id: string;
  project_id: string;
  task_id: string | null;
  uploaded_by: string;
  original_filename: string;
  display_name: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  category: DocumentCategory | null;
  upload_state: DocumentUploadState;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    uploadedById: row.uploaded_by,
    originalFilename: row.original_filename,
    displayName: row.display_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    description: row.description,
    category: row.category,
    uploadState: row.upload_state,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeForOrFilter(value: string): string {
  // supabase-js's PostgREST `.or()` filter string splits on "," — a search term containing one
  // would otherwise be misparsed as a second condition.
  return value.replace(/,/g, "");
}

export const supabaseDocumentsProvider: DocumentsProvider = {
  async listProjectDocuments(_viewer, projectId, filters?: DocumentFilters) {
    const supabase = createClient();
    let query = supabase
      .from("documents")
      .select("*")
      .eq("project_id", projectId)
      .eq("upload_state", "ready")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (filters?.category) query = query.eq("category", filters.category);
    if (filters?.search) {
      const term = `%${escapeForOrFilter(filters.search)}%`;
      query = query.or(`original_filename.ilike.${term},display_name.ilike.${term},description.ilike.${term}`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(toDocument);
  },

  async listTaskAttachments(_viewer, taskId) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("task_id", taskId)
      .eq("upload_state", "ready")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toDocument);
  },

  async getDocumentDownloadUrl(_viewer, documentId) {
    const supabase = createClient();
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", documentId)
      .single();
    if (fetchError || !doc) throw new Error("Document not found.");

    // The normal authenticated client (the caller's own JWT) is sufficient here — Storage signed-URL
    // minting still respects the storage.objects SELECT policy, so this can never mint a URL for an
    // object the caller isn't authorized to read (Phase 14A Correction 8). No service-role bypass.
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, SIGNED_URL_EXPIRY_SECONDS);
    if (error || !data) throw new Error(error?.message ?? "Could not create a download link.");
    return data.signedUrl;
  },

  async uploadDocument(_viewer, input: UploadDocumentInput) {
    const supabase = createClient();
    const { file, projectId, taskId, displayName, description, category } = input;
    if ((projectId == null) === (taskId == null)) {
      throw new Error("Provide exactly one of projectId or taskId.");
    }

    // Phase 14B hotfix — initial metadata travels with the reservation itself now, not a separate
    // post-finalize step (see this file's own header comment for why that mattered).
    const { data: reserved, error: reserveError } = await supabase.rpc("reserve_document_upload", {
      p_project_id: projectId ?? null,
      p_task_id: taskId ?? null,
      p_original_filename: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_display_name: displayName ?? null,
      p_description: description ?? null,
      p_category: taskId ? null : (category ?? null),
    });
    if (reserveError || !reserved || reserved.length === 0) {
      throw new Error(reserveError?.message ?? "Could not reserve this upload.");
    }
    const documentId: string = reserved[0].document_id;
    const storagePath: string = reserved[0].storage_path;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      await supabase.rpc("cancel_document_upload", { p_document_id: documentId }).then(
        () => {},
        () => {}
      );
      throw new Error(uploadError.message);
    }

    const { error: finalizeError } = await supabase.rpc("finalize_document_upload", {
      p_document_id: documentId,
    });
    if (finalizeError) {
      // Order matters: the Storage DELETE policy requires the matching pending row to still exist,
      // so the object is removed FIRST, then the reservation row — never the other way around.
      await supabase.storage.from(BUCKET).remove([storagePath]).then(
        () => {},
        () => {}
      );
      await supabase.rpc("cancel_document_upload", { p_document_id: documentId }).then(
        () => {},
        () => {}
      );
      throw new Error(finalizeError.message);
    }

    const { data: finalRow, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (fetchError || !finalRow) throw new Error("Upload finished but the document could not be reloaded.");
    return toDocument(finalRow);
  },

  async updateDocumentMetadata(_viewer, documentId, input: UpdateDocumentInput) {
    const supabase = createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (fetchError || !existing) throw new Error("Document not found.");

    const { error } = await supabase.rpc("update_document_metadata", {
      p_document_id: documentId,
      p_display_name: input.displayName !== undefined ? input.displayName : existing.display_name,
      p_description: input.description !== undefined ? input.description : existing.description,
      p_category: input.category !== undefined ? input.category : existing.category,
    });
    if (error) throw new Error(error.message);

    const { data: updated, error: refetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (refetchError || !updated) throw new Error("Document updated but could not be reloaded.");
    return toDocument(updated);
  },

  async deleteDocument(_viewer, documentId) {
    const supabase = createClient();
    const { error } = await supabase.rpc("soft_delete_document", { p_document_id: documentId });
    if (error) throw new Error(error.message);
  },

  async restoreDocument(_viewer, documentId) {
    const supabase = createClient();
    const { error } = await supabase.rpc("restore_document", { p_document_id: documentId });
    if (error) throw new Error(error.message);

    const { data: updated, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (fetchError || !updated) throw new Error("Document restored but could not be reloaded.");
    return toDocument(updated);
  },
};
