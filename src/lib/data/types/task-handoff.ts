/** A structured "where I left off" record passed between people on a task — not just a free-text note. */
export interface TaskHandoff {
  id: string;
  taskId: string;
  handedById: string;
  handedToId: string;
  workDone: string;
  workRemaining: string;
  blockers: string | null;
  createdAt: string;
  /** Both null until the recipient acknowledges. */
  acknowledgedById: string | null;
  acknowledgedAt: string | null;
}
