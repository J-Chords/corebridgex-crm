"use client";

import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { useNotifications } from "@/lib/data/hooks/use-notifications";
import { notificationHref } from "@/lib/data/notification-links";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

/** The viewer's own recent notification feed — reused by My Day and the dashboards; also where task handoffs to you surface, since handoffs push a "task-handoff" notification through this same feed. */
export function RecentNotificationsCard() {
  const { notifications, markRead, markAllRead } = useNotifications();

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Recent notifications</CardTitle>
        {notifications.some((n) => !n.read) && (
          <Button size="sm" variant="ghost" onClick={() => markAllRead()}>
            <CheckCheck /> Mark all read
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          notifications.slice(0, 5).map((notification, i) => (
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
