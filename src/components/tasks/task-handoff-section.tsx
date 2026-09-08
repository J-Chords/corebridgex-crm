"use client";

import { ArrowRight, CheckCheck } from "lucide-react";
import type { TaskHandoffWithUsers } from "@/lib/data/providers/task-handoffs-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { getInitials as initials } from "@/lib/initials";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TaskHandoffSectionProps {
  taskId: string;
  handoffs: TaskHandoffWithUsers[];
}

/**
 * Task Level Phase 2, Product Owner acceptance correction — Handoff is not an active Corebridge X
 * workflow at all, only preserved history (ownership transfer is now: change Assignee(s) + add a
 * Comment). Purely read-only, including previously-unacknowledged records — no acknowledge control,
 * consistent with Handoff having no other live entry point anywhere in the product. `taskId` is kept
 * in the props for the historical-list query the parent already performs.
 */
export function TaskHandoffSection({ handoffs }: TaskHandoffSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Previous assignment history</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {handoffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous assignment history.</p>
        ) : (
          handoffs.map((handoff, i) => (
            <div key={handoff.id}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[10px]">{initials(handoff.handedBy.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{handoff.handedBy.fullName}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[10px]">{initials(handoff.handedTo.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{handoff.handedTo.fullName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(handoff.createdAt)}</span>
                </div>

                <div className="flex flex-col gap-1.5 pl-9 text-sm">
                  <p>
                    <span className="font-medium text-muted-foreground">Done: </span>
                    <span className="whitespace-pre-wrap">{handoff.workDone}</span>
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Remaining: </span>
                    <span className="whitespace-pre-wrap">{handoff.workRemaining}</span>
                  </p>
                  {handoff.blockers && (
                    <p>
                      <span className="font-medium text-muted-foreground">Blockers: </span>
                      <span className="whitespace-pre-wrap">{handoff.blockers}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pl-9">
                  {handoff.acknowledgedAt && handoff.acknowledgedBy ? (
                    <Badge variant="success">
                      <CheckCheck className="size-3" aria-hidden="true" /> Acknowledged by{" "}
                      {handoff.acknowledgedBy.fullName} · {formatDateTime(handoff.acknowledgedAt)}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Awaiting acknowledgment</Badge>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
