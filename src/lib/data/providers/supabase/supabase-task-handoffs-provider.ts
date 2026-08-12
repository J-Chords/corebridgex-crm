import type { TaskHandoffsProvider } from "../task-handoffs-provider";

const notImplemented = (): never => {
  throw new Error("supabaseTaskHandoffsProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockTaskHandoffsProvider, no screen changes needed to swap. */
export const supabaseTaskHandoffsProvider: TaskHandoffsProvider = {
  listHandoffsForTask: notImplemented,
  listHandoffCandidates: notImplemented,
  createHandoff: notImplemented,
  acknowledgeHandoff: notImplemented,
  listRecentHandoffs: notImplemented,
};
