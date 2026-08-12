"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Play, Pause, Square } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useMyTimeEntries, useRunningTimer, usePausedTimer } from "@/lib/data/hooks/use-time-entries";
import { useElapsedSeconds } from "@/lib/data/hooks/use-elapsed-seconds";
import { sumChainMinutes } from "@/lib/data/time-entry-chain";
import { timeEntriesProvider } from "@/lib/data/providers";
import { formatMinutes } from "@/lib/format-minutes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface TodayTimeCardProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * Today's logged time + the running/paused timer, whatever task it's on — a simple presence/effort
 * sense from the person's own logged time, not attendance surveillance: every number here is time
 * the person themselves started, paused, or stopped. Shared by all three My Day roles (previously
 * triplicated verbatim in employee-/supervisor-/superadmin-my-day.tsx), extracted here since Pause/
 * Resume added real state machinery worth keeping in one place.
 */
export function TodayTimeCard({ className, style }: TodayTimeCardProps) {
  const { user } = useAuth();
  const { entries, isLoading, refresh } = useMyTimeEntries();
  const { runningTimer, refresh: refreshRunningTimer } = useRunningTimer();
  const { pausedTimer, refresh: refreshPausedTimer } = usePausedTimer();
  const [isBusy, setIsBusy] = useState(false);

  const today = todayDateString();
  const todaysEntries = entries.filter((e) => e.startTime.slice(0, 10) === today && e.durationMinutes !== null);
  const todayTotal = todaysEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const todayBillable = todaysEntries.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const todayNonBillable = todayTotal - todayBillable;

  const baseSeconds = runningTimer ? sumChainMinutes(entries, runningTimer.continuesFromEntryId) * 60 : 0;
  const elapsedSeconds = useElapsedSeconds(runningTimer?.startTime ?? null, baseSeconds);
  const pausedTotalMinutes = pausedTimer
    ? (pausedTimer.durationMinutes ?? 0) + sumChainMinutes(entries, pausedTimer.continuesFromEntryId)
    : 0;

  async function refreshAll() {
    await Promise.all([refresh(), refreshRunningTimer(), refreshPausedTimer()]);
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

  async function handleResume() {
    if (!user || !pausedTimer) return;
    setIsBusy(true);
    try {
      await timeEntriesProvider.resumeTimer(user, pausedTimer.id);
      await refreshAll();
    } finally {
      setIsBusy(false);
    }
  }

  if (!user) return null;

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle className="text-base">Today</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : todayTotal === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged yet today.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-heading text-2xl font-semibold text-primary">{formatMinutes(todayTotal)}</span>
            <span className="text-xs text-muted-foreground">
              {formatMinutes(todayBillable)} billable
              {todayNonBillable > 0 ? `, ${formatMinutes(todayNonBillable)} non-billable` : ""}
            </span>
          </div>
        )}
        <div className="border-t pt-3">
          <span className="mb-2 block font-mono text-xs tracking-wider text-muted-foreground uppercase">
            Running timer
          </span>
          {runningTimer ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <Link href={`/dashboard/tasks/${runningTimer.task.id}`} className="text-sm font-medium hover:underline">
                  {runningTimer.task.title}
                </Link>
                <span className="font-mono text-lg text-primary">{formatElapsed(elapsedSeconds)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePause} disabled={isBusy}>
                  <Pause /> Pause
                </Button>
                <Button variant="destructive" size="sm" onClick={handleStop} disabled={isBusy}>
                  <Square /> Stop
                </Button>
              </div>
            </div>
          ) : pausedTimer ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <Link href={`/dashboard/tasks/${pausedTimer.task.id}`} className="text-sm font-medium hover:underline">
                  {pausedTimer.task.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  Paused — {formatMinutes(pausedTotalMinutes)} so far
                </span>
              </div>
              <Button size="sm" onClick={handleResume} disabled={isBusy}>
                <Play /> Resume
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No timer running — start one from any task.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
