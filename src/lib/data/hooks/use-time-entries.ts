"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { timeEntriesProvider } from "@/lib/data/providers";
import type { TimeEntryWithTask, TimeEntryWithUser, TimeEntryWithUserAndTask } from "@/lib/data/providers/time-entries-provider";

export function useTaskTimeEntries(taskId: string) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await timeEntriesProvider.listTimeEntriesForTask(user, taskId);
    setEntries(result);
    setIsLoading(false);
  }, [user, taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { entries, isLoading, refresh };
}

/** All of the viewer's own time entries, across every task — callers filter by date client-side. */
export function useMyTimeEntries() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await timeEntriesProvider.listMyTimeEntries(user);
    setEntries(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { entries, isLoading, refresh };
}

/** The viewer's own running timer, if any — regardless of which task it's on. */
export function useRunningTimer() {
  const { user } = useAuth();
  const [runningTimer, setRunningTimer] = useState<TimeEntryWithTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await timeEntriesProvider.getRunningTimer(user);
    setRunningTimer(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { runningTimer, isLoading, refresh };
}

/** The viewer's single most-recently-paused entry, across all tasks — a "you have something paused" hint, not a per-task authority (a task's own Resume button checks that task's own latest entry instead — see `TaskTimeTracking`). */
export function usePausedTimer() {
  const { user } = useAuth();
  const [pausedTimer, setPausedTimer] = useState<TimeEntryWithTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await timeEntriesProvider.getPausedTimer(user);
    setPausedTimer(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { pausedTimer, isLoading, refresh };
}

/** Every visible team member's entries for one day, in one call — powers Team Time's roster+detail split (mirrors `useDailyUpdatesForDate`'s shape exactly). */
export function useTimeEntriesForDate(date: string) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithUserAndTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await timeEntriesProvider.listTimeEntriesForDate(user, date);
    setEntries(result);
    setIsLoading(false);
  }, [user, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { entries, isLoading, refresh };
}
