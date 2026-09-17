"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AppNotification } from "@/lib/data/types";
import { useNotifications } from "@/lib/data/hooks/use-notifications";
import { notificationHref } from "@/lib/data/notification-links";
import { Button } from "@/components/ui/button";
import { NotificationContent, NotificationsEmptyState } from "@/components/dashboard/notification-display";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const MAX_ROWS = 5;
const MAX_FOCUS_ROWS = 30;

/**
 * The viewer's own recent notification feed — reused as-is by every Dashboard; also where task
 * handoffs to you surface, since handoffs push a "task-handoff" notification through this same
 * feed. Visual language deliberately borrowed from the Project workspace's own Services list
 * (`ServiceRow` in `dashboard/projects/[id]/page.tsx`) — a stack of independently-bordered mini-
 * cards, not one big enclosing panel — rather than inventing a new pattern for a second bounded
 * list. A row only becomes a real link when `notificationHref` resolves an actual destination the
 * viewer can reach — see that function's own comment for why (e.g. a "report-comment" notification's
 * target page is Superadmin-only, so a Team Lead/Employee recipient sees the same row as plain,
 * informational content rather than a dead-end link).
 */
export function RecentNotificationsCard() {
  const { user } = useAuth();
  const [focusOpen, setFocusOpen] = useState(false);
  const { notifications, markRead, markAllRead } = useNotifications();

  if (!user) return null;

  function renderNotification(notification: AppNotification, i: number) {
    // Safe: renderNotification is only ever invoked below, after the `if (!user) return null;` guard above.
    const href = notificationHref(notification, user!);
    const clickable = Boolean(href);

    const outerClassName = cn(
      "rounded-lg ring-1 ring-foreground/10 transition-colors",
      notification.read ? "bg-card" : "bg-primary/5",
      clickable && "hover:bg-muted/40 focus-within:bg-muted/40",
      STAGGER_ITEM_CLASS
    );
    const innerClassName = "group/row flex items-start gap-3 rounded-lg px-3 py-2.5 outline-none";
    const content = <NotificationContent notification={notification} clickable={clickable} />;

    if (!href) {
      return (
        <div key={notification.id} className={outerClassName} style={staggerDelay(i)}>
          <div className={cn(innerClassName, "cursor-default")}>{content}</div>
        </div>
      );
    }

    return (
      <div key={notification.id} className={outerClassName} style={staggerDelay(i)}>
        <Link
          href={href}
          onClick={() => {
            if (!notification.read) markRead(notification.id);
          }}
          className={cn(innerClassName, "hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/50")}
        >
          {content}
        </Link>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const overflow = notifications.length - MAX_ROWS;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-medium">Notifications</h2>
          <p className="text-sm text-muted-foreground">Stay updated on changes that affect your work.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unreadCount > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {unreadCount} unread
            </span>
          )}
          <CardExpandButton onClick={() => setFocusOpen(true)} label="Expand Notifications" />
        </div>
      </div>

      {notifications.length === 0 ? (
        <NotificationsEmptyState />
      ) : (
        <>
          <div className="flex flex-col gap-2">{notifications.slice(0, MAX_ROWS).map(renderNotification)}</div>
          {(unreadCount > 0 || overflow > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {unreadCount > 0 ? (
                <Button size="sm" variant="ghost" className="-ml-2" onClick={() => markAllRead()}>
                  <CheckCheck /> Mark all read
                </Button>
              ) : (
                <span />
              )}
              {overflow > 0 && (
                <button
                  type="button"
                  onClick={() => setFocusOpen(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all notifications ({overflow} more)
                </button>
              )}
            </div>
          )}
        </>
      )}

      <DashboardWidgetFocusDialog
        open={focusOpen}
        onOpenChange={setFocusOpen}
        title="Notifications"
        description={`${notifications.length} notification${notifications.length === 1 ? "" : "s"}`}
      >
        {notifications.length === 0 ? (
          <NotificationsEmptyState />
        ) : (
          <>
            {notifications.slice(0, MAX_FOCUS_ROWS).map(renderNotification)}
            {notifications.length > MAX_FOCUS_ROWS && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Showing the first {MAX_FOCUS_ROWS} of {notifications.length}.
              </p>
            )}
          </>
        )}
      </DashboardWidgetFocusDialog>
    </div>
  );
}
