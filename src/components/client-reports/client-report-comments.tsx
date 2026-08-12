"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { ClientReportComment } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface ClientReportCommentsProps {
  comments: ClientReportComment[];
  canComment: boolean;
  onAddComment: (body: string) => Promise<void>;
}

/**
 * Internal reviewer feedback — same shape/philosophy as ReportComments. `print:hidden` is load-bearing
 * here, not just a formatting choice: every comment carries a staff `authorName`, and this report's
 * one hard rule is that no employee name ever appears in the exported/printed document.
 */
export function ClientReportComments({ comments, canComment, onAddComment }: ClientReportCommentsProps) {
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddComment(body.trim());
      setBody("");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canComment && comments.length === 0) return null;

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="text-base">Reviewer comments</CardTitle>
        <p className="text-sm text-muted-foreground">
          Internal feedback only — never part of the exported report.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canComment && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a review comment…"
              rows={2}
              aria-label="Comment body"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSubmitting || !body.trim()}>
                <Send /> {isSubmitting ? "Posting…" : "Post comment"}
              </Button>
            </div>
          </form>
        )}

        {canComment && comments.length > 0 && <Separator />}

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[10px]">{initials(comment.authorName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{comment.authorName}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground">{comment.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
