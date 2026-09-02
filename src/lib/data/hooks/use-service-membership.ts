"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { serviceMembershipProvider } from "@/lib/data/providers";
import type { ServiceStaffing } from "@/lib/data/types";
import { canManageAdminUsers } from "@/lib/data/permissions";

/** Acceptance-hardening fix — same unhandled-rejection-on-direct-URL-access issue as
 * useAdminUsers; see its own comment for the full explanation. */
export function useServiceStaffing() {
  const { user } = useAuth();
  const authorized = !!user && canManageAdminUsers(user);
  const [staffing, setStaffing] = useState<ServiceStaffing[]>([]);
  const [isLoadingInternal, setIsLoadingInternal] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !canManageAdminUsers(user)) return;
    setIsLoadingInternal(true);
    const result = await serviceMembershipProvider.listServiceStaffing(user);
    setStaffing(result);
    setIsLoadingInternal(false);
  }, [user]);

  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [authorized, refresh]);

  // Computed at render time (never via effect-triggered setState) — unauthorized is never "loading".
  return { staffing, isLoading: authorized && isLoadingInternal, refresh };
}
