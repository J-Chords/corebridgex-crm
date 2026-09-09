import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { isProjectActiveForNewWork } from "@/lib/data/project-display";

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

/**
 * Boss-Aligned Project Status Restoration — a Task's own Project must be Active for the Task to
 * count toward "active operational work" (dashboard/My Day/Planner active/overdue/attention counts);
 * On Hold/Completed/Canceled/Archived/Trash all exclude it, even though its own history stays fully
 * readable everywhere else (Project detail, Task detail, reports, time). A Task with no Project
 * link at all (legacy data) is never excluded on that technicality. Reuses the same
 * `isProjectActiveForNewWork` rule the authoritative create-Task/create-Service guards use, so the
 * two "must be Active" concerns (new work vs. active-work visibility) never drift apart.
 */
export function isTaskInActiveProject(task: Pick<TaskWithRelations, "workstream">): boolean {
  return isProjectActiveForNewWork(task.workstream.projectStatus);
}

/**
 * The one shared "does this Task count as active operational work" rule — open status AND its own
 * Project is Active. Every operational dashboard/My-Day/Planner active-work count should use this
 * instead of re-deriving `!isTaskClosed(...)` alone, so the Project-lifecycle exclusion can never be
 * silently forgotten at a new call site.
 */
export function isTaskActiveWork(task: Pick<TaskWithRelations, "status" | "workstream">): boolean {
  return !isTaskClosed(task.status) && isTaskInActiveProject(task);
}

export function formatDueDateShort(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Task Level Phase 2, Section 19 — the global Service name is always primary; falls back to the
 * Workstream's own stored name only for the rare Workstream with no Service Line set. */
export function taskServiceLabel(task: Pick<TaskWithRelations, "workstream">): string {
  return workstreamDisplayHeading(task.workstream.name, task.workstream.serviceLineName);
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
