"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { adminUsersProvider } from "@/lib/data/providers";
import type { AdminUserRow } from "@/lib/data/providers/admin-users-provider";
import { canManageAdminUsers } from "@/lib/data/permissions";

/**
 * Acceptance-hardening fix — this hook previously fired `adminUsersProvider.listUsers(user)`
 * for ANY signed-in user, relying entirely on the page's own useEffect redirect to steer a
 * Team Lead/Employee away in time. The provider call's Admin-only check throws, but nothing at
 * the call site awaited/caught it, producing an unhandled promise rejection merely from opening
 * `/dashboard/admin/users` by direct URL — before the redirect had a chance to run. The hook now
 * skips the fetch entirely unless the viewer is actually an Admin; the redirect stays purely a
 * UX/defense-in-depth concern, never the real boundary (the provider/RPC still enforce it).
 */
export function useAdminUsers() {
  const { user } = useAuth();
  const authorized = !!user && canManageAdminUsers(user);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [isLoadingInternal, setIsLoadingInternal] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !canManageAdminUsers(user)) return;
    setIsLoadingInternal(true);
    const result = await adminUsersProvider.listUsers(user);
    setUsers(result);
    setIsLoadingInternal(false);
  }, [user]);

  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [authorized, refresh]);

  // Computed at render time (never via effect-triggered setState) — unauthorized is never "loading".
  return { users, isLoading: authorized && isLoadingInternal, refresh };
}
