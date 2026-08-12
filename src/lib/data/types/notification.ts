export type NotificationType =
  | "self-added-task"
  | "task-assigned"
  | "task-status-changed"
  | "task-handoff"
  | "report-comment"
  | "client-report-comment";

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  message: string;
  relatedTaskId: string | null;
  /** Set only for type "report-comment" — the report to deep-link to. */
  relatedReportId: string | null;
  /** Set only for type "client-report-comment" — the client report to deep-link to. */
  relatedClientReportId: string | null;
  read: boolean;
  createdAt: string;
}
