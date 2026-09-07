import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";

/**
 * Phase 12B — pure presentation helpers pulled out of `TaskGridCard`/`TaskSummaryItem`/
 * `tasks/page.tsx`'s own local copies (Phase 12A's baseline audit flagged this exact
 * triplication). No behavior change: same overdue rule, same due-date format, same
 * Service/Client fallback logic every one of those files already used.
 */
/** OPEN = Not Started/In Progress/Waiting/Blocked; CLOSED = Completed/Canceled — a Canceled or
 * Completed task is never overdue, matching the locked six-status model's semantic rules. */
export function isTaskClosed(status: Pick<TaskWithRelations, "status">["status"]): boolean {
  return status === "completed" || status === "canceled";
}

export function isTaskOverdue(task: Pick<TaskWithRelations, "status" | "dueDate">): boolean {
  return !isTaskClosed(task.status) && task.dueDate != null && task.dueDate < new Date().toISOString().slice(0, 10);
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

/**
 * Phase 13B final polish — an Assignee column/header is only genuinely redundant for an Employee
 * viewer when EVERY currently-displayed Task is assigned to exactly them and no one else — a
 * self-added, self-assigned Task, or one where the viewer is the sole assignee. An unassigned Task
 * (still "—" but meaningfully different from "assigned to me") or a Task shared with a coworker
 * still carries real information, so the column stays. Never called for Supervisor/Superadmin —
 * they always keep the column (need to tell their own work apart from their team's).
 */
export function isAssigneeColumnRedundantForViewer(tasks: Pick<TaskWithRelations, "assignees">[], viewerId: string): boolean {
  return tasks.every((t) => t.assignees.length === 1 && t.assignees[0].id === viewerId);
}
