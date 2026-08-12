import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskPriority } from "@/lib/data/types";

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 3, high: 2, medium: 1, low: 0 };

/**
 * The single most urgent open task to start with today — most-overdue first, else the
 * highest-priority task with the soonest due date. Returns `null` whenever there's a tie at the top
 * (two tasks equally overdue, or equally top-priority with the same due date) rather than picking an
 * arbitrary "winner" — the "start here" cue is only worth showing when there's a genuinely clear one.
 */
export function findFocusTask(tasks: TaskWithRelations[], today: string): TaskWithRelations | null {
  const open = tasks.filter((t) => t.status !== "done");
  if (open.length === 0) return null;

  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  if (overdue.length > 0) {
    const sorted = [...overdue].sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    if (sorted.length > 1 && sorted[0].dueDate === sorted[1].dueDate) return null;
    return sorted[0];
  }

  const topRank = Math.max(...open.map((t) => PRIORITY_RANK[t.priority]));
  const topPriority = open.filter((t) => PRIORITY_RANK[t.priority] === topRank);
  const sorted = [...topPriority].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
  if (sorted.length > 1 && (sorted[0].dueDate ?? null) === (sorted[1].dueDate ?? null)) return null;
  return sorted[0];
}
