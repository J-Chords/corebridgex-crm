import type { AccomplishmentsReportProvider } from "../accomplishments-report-provider";

const notImplemented = (): never => {
  throw new Error("supabaseAccomplishmentsReportProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockAccomplishmentsReportProvider, no screen changes needed to swap. */
export const supabaseAccomplishmentsReportProvider: AccomplishmentsReportProvider = {
  generateReport: notImplemented,
  listReports: notImplemented,
  listTrashedReports: notImplemented,
  getReport: notImplemented,
  updateDraft: notImplemented,
  finalizeReport: notImplemented,
  reopenReport: notImplemented,
  addComment: notImplemented,
  trashReport: notImplemented,
  restoreReport: notImplemented,
  permanentlyDeleteReport: notImplemented,
};
