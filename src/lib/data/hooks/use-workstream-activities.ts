"use client";

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
 *
 * Phase 3 (CD-208) — this used to cross-reference `workstream.activities`' ids against a fresh,
 * live fetch of the global catalog (`useActivityCatalog`) and return THOSE live objects, which
 * defeated the whole point of true Template snapshots: a later catalog Activity rename/edit would
 * still show up here even though `workstream.activities` itself was already correctly frozen. Now
 * this reads `workstream.activities` directly — no live catalog fetch at all — wrapped in one
 * synthetic "department" (a Workstream's own Activities all came from one Service Line's worth of
 * catalog structure; real Department grouping is a global-catalog-administration concern, not
 * something an already-applied Project-facing snapshot needs to reproduce).
 */
export function useWorkstreamActivities(workstream?: WorkstreamWithRelations) {
  const noop = () => {};
  if (!workstream || workstream.activities.length === 0) {
    return { departments: [] as DepartmentWithActivities[], isLoading: false, refresh: noop };
  }

  const departments: DepartmentWithActivities[] = [
    {
      id: workstream.id,
      brandId: null,
      name: workstream.serviceLine?.name ?? workstream.name,
      position: 0,
      serviceLineId: workstream.serviceLineId,
      activities: workstream.activities,
    },
  ];
  return { departments, isLoading: false, refresh: noop };
}
