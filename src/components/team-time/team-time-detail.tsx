"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ClipboardX, Pencil } from "lucide-react";
import type { User } from "@/lib/data/types";
import type { TimeEntryWithUserAndTask } from "@/lib/data/providers/time-entries-provider";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { formatMinutes } from "@/lib/format-minutes";
import { computeWorkstreamBudget } from "@/lib/data/time-budget";
import { bestUnitFor, formatMinutesAs } from "@/lib/data/expected-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { Separator } from "@/components/ui/separator";
import { TimeEntryCorrectionInfo } from "@/components/time-entries/time-entry-correction-info";
import { CorrectTimeEntryDialog } from "@/components/team-time/correct-time-entry-dialog";

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

/**
 * The Supervisor review signal, per the product rule: never one entry's own duration against the
 * task's estimate — always the task's *cumulative* actual (every completed entry, any assignee)
 * against its estimate. `entry.task.actualMinutes` already carries that cumulative total from the
 * provider. Reuses the exact same `computeWorkstreamBudget` status/percent math every other
 * estimate-vs-actual display in the app already uses — no new thresholds, no new colors. Null when
 * the task has no estimate set — going over is informational only, never shown as an error.
 */
function taskEstimateContext(expectedMinutes: number | null, taskActualMinutes: number): string | null {
  if (expectedMinutes == null) return null;
  const budget = computeWorkstreamBudget({
    expectedMinutes,
    actualMinutes: taskActualMinutes,
    billableMinutes: taskActualMinutes,
    nonBillableMinutes: 0,
  });
  const unit = bestUnitFor(expectedMinutes);
  const actualLabel = formatMinutesAs(taskActualMinutes, unit);
  const estimatedLabel = formatMinutesAs(expectedMinutes, unit);
  const percentLabel = budget.status === "over" ? `${(budget.percent ?? 100) - 100}% over` : `${budget.percent}%`;
  return `Task total: ${actualLabel} · Est. ${estimatedLabel} · ${percentLabel}`;
}

interface TeamTimeDetailProps {
  person: User;
  entries: TimeEntryWithUserAndTask[];
  /** The signed-in viewer — used only to decide whether "Correct time" can show for this row (never the viewer's own entry); the provider is the real enforcement point. */
  viewerId: string;
  /** Refetches this day's entries — called after a correction is confirmed. */
  onChanged: () => void;
  className?: string;
  style?: CSSProperties;
}

/** Read-only, per-day view of one person's own logged entries — task, client-scoped time, billable split — the same "own logged time, nothing inferred" posture as My Day's own Today card, just for someone a manager is allowed to see. Never anything about presence or activity beyond what they themselves logged. A completed entry belonging to someone other than the viewer additionally gets a "Correct time" action — see `CorrectTimeEntryDialog`. */
export function TeamTimeDetail({ person, entries, viewerId, onChanged, className, style }: TeamTimeDetailProps) {
  const [correctingEntryId, setCorrectingEntryId] = useState<string | null>(null);
  const completed = entries.filter((e) => e.durationMinutes !== null);
  const totalMinutes = completed.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const billableMinutes = completed.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;
  const correctingEntry = entries.find((e) => e.id === correctingEntryId) ?? null;
  // Team Time's roster already only ever lists people the viewer can manage (or everyone, for a
  // superadmin) — see assignableStaffFor — so "not the viewer's own row" is sufficient here; the
  // provider's own canCorrectTimeEntry is what actually enforces team-scoping and role.
  const canCorrectThisPerson = person.id !== viewerId;

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
            {entries.map((entry, i) => {
              const estimateContext = taskEstimateContext(entry.task.expectedMinutes, entry.task.actualMinutes);
              const canCorrectThisEntry =
                canCorrectThisPerson && entry.durationMinutes !== null;
              return (
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
                      {canCorrectThisEntry && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto gap-1 px-1.5 py-0.5 text-xs"
                          onClick={() => setCorrectingEntryId(entry.id)}
                        >
                          <Pencil className="size-3" /> Correct time
                        </Button>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(entry.startTime)}
                      {entry.endTime ? `–${formatTime(entry.endTime)}` : ""}
                    </span>
                    {estimateContext && <span className="text-xs text-muted-foreground">{estimateContext}</span>}
                    {entry.notes && <p className="mt-1 text-sm text-foreground">{entry.notes}</p>}
                    <TimeEntryCorrectionInfo timeEntryId={entry.id} correctionCount={entry.correctionCount} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {correctingEntry && correctingEntry.durationMinutes !== null && (
        <CorrectTimeEntryDialog
          open={correctingEntryId != null}
          onOpenChange={(open) => {
            if (!open) setCorrectingEntryId(null);
          }}
          timeEntryId={correctingEntry.id}
          recordedDurationMinutes={correctingEntry.durationMinutes}
          onCorrected={() => {
            setCorrectingEntryId(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}
