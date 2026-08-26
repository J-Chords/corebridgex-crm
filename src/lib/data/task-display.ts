import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";

/**
 * Phase 12B — pure presentation helpers pulled out of `TaskGridCard`/`TaskSummaryItem`/
 * `tasks/page.tsx`'s own local copies (Phase 12A's baseline audit flagged this exact
 * triplication). No behavior change: same overdue rule, same due-date format, same
 * Service/Client fallback logic every one of those files already used.
 */
export function isTaskOverdue(task: Pick<TaskWithRelations, "status" | "dueDate">): boolean {
  return task.status !== "done" && task.dueDate != null && task.dueDate < new Date().toISOString().slice(0, 10);
}

export function formatDueDateShort(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Service performed for" — Workstream is the user-facing Service value; falls back to the
 * Company name only for the rare workstream with no resolvable project context. */
export function taskServiceLabel(task: Pick<TaskWithRelations, "workstream">): string {
  return task.workstream.name;
}

/** Compact "Client · Activity"-style secondary line, omitting whichever part is unavailable. */
export function taskContextLine(task: Pick<TaskWithRelations, "company" | "workstream" | "activity">): string {
  const parts = [task.company.name, task.activity?.name].filter(Boolean) as string[];
  return parts.join(" · ");
}

/** Direct-child Subtask count/done-count for one parent Task, derived from an already-fetched
 * flattened task list — never a per-card fetch (the same N+1-avoidance convention `TaskBoard`'s
 * own Done-with-open-Subtasks check already uses). */
export function subtaskSummary(parentId: string, allTasks: TaskWithRelations[]): { total: number; done: number } {
  const children = allTasks.filter((t) => t.parentTaskId === parentId);
  return { total: children.length, done: children.filter((t) => t.status === "done").length };
}
