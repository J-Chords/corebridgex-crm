import type { DailyUpdatesProvider } from "../daily-updates-provider";

const notImplemented = (): never => {
  throw new Error("supabaseDailyUpdatesProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockDailyUpdatesProvider, no screen changes needed to swap. */
export const supabaseDailyUpdatesProvider: DailyUpdatesProvider = {
  getMyTodayUpdate: notImplemented,
  listUpdatesForDate: notImplemented,
  updateEntryDetails: notImplemented,
  addManualEntry: notImplemented,
  confirmUpdate: notImplemented,
  reopenUpdate: notImplemented,
};
