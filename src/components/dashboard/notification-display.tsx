import { ArrowRightLeft, Inbox, ListPlus, MessageSquare, RefreshCw, UserPlus } from "lucide-react";
import type { AppNotification, NotificationType } from "@/lib/data/types";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { cn } from "@/lib/utils";

/** One icon per notification type — same "Style E — Contained" icon-tile convention `TeamActivityCard` already uses for its own feed, so activity-style surfaces read as one consistent design language. Shared by the Dashboard notification stack and the top-bar bell dropdown. */
export const NOTIFICATION_ICON: Record<NotificationType, typeof RefreshCw> = {
  "self-added-task": ListPlus,
  "task-assigned": UserPlus,
  "task-status-changed": RefreshCw,
  "task-handoff": ArrowRightLeft,
  "report-comment": MessageSquare,
  "client-report-comment": MessageSquare,
};

/** Short, type-derived label — never parsed out of the free-text `message`, which always stays intact as its own line. */
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  "self-added-task": "Task added",
  "task-assigned": "Assigned to you",
  "task-status-changed": "Status changed",
  "task-handoff": "Task handed off",
  "report-comment": "Comment added",
  "client-report-comment": "Comment added",
};

export function formatNotificationDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationsEmptyState() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
      <Inbox className="size-4 shrink-0" aria-hidden="true" />
      No notifications yet — you&apos;ll see updates here as they happen.
    </div>
  );
}

/**
 * Icon + type label + message + date + unread dot — the shared visual content for one
 * notification. `clickable` only changes the hover-underline affordance on the message; the
 * surrounding wrapper (a bordered mini-card, or a compact bell dropdown row) decides its own
 * layout/spacing, but every surface renders this same content so the two never drift apart.
 * Deliberately two lines, not three: the real message already carries its own subject/object
 * (e.g. "Sam Torres added a new task: ...") and the notification data has no separate,
 * safely-resolvable field (company/project/service) to justify a fabricated third line.
 */
export function NotificationContent({ notification, clickable }: { notification: AppNotification; clickable: boolean }) {
  const Icon = NOTIFICATION_ICON[notification.type];
  return (
    <>
      <ContainedIcon size="sm" tone="neutral" className="mt-0.5 shrink-0">
        <Icon aria-hidden="true" />
      </ContainedIcon>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {NOTIFICATION_TYPE_LABEL[notification.type]}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{formatNotificationDate(notification.createdAt)}</span>
            {!notification.read && <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />}
          </span>
        </div>
        <span
          className={cn(
            "text-sm",
            clickable && "group-hover/row:underline",
            notification.read ? "text-muted-foreground" : "font-medium text-foreground"
          )}
        >
          {notification.message}
        </span>
      </div>
    </>
  );
}
