import type { TimeEntriesProvider } from "../time-entries-provider";

const notImplemented = (): never => {
  throw new Error("supabaseTimeEntriesProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockTimeEntriesProvider, no screen changes needed to swap. */
export const supabaseTimeEntriesProvider: TimeEntriesProvider = {
  listTimeEntriesForTask: notImplemented,
  listMyTimeEntries: notImplemented,
  listTimeEntriesForDate: notImplemented,
  getRunningTimer: notImplemented,
  getPausedTimer: notImplemented,
  startTimer: notImplemented,
  stopTimer: notImplemented,
  pauseTimer: notImplemented,
  resumeTimer: notImplemented,
  createManualEntry: notImplemented,
  correctTimeEntry: notImplemented,
  listCorrectionsForTimeEntry: notImplemented,
};
