"use client";

import { useState } from "react";
import { ArrowRight, CheckCheck, Send } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { taskHandoffsProvider } from "@/lib/data/providers";
import type { TaskHandoffWithUsers } from "@/lib/data/providers/task-handoffs-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TaskHandoffDialog } from "@/components/tasks/task-handoff-dialog";

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

interface TaskHandoffSectionProps {
  taskId: string;
  handoffs: TaskHandoffWithUsers[];
  onChanged: () => void;
}

/** Reaching this component at all already proves task access (the page itself gates on it) — no extra permission check needed to show the "Hand off task" button, same as NotesSection. */
export function TaskHandoffSection({ taskId, handoffs, onChanged }: TaskHandoffSectionProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  if (!user) return null;

  async function handleAcknowledge(handoffId: string) {
    if (!user) return;
    setAcknowledgingId(handoffId);
    try {
      await taskHandoffsProvider.acknowledgeHandoff(user, handoffId);
      onChanged();
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Handoffs</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Send /> Hand off task
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {handoffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No handoffs recorded yet.</p>
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
                    <>
                      <Badge variant="warning">Awaiting acknowledgment</Badge>
                      {handoff.handedToId === user.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acknowledgingId === handoff.id}
                          onClick={() => handleAcknowledge(handoff.id)}
                        >
                          {acknowledgingId === handoff.id ? "Acknowledging…" : "Acknowledge"}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <TaskHandoffDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        taskId={taskId}
        onHandedOff={onChanged}
      />
    </Card>
  );
}
