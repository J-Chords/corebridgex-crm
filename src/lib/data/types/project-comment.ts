/**
 * Project-level threaded discussion — deliberately distinct from the existing append-only Notes
 * model (no replies/edit/delete there). `parentCommentId` is one hop only in the UI (a reply to a
 * reply still renders nested, since the DB relation itself supports arbitrary depth), matching how
 * this codebase already treats other one-level-in-practice hierarchies.
 */
export interface ProjectComment {
  id: string;
  projectId: string;
  /** At most one of these two may be set (DB CHECK-enforced) — both null means a Project-root
   * comment. A reply must share the same target as its parent (trigger-enforced). */
  taskId: string | null;
  documentId: string | null;
  parentCommentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
