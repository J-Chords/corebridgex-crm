"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { NotificationType } from "@/lib/data/types";
import { ALL_NOTIFICATION_TYPES } from "@/lib/data/notification-labels";

function storageKey(userId: string) {
  return `corebridge-notification-prefs-${userId}`;
}

function defaults(): Record<NotificationType, boolean> {
  return Object.fromEntries(ALL_NOTIFICATION_TYPES.map((t) => [t, true])) as Record<NotificationType, boolean>;
}

function readPrefs(userId: string): Record<NotificationType, boolean> {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

/**
 * In-app feed preferences, per notification type — saved to this browser only, since there's no
 * user-preferences table on the backend yet (same "note what's real" treatment as Settings' Profile
 * section). Filters what `useNotifications` surfaces; every call site sits behind the dashboard's
 * auth guard, so `user` is always resolved by the time this hook first renders.
 */
export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Record<NotificationType, boolean>>(() =>
    user ? readPrefs(user.id) : defaults()
  );

  const setPreference = useCallback(
    (type: NotificationType, enabled: boolean) => {
      if (!user) return;
      setPreferences((prev) => {
        const next = { ...prev, [type]: enabled };
        window.localStorage.setItem(storageKey(user.id), JSON.stringify(next));
        return next;
      });
    },
    [user]
  );

  return { preferences, setPreference };
}
