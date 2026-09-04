import type {
  DocumentsProvider,
  DocumentFilters,
  UpdateDocumentInput,
  UploadDocumentInput,
} from "../documents-provider";
import type { Document } from "../../types";
import {
  canAccessDocumentRecord,
  canAccessProject,
  canAccessTask,
  canAccessTaskDirectly,
  canManageDocument,
} from "../../permissions";
import { db } from "./mock-db";

/** Mirrors the hosted `reserve_document_upload`'s locked extension<->MIME allowlist exactly
 * (Phase 14A Part 12 / Correction 7) — kept in sync deliberately, not derived from one shared file,
 * since the mock and the SQL migration are two independent implementations of the same rule (the
 * same relationship every other mock/RLS pair in this codebase already has). */
const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

/** Direct-authority hotfix — mirrors `mock-tasks-provider.ts`'s own `hierarchyAssigneeIds` exactly
 * (Phase 10's one-hop parent/child Subtask visibility): the parent's assignees (when `task` is a
 * Subtask) plus every direct child's assignees (when `task` is a parent). Needed here too, so a
 * Task-linked Document's VIEW gate (`canAccessTask`) correctly grants hierarchy-only readers the
 * same read visibility their Task already has elsewhere — this context object is also passed to
 * `canAccessTaskDirectly` for the mutation gate, which simply ignores the extra field (that
 * function's own signature has no hierarchy branch at all, by design). */
function hierarchyAssigneeIds(taskId: string): string[] {
  const ids: string[] = [];
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return ids;
  if (task.parentTaskId) ids.push(...taskAssigneeIds(task.parentTaskId));
  for (const child of db.tasks.filter((t) => t.parentTaskId === taskId)) {
    ids.push(...taskAssigneeIds(child.id));
  }
  return ids;
}

function taskContext(taskId: string) {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  return {
    assigneeIds: taskAssigneeIds(taskId),
    companyId: task.companyId,
    hierarchyAssigneeIds: hierarchyAssigneeIds(taskId),
  };
}

function projectContext(projectId: string) {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const memberUserIds = db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
  return { companyId: project.companyId, ownerId: project.ownerId, memberUserIds };
}

/** Shapes a raw `Document` row into the pre-shaped context `canAccessDocumentRecord`/
 * `canManageDocument` need — mirrors exactly how `task-actions-menu.tsx` shapes `taskForAuth` for
 * the equivalent Task permission calls. */
function documentContext(doc: Document) {
  return {
    uploadedById: doc.uploadedById,
    taskId: doc.taskId,
    task: doc.taskId ? (taskContext(doc.taskId) ?? undefined) : undefined,
    project: doc.taskId ? undefined : (projectContext(doc.projectId) ?? undefined),
  };
}

function extensionOf(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

function deriveTaskProjectId(taskId: string): string | null {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const workstream = db.workstreams.find((w) => w.id === task.workstreamId);
  return workstream?.projectId ?? null;
}

function sortNewestFirst(docs: Document[]): Document[] {
  return [...docs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Ready + active only — the one condition every normal read path shares (Phase 14A Correction 9). */
function isNormallyVisible(doc: Document): boolean {
  return doc.uploadState === "ready" && doc.deletedAt === null;
}

export const mockDocumentsProvider: DocumentsProvider = {
  async listProjectDocuments(viewer, projectId, filters: DocumentFilters = {}) {
    let rows: Document[];
    if (filters.trashed) {
      // Part 14 — Trash view, scoped to whoever could restore it (mirrors the hosted
      // `documents_select_trash` RLS policy — `can_manage_document_row`, not the read gate).
      rows = db.documents.filter(
        (d) => d.projectId === projectId && d.uploadState === "ready" && d.deletedAt !== null
      );
      rows = rows.filter((d) => canManageDocument(viewer, documentContext(d), db.users));
    } else {
      rows = db.documents.filter((d) => d.projectId === projectId && isNormallyVisible(d));
      // Re-evaluated per row, exactly like the hosted `can_access_document` policy would be for every
      // row a real SELECT returns — a Task-linked row never gets a free pass just because it's being
      // browsed from the Project-level list (Phase 14A Part 9's "Task-linked visibility leak" rule).
      rows = rows.filter((d) => canAccessDocumentRecord(viewer, documentContext(d), db.users));
    }
    if (filters.category) rows = rows.filter((d) => d.category === filters.category);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(
        (d) =>
          d.originalFilename.toLowerCase().includes(q) ||
          (d.displayName ?? "").toLowerCase().includes(q) ||
          (d.description ?? "").toLowerCase().includes(q)
      );
    }
    return sortNewestFirst(rows);
  },

  async listTaskAttachments(viewer, taskId) {
    const task = taskContext(taskId);
    if (!task || !canAccessTask(viewer, task, db.users)) return [];
    return sortNewestFirst(db.documents.filter((d) => d.taskId === taskId && isNormallyVisible(d)));
  },

  async getDocumentDownloadUrl(viewer, documentId) {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc || !isNormallyVisible(doc) || !canAccessDocumentRecord(viewer, documentContext(doc), db.users)) {
      throw new Error("Document not found.");
    }
    // Mock mode never calls real Storage — a fixed placeholder stands in for a signed URL
    // (Phase 14A Part 22). No UI consumes this yet in Phase 14B.
    return `mock://documents/${doc.storagePath}`;
  },

  async uploadDocument(viewer, input: UploadDocumentInput) {
    const { file, projectId, taskId, displayName, description, category } = input;
    if ((projectId == null) === (taskId == null)) {
      throw new Error("Provide exactly one of projectId or taskId.");
    }

    // Category is organization metadata only, never security context — but it must still be
    // rejected explicitly for a Task-scoped upload (never silently discarded), matching the hosted
    // reserve_document_upload's own Phase 14B hotfix behavior at the same public contract boundary.
    if (taskId && category != null) {
      throw new Error("Category only applies to Project-level documents, not Task attachments.");
    }

    let derivedProjectId: string;
    if (taskId) {
      const task = taskContext(taskId);
      // Direct-authority hotfix (Defect A) — uploading is a mutation/side effect on the Task, not a
      // read, so it requires canAccessTaskDirectly, never the broader hierarchy-visibility
      // canAccessTask (mirrors the hosted reserve_document_upload's own correction exactly).
      if (!task || !canAccessTaskDirectly(viewer, task, db.users)) {
        throw new Error("You don't have access to this task.");
      }
      const derived = deriveTaskProjectId(taskId);
      if (!derived) throw new Error("Task not found or has no linked project.");
      derivedProjectId = derived;
    } else {
      const project = projectContext(projectId!);
      if (!project || !canAccessProject(viewer, project, db.users)) {
        throw new Error("You don't have access to this project.");
      }
      derivedProjectId = projectId!;
    }

    const extension = extensionOf(file.name);
    const expectedMime = extension ? ALLOWED_EXTENSIONS[extension] : undefined;
    if (!extension || !expectedMime) {
      throw new Error("File type not allowed.");
    }
    if (file.type !== expectedMime) {
      throw new Error("Declared file type does not match its extension.");
    }
    if (file.size <= 0 || file.size > MAX_SIZE_BYTES) {
      throw new Error("File size must be between 1 byte and 25MB.");
    }

    const id = crypto.randomUUID();
    const storagePath = `projects/${derivedProjectId}/${id}.${extension}`;
    const now = new Date().toISOString();
    // Simulates the reserve -> browser upload -> finalize lifecycle without a real Storage round
    // trip — a brief artificial delay stands in for upload time (Phase 14A Part 22).
    await new Promise((resolve) => setTimeout(resolve, 150));

    const doc: Document = {
      id,
      projectId: derivedProjectId,
      taskId: taskId ?? null,
      uploadedById: viewer.id,
      originalFilename: file.name,
      displayName: displayName ?? null,
      storagePath,
      mimeType: file.type,
      sizeBytes: file.size,
      description: description ?? null,
      category: taskId ? null : (category ?? null),
      uploadState: "ready",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.documents = [...db.documents, doc];
    return doc;
  },

  async updateDocumentMetadata(viewer, documentId, input: UpdateDocumentInput) {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc || !isNormallyVisible(doc)) throw new Error("Document not found.");
    if (!canManageDocument(viewer, documentContext(doc), db.users)) {
      throw new Error("You don't have permission to edit this document.");
    }
    if (input.category !== undefined && input.category !== null && doc.taskId) {
      throw new Error("Category only applies to Project-level documents, not Task attachments.");
    }
    const updated: Document = {
      ...doc,
      displayName: input.displayName !== undefined ? input.displayName : doc.displayName,
      description: input.description !== undefined ? input.description : doc.description,
      category: input.category !== undefined ? input.category : doc.category,
      updatedAt: new Date().toISOString(),
    };
    db.documents = db.documents.map((d) => (d.id === documentId ? updated : d));
    return updated;
  },

  async deleteDocument(viewer, documentId) {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc || !isNormallyVisible(doc)) throw new Error("Document not found.");
    if (!canManageDocument(viewer, documentContext(doc), db.users)) {
      throw new Error("You don't have permission to delete this document.");
    }
    const now = new Date().toISOString();
    // Soft delete only — never touches the (in mock mode, nonexistent) Storage object
    // (Phase 14A Correction 4).
    db.documents = db.documents.map((d) => (d.id === documentId ? { ...d, deletedAt: now, updatedAt: now } : d));
  },

  async restoreDocument(viewer, documentId) {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc || doc.deletedAt === null) throw new Error("Document not found in Trash.");
    if (!canManageDocument(viewer, documentContext(doc), db.users)) {
      throw new Error("You don't have permission to restore this document.");
    }
    const now = new Date().toISOString();
    const updated: Document = { ...doc, deletedAt: null, updatedAt: now };
    db.documents = db.documents.map((d) => (d.id === documentId ? updated : d));
    return updated;
  },
};
