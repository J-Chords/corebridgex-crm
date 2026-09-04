import type { ProjectCommentsProvider, ProjectCommentTarget } from "../projects-provider";
import type { ProjectComment } from "../../types";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";

interface CommentRow {
  id: string;
  project_id: string;
  parent_comment_id: string | null;
  author_id: string;
  body: string;
  task_id: string | null;
  document_id: string | null;
  created_at: string;
  updated_at: string;
}

async function hydrate(rows: CommentRow[]): Promise<ProjectComment[]> {
  if (rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const authors = await resolveProfileDirectory(authorIds);
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    documentId: r.document_id,
    parentCommentId: r.parent_comment_id,
    authorId: r.author_id,
    authorName: authors.find((a) => a.id === r.author_id)?.fullName ?? "Unknown",
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export const supabaseProjectCommentsProvider: ProjectCommentsProvider = {
  async listComments(_viewer, target: ProjectCommentTarget) {
    const supabase = createClient();
    let query = supabase
      .from("project_comments")
      .select("id, project_id, parent_comment_id, author_id, body, task_id, document_id, created_at, updated_at")
      .eq("project_id", target.projectId);
    query = target.taskId
      ? query.eq("task_id", target.taskId)
      : target.documentId
        ? query.eq("document_id", target.documentId)
        : query.is("task_id", null).is("document_id", null);
    const { data, error } = await query.order("created_at");
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as CommentRow[]);
  },

  async createComment(_viewer, target: ProjectCommentTarget, body, parentCommentId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_project_comment", {
      target_project_id: target.projectId,
      p_parent_comment_id: parentCommentId,
      p_body: body,
      p_task_id: target.taskId ?? null,
      p_document_id: target.documentId ?? null,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as CommentRow]);
    return hydrated;
  },

  async updateComment(_viewer, commentId, body) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_project_comment", {
      target_comment_id: commentId,
      p_body: body,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as CommentRow]);
    return hydrated;
  },

  async deleteComment(_viewer, commentId) {
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_project_comment", { target_comment_id: commentId });
    if (error) throw new Error(error.message);
  },
};
