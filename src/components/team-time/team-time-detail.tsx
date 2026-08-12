"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ClipboardX } from "lucide-react";
import type { User } from "@/lib/data/types";
import type { TimeEntryWithUserAndTask } from "@/lib/data/providers/time-entries-provider";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { formatMinutes } from "@/lib/format-minutes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { Separator } from "@/components/ui/separator";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface TeamTimeDetailProps {
  person: User;
  entries: TimeEntryWithUserAndTask[];
  className?: string;
  style?: CSSProperties;
}

/** Read-only, per-day view of one person's own logged entries — task, client-scoped time, billable split — the same "own logged time, nothing inferred" posture as My Day's own Today card, just for someone a manager is allowed to see. Never anything about presence or activity beyond what they themselves logged. */
export function TeamTimeDetail({ person, entries, className, style }: TeamTimeDetailProps) {
  const completed = entries.filter((e) => e.durationMinutes !== null);
  const totalMinutes = completed.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const billableMinutes = completed.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;

  return (
    <Card key={person.id} className={className} style={style}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback>{initials(person.fullName)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base">{person.fullName}</CardTitle>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[person.role]}</p>
          </div>
        </div>
        {entries.length > 0 && (
          <div className="text-right">
            <span className="font-heading text-xl font-semibold text-primary">{formatMinutes(totalMinutes)}</span>
            <p className="text-xs text-muted-foreground">
              {formatMinutes(billableMinutes)} billable
              {nonBillableMinutes > 0 ? `, ${formatMinutes(nonBillableMinutes)} non-billable` : ""}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
            <ContainedIcon size="lg" tone="neutral">
              <ClipboardX aria-hidden="true" />
            </ContainedIcon>
            <p className="text-sm font-medium">No time logged for this date</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {`${person.fullName.split(" ")[0]} hasn't logged any time on this day.`}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry, i) => (
              <li key={entry.id}>
                {i > 0 && <Separator className="my-3" />}
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/tasks/${entry.task.id}`} className="text-sm font-medium hover:underline">
                      {entry.task.title}
                    </Link>
                    {entry.durationMinutes === null ? (
                      <Badge variant="info">Running…</Badge>
                    ) : entry.pausedForResume ? (
                      <Badge variant="warning">Paused — {formatMinutes(entry.durationMinutes)}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{formatMinutes(entry.durationMinutes)}</span>
                    )}
                    <Badge variant={entry.billable ? "neutral" : "warning"}>
                      {entry.billable ? "Billable" : "Non-billable"}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(entry.startTime)}
                    {entry.endTime ? `–${formatTime(entry.endTime)}` : ""}
                  </span>
                  {entry.notes && <p className="mt-1 text-sm text-foreground">{entry.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
