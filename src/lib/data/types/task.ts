export type TaskStatus =
  | "todo"
  | "in-progress"
  | "blocked"
  | "waiting-on-client"
  | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description: string;
  companyId: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdById: string;
  /** True if created via employee self-add (goes live immediately, no approval). */
  selfAdded: boolean;
  templateId: string | null;
  relatedContactId: string | null;
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
