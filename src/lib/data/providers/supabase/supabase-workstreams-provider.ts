import type { WorkstreamsProvider } from "../workstreams-provider";

const notImplemented = (): never => {
  throw new Error("supabaseWorkstreamsProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockWorkstreamsProvider, no screen changes needed to swap. */
export const supabaseWorkstreamsProvider: WorkstreamsProvider = {
  listWorkstreams: notImplemented,
  getWorkstream: notImplemented,
  createWorkstream: notImplemented,
  updateWorkstream: notImplemented,
};
