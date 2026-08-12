"use client";

import { useCallback, useEffect, useState } from "react";
import { activityCatalogProvider } from "@/lib/data/providers";
import type { DepartmentWithActivities } from "@/lib/data/providers/activity-catalog-provider";

/**
 * Omit brandId for the full cross-brand tree; pass it to scope to one brand. Pass serviceLineId too
 * to narrow to one workstream's own service (e.g. the task form's activity picker) — see
 * `ActivityCatalogProvider.listDepartments` for the exact fallback rule.
 */
export function useActivityCatalog(brandId?: string, serviceLineId?: string) {
  const [departments, setDepartments] = useState<DepartmentWithActivities[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const result = await activityCatalogProvider.listDepartments(brandId, serviceLineId);
    setDepartments(result);
    setIsLoading(false);
  }, [brandId, serviceLineId]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { departments, isLoading, refresh };
}
