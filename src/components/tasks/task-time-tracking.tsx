"use client";

import { useState } from "react";
import type { TaskTimerState } from "@/lib/data/hooks/use-task-timer";
import { formatMinutes } from "@/lib/format-minutes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { TimeEntryCorrectionInfo } from "@/components/time-entries/time-entry-correction-info";

import { getInitials as initials } from "@/lib/initials";

/** Collapsed-by-default row count — see Section 7A: a Task with many entries must not become a long page by default. */
const COLLAPSED_COUNT = 3;

function formatEntryWhen(startTime: string, endTime: string | null) {
  const start = new Date(startTime);
  if (!endTime) {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const end = new Date(endTime);
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (sameDay) {
    return `${start.toLocaleDateString("en-US", dateFmt)}   ${start.toLocaleTimeString("en-US", timeFmt)}–${end.toLocaleTimeString("en-US", timeFmt)}`;
  }
  return `${start.toLocaleString("en-US", { ...dateFmt, ...timeFmt })} – ${end.toLocaleString("en-US", { ...dateFmt, ...timeFmt })}`;
}

interface TaskTimeTrackingProps {
  /** The ONE shared timer instance the page owns (`useTaskTimer`) — this component never calls
   * `useTaskTimeEntries`/`useRunningTimer`/`usePausedTimer` itself, so it can never race or disagree
   * with the `TaskTimerControl` cluster in the page header reading the same object. */
  timer: TaskTimerState;
}

/**
 * "Time Activity" — history/read-only presentation only. Every primary time ACTION (Start/Pause/
 * Resume/Stop, Log time, the live clock, and the cross-task running/paused-elsewhere notices) lives
 * exclusively in the header's `TaskTimerControl` cluster now — this section never duplicates any of
 * that operational UI, it only reflects the underlying Time Entry history. Collapsed to the latest
 * `COLLAPSED_COUNT` entries by default (Section 7A/7G) — the rest render only once "View all" is
 * clicked, so a Task with a long history doesn't cost extra DOM/render weight until asked for.
 */
export function TaskTimeTracking({ timer }: TaskTimeTrackingProps) {
  const { entries, isLoading, totalMinutes, billableMinutes, nonBillableMinutes, isRunningHere } = timer;
  const [showAll, setShowAll] = useState(false);

  const distinctContributorIds = new Set(entries.map((e) => e.user.id));
  const showContributorNames = distinctContributorIds.size > 1;
  const visibleEntries = showAll ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hiddenCount = entries.length - visibleEntries.length;

  return (
    <div className="flex flex-col gap-3">
      {totalMinutes > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">
            Total <span className="font-medium text-foreground">{formatMinutes(totalMinutes)}</span>
          </span>
          {!isRunningHere && (
            <span className="text-xs text-muted-foreground">
              {formatMinutes(billableMinutes)} billable
              {nonBillableMinutes > 0 ? ` · ${formatMinutes(nonBillableMinutes)} non-billable` : ""}
            </span>
          )}
        </div>
      )}

      {!isLoading && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time logged on this task yet.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {visibleEntries.map((entry, i) => (
              <li key={entry.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex items-start gap-2">
                  {showContributorNames && (
                    <Avatar className="size-6 shrink-0">
                      <AvatarFallback className="text-[10px]">{initials(entry.user.fullName)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                      {showContributorNames && <span className="font-medium">{entry.user.fullName}</span>}
                      <span className="text-muted-foreground">{formatEntryWhen(entry.startTime, entry.endTime)}</span>
                      {entry.durationMinutes === null ? (
                        <Badge variant="info">Running…</Badge>
                      ) : entry.pausedForResume ? (
                        <Badge variant="warning">Paused — {formatMinutes(entry.durationMinutes)}</Badge>
                      ) : (
                        <span className="font-medium">{formatMinutes(entry.durationMinutes)}</span>
                      )}
                      <Badge variant={entry.billable ? "neutral" : "warning"}>
                        {entry.billable ? "Billable" : "Non-billable"}
                      </Badge>
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                    <TimeEntryCorrectionInfo timeEntryId={entry.id} correctionCount={entry.correctionCount} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowAll(true)}>
              View all {entries.length} entries
            </Button>
          )}
          {showAll && entries.length > COLLAPSED_COUNT && (
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowAll(false)}>
              View fewer
            </Button>
          )}
        </>
      )}
    </div>
  );
}
