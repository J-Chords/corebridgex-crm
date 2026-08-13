"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, Pause, Square, Plus, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTaskTimeEntries, useRunningTimer, usePausedTimer } from "@/lib/data/hooks/use-time-entries";
import { useElapsedSeconds } from "@/lib/data/hooks/use-elapsed-seconds";
import { sumChainMinutes } from "@/lib/data/time-entry-chain";
import { computeWorkstreamBudget } from "@/lib/data/time-budget";
import { timeEntriesProvider } from "@/lib/data/providers";
import { canLogTime } from "@/lib/data/permissions";
import { formatMinutes } from "@/lib/format-minutes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { BudgetBar } from "@/components/ui/budget-bar";
import { ManualTimeEntryDialog } from "@/components/tasks/manual-time-entry-dialog";
import { TimeEntryCorrectionInfo } from "@/components/time-entries/time-entry-correction-info";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatEntryWhen(startTime: string, endTime: string | null) {
  const start = new Date(startTime);
  if (!endTime) {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const end = new Date(endTime);
  const sameDay = start.toDateString() === end.toDateString();
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (sameDay) {
    return `${start.toLocaleDateString("en-US", dateFmt)}, ${start.toLocaleTimeString("en-US", timeFmt)}–${end.toLocaleTimeString("en-US", timeFmt)}`;
  }
  return `${start.toLocaleString("en-US", { ...dateFmt, ...timeFmt })} – ${end.toLocaleString("en-US", { ...dateFmt, ...timeFmt })}`;
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface TaskTimeTrackingProps {
  taskId: string;
  companyId: string;
  assigneeIds: string[];
  /** Normalized to minutes — see `src/lib/data/expected-time.ts`. Null when this task has no estimate set, in which case a plain total (no budget bar) still shows. */
  expectedMinutes: number | null;
}

export function TaskTimeTracking({ taskId, companyId, assigneeIds, expectedMinutes }: TaskTimeTrackingProps) {
  const { user } = useAuth();
  const { entries, isLoading, refresh } = useTaskTimeEntries(taskId);
  const { runningTimer, refresh: refreshRunningTimer } = useRunningTimer();
  const { pausedTimer, refresh: refreshPausedTimer } = usePausedTimer();
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const isRunningHere = runningTimer?.taskId === taskId;
  // Entries are sorted newest-first, so this task's own latest entry (if any) tells us whether it has
  // a resumable pause — a running entry never has `pausedForResume: true`, so this can't collide with
  // `isRunningHere`.
  const latestForTask = entries[0] ?? null;
  const isPausedHere = latestForTask?.pausedForResume === true;
  const baseSeconds = isRunningHere ? sumChainMinutes(entries, runningTimer.continuesFromEntryId) * 60 : 0;
  const elapsedSeconds = useElapsedSeconds(isRunningHere ? runningTimer.startTime : null, baseSeconds);

  if (!user) return null;
  const canLog = canLogTime(user, { assigneeIds });

  async function refreshAll() {
    await Promise.all([refresh(), refreshRunningTimer(), refreshPausedTimer()]);
  }

  async function handleStart() {
    if (!user) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.startTimer(user, taskId);
      await refreshAll();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStop() {
    if (!user || !runningTimer) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.stopTimer(user, runningTimer.id);
      await refreshAll();
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePause() {
    if (!user || !runningTimer) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.pauseTimer(user, runningTimer.id);
      await refreshAll();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResume(entryId: string) {
    if (!user) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.resumeTimer(user, entryId);
      await refreshAll();
    } finally {
      setIsBusy(false);
    }
  }

  const completed = entries.filter((e) => e.durationMinutes !== null);
  const totalMinutes = completed.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const billableMinutes = completed.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;
  const budget = computeWorkstreamBudget({ expectedMinutes, actualMinutes: totalMinutes, billableMinutes, nonBillableMinutes });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Timer</span>
        <div className="flex flex-wrap items-center gap-3">
          {canLog &&
            (isRunningHere ? (
              <>
                <Button variant="outline" onClick={handlePause} disabled={isBusy}>
                  <Pause /> Pause
                </Button>
                <Button variant="destructive" onClick={handleStop} disabled={isBusy}>
                  <Square /> Stop
                </Button>
                <span className="font-mono text-sm text-muted-foreground">{formatElapsed(elapsedSeconds)}</span>
              </>
            ) : isPausedHere ? (
              <Button onClick={() => handleResume(latestForTask!.id)} disabled={isBusy}>
                <Play /> Resume
              </Button>
            ) : (
              <Button onClick={handleStart} disabled={isBusy}>
                <Play /> Start timer
              </Button>
            ))}
          {canLog && !isRunningHere && !isPausedHere && runningTimer && (
            <span className="text-xs text-muted-foreground">
              You have a timer running on <span className="font-medium text-foreground">{runningTimer.task.title}</span> —
              starting one here will pause it.
            </span>
          )}
          {canLog && !isRunningHere && !isPausedHere && !runningTimer && pausedTimer && pausedTimer.taskId !== taskId && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{pausedTimer.task.title}</span> is paused (
              {formatMinutes(pausedTimer.durationMinutes ?? 0)} so far) —{" "}
              <Link href={`/dashboard/tasks/${pausedTimer.taskId}`} className="text-primary hover:underline">
                go resume it
              </Link>
            </span>
          )}
          {canLog && (
            <Button variant="outline" onClick={() => setManualDialogOpen(true)}>
              <Plus /> Log time
            </Button>
          )}
        </div>
        {expectedMinutes == null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {totalMinutes > 0 ? (
              <>
                <span className="font-medium text-foreground">Actual: {formatMinutes(totalMinutes)}</span>
                <span>
                  ({formatMinutes(billableMinutes)} billable
                  {nonBillableMinutes > 0 ? `, ${formatMinutes(nonBillableMinutes)} non-billable` : ""})
                </span>
              </>
            ) : (
              <span>No time logged yet.</span>
            )}
          </div>
        )}
      </div>

      {expectedMinutes != null && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Estimate vs. actual</span>
          <BudgetBar budget={budget} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Time entries</span>
        {!isLoading && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged on this task yet.</p>
        ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry, i) => (
            <li key={entry.id}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex items-start gap-3">
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[10px]">{initials(entry.user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{entry.user.fullName}</span>
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
                    {formatEntryWhen(entry.startTime, entry.endTime)}
                  </span>
                  {entry.notes && <p className="mt-1 text-sm text-foreground">{entry.notes}</p>}
                  <TimeEntryCorrectionInfo timeEntryId={entry.id} correctionCount={entry.correctionCount} />
                </div>
              </div>
            </li>
          ))}
        </ul>
        )}
      </div>

      <ManualTimeEntryDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        taskId={taskId}
        companyId={companyId}
        onSaved={refreshAll}
      />
    </div>
  );
}
