"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, Pause, Square, Plus, Clock } from "lucide-react";
import type { TaskTimerState } from "@/lib/data/hooks/use-task-timer";
import { formatMinutes } from "@/lib/format-minutes";
import { Button } from "@/components/ui/button";
import { ManualTimeEntryDialog } from "@/components/tasks/manual-time-entry-dialog";

/** Always H:MM:SS — a steady clock-style readout while running, per the "feel like a clock/action" goal. */
function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface TaskTimerControlProps {
  timer: TaskTimerState;
  /** Required for "rail" variant (Log time needs it); omit for "compact" (Quick View never logs manual time). */
  taskId?: string;
  companyId?: string;
  onTaskChanged?: () => void;
  onTimerChanged?: () => void;
  /**
   * "rail" (default) — Phase 12B's right-property-rail widget on the full Task page: "Time
   * Tracking" label, a big clock/tracked-total readout, Start/Pause/Resume/Stop stacked full-width,
   * Log time, and the compact cross-task running/paused-elsewhere notices. Replaces the old
   * "header" variant that used to sit top-right of the page — Time Tracking is now one property
   * block among several, not the page's dominant element. "compact" — Quick View's lighter
   * treatment: just the clock + Start/Pause/Resume/Stop, no label, no Log time, no notices.
   */
  variant?: "rail" | "compact";
}

/**
 * Phase 11A/11B/12B — the ONE primary Time Tracking cluster. Reads from the shared `useTaskTimer`
 * instance the page/Quick View owns — this component renders no hooks of its own that fetch/poll
 * anything, so it can never race or disagree with the Time Activity history section reading the
 * exact same `timer` object. Manual "Log time" (rail variant only) is also owned here —
 * `ManualTimeEntryDialog`'s `onSaved` calls the shared `timer.refreshAll`, so the rail total and
 * the Time Activity list below both refresh from the one save, no page reload.
 */
export function TaskTimerControl({ timer, taskId, companyId, onTaskChanged, onTimerChanged, variant = "rail" }: TaskTimerControlProps) {
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const { isRunningHere, isPausedHere, elapsedSeconds, totalMinutes, canLog, isBusy, latestForTask, runningTimer, pausedTimer } = timer;
  const compact = variant === "compact";

  const trackedLabel = totalMinutes > 0 ? formatMinutes(totalMinutes) : "No time logged";

  const compactClock = (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 font-mono text-sm font-semibold tabular-nums">
      <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
      {isRunningHere ? formatElapsed(elapsedSeconds) : trackedLabel}
    </div>
  );

  if (compact) {
    if (!canLog) return compactClock;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {compactClock}
        {isRunningHere ? (
          <>
            <Button size="sm" variant="outline" onClick={() => timer.handlePause(onTaskChanged, onTimerChanged)} disabled={isBusy}>
              <Pause /> Pause
            </Button>
            <Button size="sm" variant="destructive" onClick={() => timer.handleStop(onTaskChanged, onTimerChanged)} disabled={isBusy}>
              <Square /> Stop
            </Button>
          </>
        ) : isPausedHere ? (
          <Button size="sm" onClick={() => timer.handleResume(latestForTask!.id, onTaskChanged, onTimerChanged)} disabled={isBusy}>
            <Play /> Resume
          </Button>
        ) : (
          <Button size="sm" onClick={() => timer.handleStart(onTaskChanged, onTimerChanged)} disabled={isBusy}>
            <Play /> Start
          </Button>
        )}
      </div>
    );
  }

  // Rail variant — Part 30's stacked idle/running/paused mockups.
  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Time Tracking</span>
      {isRunningHere ? (
        <div className="font-mono text-2xl font-semibold tabular-nums">{formatElapsed(elapsedSeconds)}</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {totalMinutes > 0 && <span className="text-xs text-muted-foreground">Tracked</span>}
          <span className="font-mono text-xl font-semibold">{trackedLabel}</span>
        </div>
      )}
      {canLog && (
        <div className="flex items-center gap-2">
          {isRunningHere ? (
            <>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => timer.handlePause(onTaskChanged, onTimerChanged)} disabled={isBusy}>
                <Pause /> Pause
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => timer.handleStop(onTaskChanged, onTimerChanged)} disabled={isBusy}>
                <Square /> Stop
              </Button>
            </>
          ) : isPausedHere ? (
            <>
              <Button size="sm" className="flex-1" onClick={() => timer.handleResume(latestForTask!.id, onTaskChanged, onTimerChanged)} disabled={isBusy}>
                <Play /> Resume
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => timer.handleStop(onTaskChanged, onTimerChanged)} disabled={isBusy}>
                <Square /> Stop
              </Button>
            </>
          ) : (
            <Button size="sm" className="flex-1" onClick={() => timer.handleStart(onTaskChanged, onTimerChanged)} disabled={isBusy}>
              <Play /> Start timer
            </Button>
          )}
        </div>
      )}
      {canLog && (
        <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => setManualDialogOpen(true)}>
          <Plus /> Log time
        </Button>
      )}
      {!isRunningHere && !isPausedHere && runningTimer && (
        <span className="text-xs text-muted-foreground">
          Running on <span className="font-medium text-foreground">{runningTimer.task.title}</span> — starting here will pause it.
        </span>
      )}
      {!isRunningHere && !isPausedHere && !runningTimer && pausedTimer && pausedTimer.taskId !== taskId && (
        <span className="text-xs text-muted-foreground">
          <Link href={`/dashboard/tasks/${pausedTimer.taskId}`} className="font-medium text-foreground hover:underline">
            {pausedTimer.task.title}
          </Link>{" "}
          is paused ({formatMinutes(pausedTimer.durationMinutes ?? 0)}) — go resume it.
        </span>
      )}
      {taskId && companyId && (
        <ManualTimeEntryDialog
          open={manualDialogOpen}
          onOpenChange={setManualDialogOpen}
          taskId={taskId}
          companyId={companyId}
          onSaved={timer.refreshAll}
        />
      )}
    </div>
  );
}
