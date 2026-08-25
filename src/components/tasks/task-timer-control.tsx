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
  /** Required for "header" variant (Log time needs it); omit for "compact" (Quick View never logs manual time). */
  taskId?: string;
  companyId?: string;
  onTaskChanged?: () => void;
  onTimerChanged?: () => void;
  /**
   * "header" (default) — the full top-right cluster on the full Task page: "Time Tracking" label,
   * clock, Start/Pause/Resume/Stop, Log time, and the compact cross-task running/paused-elsewhere
   * notices. "compact" — Quick View's lighter treatment: just the clock + Start/Pause/Resume/Stop,
   * no label, no Log time, no cross-task notices, no Time Entry history of any kind.
   */
  variant?: "header" | "compact";
}

/**
 * Phase 11A/11B final polish — the ONE primary Time Tracking cluster. Reads from the shared
 * `useTaskTimer` instance the page/Quick View owns — this component renders no hooks of its own
 * that fetch/poll anything, so it can never race or disagree with the Time Activity history section
 * reading the exact same `timer` object. Manual "Log time" (header variant only) is also owned here
 * — `ManualTimeEntryDialog`'s `onSaved` calls the shared `timer.refreshAll`, so the header total and
 * the Time Activity list below both refresh from the one save, no page reload.
 */
export function TaskTimerControl({ timer, taskId, companyId, onTaskChanged, onTimerChanged, variant = "header" }: TaskTimerControlProps) {
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const { isRunningHere, isPausedHere, elapsedSeconds, totalMinutes, canLog, isBusy, latestForTask, runningTimer, pausedTimer } = timer;
  const compact = variant === "compact";

  const clock = (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 font-mono text-sm font-semibold tabular-nums">
      <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
      {isRunningHere ? formatElapsed(elapsedSeconds) : totalMinutes > 0 ? formatMinutes(totalMinutes) : "No time logged"}
    </div>
  );

  if (!canLog) {
    return compact ? (
      clock
    ) : (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Time Tracking</span>
        {clock}
      </div>
    );
  }

  const buttons = (
    <>
      {clock}
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
      {!compact && (
        <Button size="sm" variant="outline" onClick={() => setManualDialogOpen(true)}>
          <Plus /> Log time
        </Button>
      )}
    </>
  );

  if (compact) {
    return <div className="flex flex-wrap items-center gap-2">{buttons}</div>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Time Tracking</span>
      <div className="flex flex-wrap items-center justify-end gap-2">{buttons}</div>
      {!isRunningHere && !isPausedHere && runningTimer && (
        <span className="max-w-64 text-right text-xs text-muted-foreground">
          Running on <span className="font-medium text-foreground">{runningTimer.task.title}</span> — starting here will pause it.
        </span>
      )}
      {!isRunningHere && !isPausedHere && !runningTimer && pausedTimer && pausedTimer.taskId !== taskId && (
        <span className="max-w-64 text-right text-xs text-muted-foreground">
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
