"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { notificationsProvider } from "@/lib/data/providers";
import { useNotificationPreferences } from "@/lib/data/hooks/use-notification-preferences";
import type { AppNotification } from "@/lib/data/types";

export function useNotifications() {
  const { user } = useAuth();
  const { preferences } = useNotificationPreferences();
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await notificationsProvider.listNotifications(user);
    setAllNotifications(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function markRead(notificationId: string) {
    if (!user) return;
    await notificationsProvider.markNotificationRead(user, notificationId);
    await refresh();
  }

  async function markAllRead() {
    if (!user) return;
    await notificationsProvider.markAllNotificationsRead(user);
    await refresh();
  }

  // Preferences only hide a type from this feed/bell — they never stop the underlying record from
  // being created or block markRead/markAllRead, which still operate on the full unfiltered set.
  const notifications = allNotifications.filter((n) => preferences[n.type] !== false);

  return { notifications, isLoading, refresh, markRead, markAllRead };
}
