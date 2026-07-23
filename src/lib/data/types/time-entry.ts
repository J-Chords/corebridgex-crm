export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  startTime: string;
  /** Null while the timer is running. Only one running entry allowed per user. */
  endTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
}
