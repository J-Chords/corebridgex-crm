import type { NotificationType } from "./types";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  "self-added-task": "Self-added tasks",
  "task-assigned": "Task assignments",
  "task-status-changed": "Task status changes",
  "task-handoff": "Task handoffs",
  "report-comment": "Report comments",
  "client-report-comment": "Client report comments",
};

export const NOTIFICATION_TYPE_DESCRIPTIONS: Record<NotificationType, string> = {
  "self-added-task": "A teammate self-added a task that went live immediately.",
  "task-assigned": "You were assigned to a task.",
  "task-status-changed": "A task you're involved with changed status.",
  "task-handoff": "Someone handed a task off to you.",
  "report-comment": "A supervisor or superadmin commented on your accomplishments report.",
  "client-report-comment": "A supervisor or superadmin commented on a client report you generated.",
};

export const ALL_NOTIFICATION_TYPES: NotificationType[] = Object.keys(
  NOTIFICATION_TYPE_LABELS
) as NotificationType[];
