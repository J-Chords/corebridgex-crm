import type { TimeEntry, User } from "../types";

export interface TimeEntryWithUser extends TimeEntry {
  user: User;
}

export interface TimeEntryWithTask extends TimeEntry {
  task: { id: string; title: string; companyId: string };
}

export interface TimeEntryWithUserAndTask extends TimeEntry {
  user: User;
  task: { id: string; title: string; companyId: string };
}

export interface ManualTimeEntryInput {
  startTime: string;
  /** Null for a duration-only entry (no specific clock range). */
  endTime: string | null;
  durationMinutes: number;
  notes: string | null;
  billable: boolean;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Every method takes the requesting `viewer` and enforces the task
 * visibility + `canLogTime` gate (src/lib/data/permissions.ts) itself.
 */
export interface TimeEntriesProvider {
  listTimeEntriesForTask(viewer: User, taskId: string): Promise<TimeEntryWithUser[]>;
  /** All of the viewer's own entries, across every task — callers filter by date (e.g. "today") client-side. */
  listMyTimeEntries(viewer: User): Promise<TimeEntryWithTask[]>;
  /** Every entry (any visible user, any task) whose `startTime` falls on `date` (YYYY-MM-DD) — powers Team Time. Gated per-entry by `canViewTimeForUser`, so a supervisor only ever gets their own + their direct reports', never the whole org. */
  listTimeEntriesForDate(viewer: User, date: string): Promise<TimeEntryWithUserAndTask[]>;
  /** The viewer's own currently-running timer, if any — regardless of which task it's on. Carries the task's own title so a cross-task hint elsewhere can name it specifically. */
  getRunningTimer(viewer: User): Promise<TimeEntryWithTask | null>;
  /** The viewer's single most-recently-paused entry, across all tasks — a "you have something paused" hint, not a per-task authority (see `TimeEntriesProvider` docs on `pauseTimer`/`resumeTimer`). Null once anything newer (a fresh start, a stop, a manual entry) has happened for the viewer. */
  getPausedTimer(viewer: User): Promise<TimeEntryWithTask | null>;
  /** Starts a timer on `taskId`, auto-pausing any other timer the viewer has running first. Always a fresh session — never chains to a prior paused entry (see `resumeTimer` for that). */
  startTimer(viewer: User, taskId: string): Promise<TimeEntryWithUser>;
  /** Stops a running timer for good — finalized, no "Resume" offered for it afterward. */
  stopTimer(viewer: User, timeEntryId: string): Promise<TimeEntryWithUser>;
  /** Pauses a running timer — finalized like `stopTimer`, but flagged resumable. */
  pauseTimer(viewer: User, timeEntryId: string): Promise<TimeEntryWithUser>;
  /** Resumes a paused entry — auto-pauses whatever the viewer has running elsewhere, then starts a new entry on the paused entry's own task, chained to it so elapsed time can display continuously across the pause. */
  resumeTimer(viewer: User, pausedEntryId: string): Promise<TimeEntryWithUser>;
  createManualEntry(
    viewer: User,
    taskId: string,
    input: ManualTimeEntryInput
  ): Promise<TimeEntryWithUser>;
}
