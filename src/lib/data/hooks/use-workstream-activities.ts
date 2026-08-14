"use client";

import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import type { DepartmentWithActivities } from "@/lib/data/providers/activity-catalog-provider";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";

/**
 * The Activity Catalog scoped to what THIS workstream actually offers — the single source every
 * Activity picker (Task form, Quick Add, the workstream detail page's Activity groups) should read
 * from, instead of the whole brand/service catalog.
 *
 * `workstream.activities` (the persisted `WorkstreamActivity` join) is always authoritative — zero
 * rows means zero configured activities, full stop. There is deliberately NO generic "zero rows ->
 * fall back to the whole service catalog" branch here: that would make a genuinely-configured empty
 * selection indistinguishable from a workstream nobody has ever configured, which is exactly the
 * ambiguity this hook exists to avoid. Legacy compatibility instead comes from deterministic mock
 * seed backfilling (see `seed-workstream-activities.ts`), which gives every pre-existing workstream
 * an explicit, real set of rows reproducing its old effective scope — so by the time any screen
 * calls this hook, "zero" already means exactly what it says.
 */
export function useWorkstreamActivities(workstream?: WorkstreamWithRelations) {
  const { departments: allDepartments, isLoading, refresh } = useActivityCatalog(workstream?.brand.id, undefined);

  if (!workstream) {
    return { departments: [] as DepartmentWithActivities[], isLoading, refresh };
  }

  const enabledIds = new Set(workstream.activities.map((a) => a.id));
  const scoped = allDepartments
    .map((d) => ({ ...d, activities: d.activities.filter((a) => enabledIds.has(a.id)) }))
    .filter((d) => d.activities.length > 0);
  return { departments: scoped, isLoading, refresh };
}
