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

/**
 * One append-only record of a Supervisor/Superadmin correcting another person's completed
 * `TimeEntry` — never edited or deleted, so a second correction of the same entry adds a new row
 * rather than overwriting this one. `previousDurationMinutes` is whatever the entry's own
 * `durationMinutes` was at the moment of *this* correction, not necessarily the entry's original
 * value — chaining several corrections in order reconstructs the full history even though the
 * entry itself only ever holds the current, corrected duration. Naming mirrors
 * `AccomplishmentsReportHistoryEvent`'s `actorId`/`actorName`/`createdAt` snapshot convention.
 */
export interface TimeEntryCorrection {
  id: string;
  timeEntryId: string;
  /** Snapshotted from the entry's own `userId` — makes a correction record self-describing without a join. */
  employeeUserId: string;
  previousDurationMinutes: number;
  correctedDurationMinutes: number;
  reason: string;
  correctedById: string;
  /** Snapshotted display name. */
  correctedByName: string;
  correctedAt: string;
}
