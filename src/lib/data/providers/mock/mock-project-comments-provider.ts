import type { ProjectCommentsProvider, ProjectCommentTarget } from "../projects-provider";
import type { ProjectComment, User } from "../../types";
import {
  canAccessDocumentRecord,
  canAccessProject,
  canAccessTask,
  canDeleteProjectComment,
  canEditProjectComment,
} from "../../permissions";
import { db } from "./mock-db";

function memberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

function taskContext(taskId: string) {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  return { assigneeIds: taskAssigneeIds(taskId), companyId: task.companyId };
}

function projectContext(projectId: string) {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return null;
  return { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: memberUserIds(projectId) };
}

function documentContext(documentId: string) {
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return null;
  return {
    uploadedById: doc.uploadedById,
    taskId: doc.taskId,
    task: doc.taskId ? (taskContext(doc.taskId) ?? undefined) : undefined,
    project: doc.taskId ? undefined : (projectContext(doc.projectId) ?? undefined),
  };
}

/** Mirrors the hosted enforce_project_comment_target trigger + target-aware RLS exactly: a Task
 * comment requires real Task access, a Document comment requires real Document access, a root
 * comment requires Project access — access to the parent Project never leaks a Task/Document
 * comment the viewer can't legitimately see the target of. */
function requireTargetAccess(viewer: User, target: ProjectCommentTarget) {
  if (target.taskId) {
    const ctx = taskContext(target.taskId);
    if (!ctx || !canAccessTask(viewer, ctx, db.users)) throw new Error("You don't have access to this task.");
    return;
  }
  if (target.documentId) {
    const ctx = documentContext(target.documentId);
    if (!ctx || !canAccessDocumentRecord(viewer, ctx, db.users)) throw new Error("You don't have access to this document.");
    return;
  }
  const ctx = projectContext(target.projectId);
  if (!ctx || !canAccessProject(viewer, ctx, db.users)) throw new Error("You don't have access to this project.");
}

function toRow(comment: ProjectComment): ProjectComment {
  const author = db.users.find((u) => u.id === comment.authorId);
  return { ...comment, authorName: author?.fullName ?? "Unknown" };
}

export const mockProjectCommentsProvider: ProjectCommentsProvider = {
  async listComments(viewer, target) {
    requireTargetAccess(viewer, target);
    return db.projectComments
      .filter(
        (c) =>
          c.projectId === target.projectId &&
          (c.taskId ?? null) === (target.taskId ?? null) &&
          (c.documentId ?? null) === (target.documentId ?? null)
      )
      .map(toRow)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async createComment(viewer, target, body, parentCommentId) {
    if (target.taskId && target.documentId) {
      throw new Error("A comment may target at most one of Task/Document.");
    }
    requireTargetAccess(viewer, target);
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment can't be empty.");
    if (parentCommentId) {
      const parent = db.projectComments.find((c) => c.id === parentCommentId);
      if (!parent || parent.projectId !== target.projectId) {
        throw new Error("Parent comment not found.");
      }
      if ((parent.taskId ?? null) !== (target.taskId ?? null) || (parent.documentId ?? null) !== (target.documentId ?? null)) {
        throw new Error("A reply must stay on the same Task/Document/Project context as its parent.");
      }
    }
    const now = new Date().toISOString();
    const comment: ProjectComment = {
      id: crypto.randomUUID(),
      projectId: target.projectId,
      taskId: target.taskId ?? null,
      documentId: target.documentId ?? null,
      parentCommentId,
      authorId: viewer.id,
      authorName: viewer.fullName,
      body: trimmed,
      createdAt: now,
      updatedAt: now,
    };
    db.projectComments = [...db.projectComments, comment];
    return comment;
  },

  async updateComment(viewer, commentId, body) {
    const existing = db.projectComments.find((c) => c.id === commentId);
    if (!existing) throw new Error("Comment not found.");
    if (!canEditProjectComment(viewer, existing)) {
      throw new Error("Only the comment's own author can edit it.");
    }
    requireTargetAccess(viewer, { projectId: existing.projectId, taskId: existing.taskId, documentId: existing.documentId });
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment can't be empty.");
    const updated = { ...existing, body: trimmed, updatedAt: new Date().toISOString() };
    db.projectComments = db.projectComments.map((c) => (c.id === commentId ? updated : c));
    return toRow(updated);
  },

  async deleteComment(viewer, commentId) {
    const existing = db.projectComments.find((c) => c.id === commentId);
    if (!existing) throw new Error("Comment not found.");
    if (!canDeleteProjectComment(viewer, existing)) {
      throw new Error("Only the comment's own author or an admin can delete it.");
    }
    if (existing.authorId === viewer.id) {
      requireTargetAccess(viewer, { projectId: existing.projectId, taskId: existing.taskId, documentId: existing.documentId });
    }
    db.projectComments = db.projectComments.filter((c) => c.id !== commentId);
  },
};
