"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { serviceLinesProvider } from "@/lib/data/providers";
import type { ServiceLine } from "@/lib/data/types";
import { canManageAdminUsers } from "@/lib/data/permissions";

/** Service Level Phase B — the Admin catalog's own read (active + inactive), distinct from
 * `useCompanyLookups().serviceLines` (active-only picker data). Same unhandled-rejection-on-direct-
 * URL-access guard as `useServiceStaffing`/`useAdminUsers`. */
export function useServiceLineCatalog() {
  const { user } = useAuth();
  const authorized = !!user && canManageAdminUsers(user);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [isLoadingInternal, setIsLoadingInternal] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !canManageAdminUsers(user)) return;
    setIsLoadingInternal(true);
    const result = await serviceLinesProvider.listAll(user);
    setServiceLines(result);
    setIsLoadingInternal(false);
  }, [user]);

  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [authorized, refresh]);

  return { serviceLines, isLoading: authorized && isLoadingInternal, refresh };
}
