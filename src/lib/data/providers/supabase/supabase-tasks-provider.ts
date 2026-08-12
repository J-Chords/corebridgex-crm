import type { TasksProvider } from "../tasks-provider";

const notImplemented = (): never => {
  throw new Error("supabaseTasksProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockTasksProvider, no screen changes needed to swap. */
export const supabaseTasksProvider: TasksProvider = {
  listTasks: notImplemented,
  getTask: notImplemented,
  createTask: notImplemented,
  updateTask: notImplemented,
  updateTaskStatus: notImplemented,
  toggleChecklistItem: notImplemented,
  listPastTasksForActivity: notImplemented,
};
