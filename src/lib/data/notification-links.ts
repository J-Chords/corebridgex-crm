import type { AppNotification } from "./types";

/** Where clicking a notification should navigate — every type but the two report-comment kinds is task-related. */
export function notificationHref(notification: AppNotification): string {
  if (notification.type === "report-comment" && notification.relatedReportId) {
    return `/dashboard/reports/${notification.relatedReportId}`;
  }
  if (notification.type === "client-report-comment" && notification.relatedClientReportId) {
    return `/dashboard/reports/client/${notification.relatedClientReportId}`;
  }
  return `/dashboard/tasks/${notification.relatedTaskId}`;
}
