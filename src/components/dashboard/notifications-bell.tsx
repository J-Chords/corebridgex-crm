"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNotifications } from "@/lib/data/hooks/use-notifications";
import { notificationHref } from "@/lib/data/notification-links";
import { Button } from "@/components/ui/button";
import { NotificationContent } from "@/components/dashboard/notification-display";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsBell() {
  const { user } = useAuth();
  const { notifications, markRead, markAllRead } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!user) return null;

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
            notifications.slice(0, 8).map((notification) => {
              const href = notificationHref(notification, user);
              return (
                <DropdownMenuItem
                  key={notification.id}
                  disabled={!href}
                  render={href ? <Link href={href} /> : undefined}
                  onClick={() => {
                    if (href && !notification.read) markRead(notification.id);
                  }}
                >
                  <div className={cn("flex w-full items-start gap-2", !href && "cursor-default")}>
                    <NotificationContent notification={notification} clickable={Boolean(href)} />
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
