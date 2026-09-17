import type { AppNotification, User } from "./types";
import { isSuperadmin } from "./permissions";

/**
 * Where clicking a notification should navigate — every type but the two report-comment kinds is
 * task-related. Returns `null` when no safe destination exists, so the caller can render the row as
 * plain (non-navigable) informational content instead of a broken link:
 *
 * - `report-comment` targets `/dashboard/reports/[id]` (the legacy Accomplishments Report detail
 *   page), which Phase 11C gated to Superadmin-only for direct navigation — a Team Lead/Employee
 *   recipient (the report's own owner, who this notification is actually for) would hit that gate
 *   and dead-end. Only resolve this destination for a Superadmin viewer.
 * - Every other type is only resolvable when its own required id is actually present — a `null` id
 *   (a report/task deleted since the notification was created, or a malformed historical row) must
 *   never fall through into building a URL from a different type's `null` field (e.g.
 *   `/dashboard/tasks/null`), which was the app's actual bug: a broken-looking destination even
 *   though `/dashboard/tasks/[id]`'s own not-found handling never produces a true framework 404.
 */
export function notificationHref(notification: AppNotification, viewer: User): string | null {
  if (notification.type === "report-comment") {
    if (!notification.relatedReportId) return null;
    return isSuperadmin(viewer) ? `/dashboard/reports/${notification.relatedReportId}` : null;
  }
  if (notification.type === "client-report-comment") {
    return notification.relatedClientReportId ? `/dashboard/reports/client/${notification.relatedClientReportId}` : null;
  }
  // Remaining types (self-added-task, task-assigned, task-status-changed, task-handoff) are all task-related.
  return notification.relatedTaskId ? `/dashboard/tasks/${notification.relatedTaskId}` : null;
}
