export type TaskStatus =
  | "todo"
  | "in-progress"
  | "blocked"
  | "waiting-on-client"
  | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** How the tasks list view clusters an already-filtered list — orthogonal to filtering, never narrows which tasks show. */
export type TaskGroupBy = "none" | "project" | "company" | "activity" | "workstream" | "status" | "assignee";

export interface Task {
  id: string;
  title: string;
  description: string;
  companyId: string;
  /** Every task belongs to a workstream; companyId above is a denormalized copy of workstream.companyId, synced by the provider — never independently editable. */
  workstreamId: string;
  /**
   * Phase 10 — null for a normal top-level Task; another Task's id for a Subtask, nested exactly
   * one level under it (never deeper — a Task whose own `parentTaskId` is set can never itself be a
   * parent). Immutable once set (or left null) at creation: never re-parented, promoted to
   * top-level, or converted from an existing top-level Task afterward. A Subtask always inherits
   * its parent's `companyId`/`workstreamId`/`activityId` exactly — enforced server-side, never
   * independently editable on a Subtask.
   */
  parentTaskId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  /** Normalized to minutes regardless of which unit (minutes/hours/days) it was entered in — see `src/lib/data/expected-time.ts`. For later profitability reporting. Set automatically from the template when created via "Apply template"; editable directly otherwise. */
  expectedMinutes: number | null;
  createdById: string;
  /** True if created via employee self-add (goes live immediately, no approval). */
  selfAdded: boolean;
  templateId: string | null;
  relatedContactId: string | null;
  /** Optional tag into the brand's Activity Catalog — never required, work is never blocked for lack of one. */
  activityId: string | null;
  recurrenceRule: string | null;
  /** Who last changed `status`, and when — feeds the "who did what, by whom" report (Phase 2). */
  statusChangedById: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Join row: a task can have multiple assignees. */
export interface TaskAssignee {
  taskId: string;
  userId: string;
}
