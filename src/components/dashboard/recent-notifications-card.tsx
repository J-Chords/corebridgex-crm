"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import type { AppNotification } from "@/lib/data/types";
import { useNotifications } from "@/lib/data/hooks/use-notifications";
import { notificationHref } from "@/lib/data/notification-links";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const MAX_ROWS = 5;
const MAX_FOCUS_ROWS = 30;

/** The viewer's own recent notification feed — reused by My Day and the dashboards; also where task handoffs to you surface, since handoffs push a "task-handoff" notification through this same feed. */
export function RecentNotificationsCard() {
  const [focusOpen, setFocusOpen] = useState(false);
  const { notifications, markRead, markAllRead } = useNotifications();

  function renderRow(notification: AppNotification, i: number) {
    return (
      <Link
        key={notification.id}
        href={notificationHref(notification)}
        onClick={() => {
          if (!notification.read) markRead(notification.id);
        }}
        className={cn(
          "-mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 hover:no-underline",
          STAGGER_ITEM_CLASS
        )}
        style={staggerDelay(i)}
      >
        {!notification.read && (
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        )}
        <div className="flex flex-col gap-0.5">
          <span className={notification.read ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
            {notification.message}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(notification.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </Link>
    );
  }

  const overflow = notifications.length - MAX_ROWS;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Recent notifications</CardTitle>
        <div className="flex items-center gap-1">
          {notifications.some((n) => !n.read) && (
            <Button size="sm" variant="ghost" onClick={() => markAllRead()}>
              <CheckCheck /> Mark all read
            </Button>
          )}
          <CardAction>
            <CardExpandButton onClick={() => setFocusOpen(true)} label="Expand Recent Notifications" />
          </CardAction>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <>
            {notifications.slice(0, MAX_ROWS).map(renderRow)}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setFocusOpen(true)}
                className="mt-1 self-start text-xs font-medium text-primary hover:underline"
              >
                +{overflow} more
              </button>
            )}
          </>
        )}
      </CardContent>

      <DashboardWidgetFocusDialog
        open={focusOpen}
        onOpenChange={setFocusOpen}
        title="Recent Notifications"
        description={`${notifications.length} notification${notifications.length === 1 ? "" : "s"}`}
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <>
            {notifications.slice(0, MAX_FOCUS_ROWS).map(renderRow)}
            {notifications.length > MAX_FOCUS_ROWS && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Showing the first {MAX_FOCUS_ROWS} of {notifications.length}.
              </p>
            )}
          </>
        )}
      </DashboardWidgetFocusDialog>
    </Card>
  );
}
