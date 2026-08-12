export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  startTime: string;
  /** Null while the timer is running. Only one running entry allowed per user. */
  endTime: string | null;
  /** Null iff this entry is a currently-running timer — this is the "is it running" signal. */
  durationMinutes: number | null;
  notes: string | null;
  /** Defaults true; work logged against the Internal/Non-billable company defaults false. */
  billable: boolean;
  /** True when this entry was closed by Pause — or by auto-pause when a different timer started — rather than an explicit Stop. Controls whether "Resume" is offered for it. Meaningless while still running. */
  pausedForResume: boolean;
  /** Set only on an entry created by Resume — points at the task's own last paused entry, chaining a "working session" across pause boundaries so elapsed time displays continuously. Null for a fresh Start or a manual entry. */
  continuesFromEntryId: string | null;
}
