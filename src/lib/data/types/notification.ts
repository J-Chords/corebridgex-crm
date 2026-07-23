export type NotificationType = "self-added-task" | "task-assigned" | "task-status-changed";

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  message: string;
  relatedTaskId: string | null;
  read: boolean;
  createdAt: string;
}
