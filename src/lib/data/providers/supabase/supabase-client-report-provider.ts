import type { ClientReportProvider } from "../client-report-provider";

const notImplemented = (): never => {
  throw new Error("supabaseClientReportProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockClientReportProvider, no screen changes needed to swap. */
export const supabaseClientReportProvider: ClientReportProvider = {
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
