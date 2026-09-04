"use client";

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { projectCommentsProvider } from "@/lib/data/providers";
import type { ProjectCommentTarget } from "@/lib/data/providers/projects-provider";
import { useProjectComments } from "@/lib/data/hooks/use-project-comments";
import type { ProjectComment } from "@/lib/data/types";
import { canDeleteProjectComment, canEditProjectComment } from "@/lib/data/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToastManager } from "@/components/ui/toast";
import { getInitials as initials } from "@/lib/initials";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

interface ProjectCommentsSectionProps {
  /** The comment's fixed target — Project-root (task/document both omitted), a Task, or a
   * Document. Reused as-is on the Project tab, the full Task page, and the Documents surface. */
  target: ProjectCommentTarget;
  /** Compact renders a smaller title, suited to embedding inside a Task/Document panel rather than
   * as a full standalone Project tab. */
  compact?: boolean;
}

/** Project Level Part 7/8/9 — the ONE reusable threaded-comments panel, composed by the Project
 * Comments tab, the full Task page, and the Project Documents surface — never a duplicated
 * implementation per surface. One hop of nesting rendered (a reply's own replies still show, just
 * at the same indent — the DB relation supports arbitrary depth, only the UI keeps it visually flat
 * past the first level, matching this codebase's usual "one hop in practice" convention). Distinct
 * from the append-only Notes panel on Overview — Notes is durable context, this is discussion. */
export function ProjectCommentsSection({ target, compact }: ProjectCommentsSectionProps) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const { comments, refresh } = useProjectComments(target);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const topLevel = useMemo(() => comments.filter((c) => !c.parentCommentId), [comments]);
  const repliesFor = (id: string) => comments.filter((c) => c.parentCommentId === id);

  if (!user) return null;

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !user) return;
    setIsSubmitting(true);
    try {
      await projectCommentsProvider.createComment(user, target, body.trim(), null);
      setBody("");
      refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't post comment." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReply(parentId: string) {
    if (!replyBody.trim() || !user) return;
    setIsSubmitting(true);
    try {
      await projectCommentsProvider.createComment(user, target, replyBody.trim(), parentId);
      setReplyBody("");
      setReplyTo(null);
      refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't post reply." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveEdit(commentId: string) {
    if (!editBody.trim() || !user) return;
    try {
      await projectCommentsProvider.updateComment(user, commentId, editBody.trim());
      setEditingId(null);
      refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update comment." });
    }
  }

  async function handleDelete(commentId: string) {
    if (!user) return;
    try {
      await projectCommentsProvider.deleteComment(user, commentId);
      refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't delete comment." });
    }
  }

  function CommentRow({ comment, isReply }: { comment: ProjectComment; isReply: boolean }) {
    if (!user) return null;
    const isEditing = editingId === comment.id;
    return (
      <div className={isReply ? "ml-9 flex gap-3" : "flex gap-3"}>
        <Avatar className="size-7 shrink-0">
          <AvatarFallback className="text-[10px]">{initials(comment.authorName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{comment.authorName}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
          </div>
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} autoFocus />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSaveEdit(comment.id)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm whitespace-pre-wrap text-foreground">{comment.body}</p>
              <div className="flex gap-3">
                {!isReply && (
                  <button
                    type="button"
                    onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Reply
                  </button>
                )}
                {canEditProjectComment(user, comment) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditBody(comment.body);
                    }}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Edit
                  </button>
                )}
                {canDeleteProjectComment(user, comment) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          )}

          {replyTo === comment.id && (
            <div className="mt-1 flex flex-col gap-2">
              <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply…" rows={2} autoFocus />
              <div className="flex gap-2">
                <Button size="sm" disabled={!replyBody.trim() || isSubmitting} onClick={() => handleReply(comment.id)}>
                  Post reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {repliesFor(comment.id).map((reply) => (
            <div key={reply.id} className="mt-3">
              <CommentRow comment={reply} isReply />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const body_ = (
    <div className="flex flex-col gap-4">
      <form onSubmit={handlePost} className="flex flex-col gap-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" rows={2} aria-label="Comment body" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isSubmitting || !body.trim()}>
            <Send /> {isSubmitting ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </form>

      {topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {topLevel.map((comment) => (
            <li key={comment.id}>
              <CommentRow comment={comment} isReply={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (compact) return body_;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comments</CardTitle>
      </CardHeader>
      <CardContent>{body_}</CardContent>
    </Card>
  );
}
