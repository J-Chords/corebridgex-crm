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

/**
 * Project Level Part 12 — the read-only "Global Service Staffing" lookup any legitimate Project
 * viewer uses (via `getStaffingForServiceLines`, not the Admin-only `listServiceStaffing`).
 * `serviceLineIds` should be a stable, deduped array (callers typically derive it with `useMemo`).
 */
export function useServiceLineStaffing(serviceLineIds: string[]) {
  const { user } = useAuth();
  const [staffing, setStaffing] = useState<ServiceStaffing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const key = serviceLineIds.join(",");

  const refresh = useCallback(async () => {
    if (!user || serviceLineIds.length === 0) {
      setStaffing([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const result = await serviceMembershipProvider.getStaffingForServiceLines(user, serviceLineIds);
    setStaffing(result);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, key]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { staffing, isLoading, refresh };
}
