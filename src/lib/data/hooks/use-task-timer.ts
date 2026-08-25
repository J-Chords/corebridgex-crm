"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTaskTimeEntries, useRunningTimer, usePausedTimer } from "@/lib/data/hooks/use-time-entries";
import { useElapsedSeconds } from "@/lib/data/hooks/use-elapsed-seconds";
import { sumChainMinutes } from "@/lib/data/time-entry-chain";
import { timeEntriesProvider } from "@/lib/data/providers";
import { canLogTime } from "@/lib/data/permissions";

/**
 * Phase 11A/11B — the ONE authoritative live-timer controller for a given Task render. Extracted
 * from what used to be `TaskTimeTracking`'s own internal hooks so the compact header control
 * (`TaskTimerControl`) and the history/manual-log section (`TaskTimeTracking`) can share a single
 * `useTaskTimeEntries`/`useRunningTimer`/`usePausedTimer` instance instead of each mounting their
 * own — avoiding two independent pollers that could race or briefly disagree on elapsed time.
 * Call this ONCE per rendered Task (the full page or the Quick View drawer — never both for the
 * same Task at once in the same tree) and pass the returned object down as a prop.
 */
export function useTaskTimer(taskId: string, assigneeIds: string[]) {
  const { user } = useAuth();
  const { entries, isLoading, refresh } = useTaskTimeEntries(taskId);
  const { runningTimer, refresh: refreshRunningTimer } = useRunningTimer();
  const { pausedTimer, refresh: refreshPausedTimer } = usePausedTimer();
  const [isBusy, setIsBusy] = useState(false);

  const isRunningHere = runningTimer?.taskId === taskId;
  // Entries are sorted newest-first, so this task's own latest entry (if any) tells us whether it has
  // a resumable pause — a running entry never has `pausedForResume: true`, so this can't collide with
  // `isRunningHere`.
  const latestForTask = entries[0] ?? null;
  const isPausedHere = latestForTask?.pausedForResume === true;
  const baseSeconds = isRunningHere ? sumChainMinutes(entries, runningTimer.continuesFromEntryId) * 60 : 0;
  const elapsedSeconds = useElapsedSeconds(isRunningHere ? runningTimer.startTime : null, baseSeconds);

  const canLog = user != null && canLogTime(user, { assigneeIds });

  const completed = entries.filter((e) => e.durationMinutes !== null);
  const totalMinutes = completed.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const billableMinutes = completed.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;

  async function refreshAll() {
    await Promise.all([refresh(), refreshRunningTimer(), refreshPausedTimer()]);
  }

  async function handleStart(onTaskChanged?: () => void, onTimerChanged?: () => void) {
    if (!user) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.startTimer(user, taskId);
      await refreshAll();
      onTaskChanged?.();
      onTimerChanged?.();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStop(onTaskChanged?: () => void, onTimerChanged?: () => void) {
    if (!user || !runningTimer) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.stopTimer(user, runningTimer.id);
      await refreshAll();
      onTaskChanged?.();
      onTimerChanged?.();
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePause(onTaskChanged?: () => void, onTimerChanged?: () => void) {
    if (!user || !runningTimer) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.pauseTimer(user, runningTimer.id);
      await refreshAll();
      onTaskChanged?.();
      onTimerChanged?.();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResume(entryId: string, onTaskChanged?: () => void, onTimerChanged?: () => void) {
    if (!user) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.resumeTimer(user, entryId);
      await refreshAll();
      onTaskChanged?.();
      onTimerChanged?.();
    } finally {
      setIsBusy(false);
    }
  }

  return {
    taskId,
    entries,
    isLoading,
    runningTimer,
    pausedTimer,
    isRunningHere,
    isPausedHere,
    latestForTask,
    elapsedSeconds,
    totalMinutes,
    billableMinutes,
    nonBillableMinutes,
    canLog,
    isBusy,
    handleStart,
    handleStop,
    handlePause,
    handleResume,
    refreshAll,
  };
}

export type TaskTimerState = ReturnType<typeof useTaskTimer>;
