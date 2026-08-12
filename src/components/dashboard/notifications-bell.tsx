"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "@/lib/data/hooks/use-notifications";
import { notificationHref } from "@/lib/data/notification-links";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export function NotificationsBell() {
  const { notifications, markRead, markAllRead } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label={`Notifications (${unreadCount} unread)`} />
        }
      >
        <span className="relative inline-flex">
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  markAllRead();
                }}
              >
                <CheckCheck className="size-3" aria-hidden="true" /> Mark all read
              </button>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.slice(0, 8).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                render={<Link href={notificationHref(notification)} />}
                onClick={() => {
                  if (!notification.read) markRead(notification.id);
                }}
              >
                <div className="flex w-full items-start gap-2">
                  {!notification.read && (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className={notification.read ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
                      {notification.message}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</span>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
