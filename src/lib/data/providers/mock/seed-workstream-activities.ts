import type { WorkstreamActivity } from "../../types";
import { seedWorkstreams } from "./seed-workstreams";
import { seedDepartments } from "./seed-departments";
import { seedActivities } from "./seed-activities";

/**
 * Deterministic legacy backfill. `useWorkstreamActivities` no longer falls back to the whole
 * service catalog when a workstream has zero persisted associations — zero now always means zero,
 * with no runtime ambiguity between "genuinely configured empty" and "predates this feature." So
 * every existing seeded workstream needs its OLD effective scope made explicit here instead: for
 * each one that has both a `serviceLineId` and a matching department for its own brand, every one
 * of that department's activities is seeded as a real association — reproducing exactly what the
 * old brand+serviceLine-scoped picker always implicitly showed it, nothing narrower and nothing
 * invented. This is necessarily a superset of every activityId any of that workstream's existing
 * tasks already reference, since those activities are themselves members of the same department.
 *
 * A workstream whose brand/service has no matching department at all (every brand except Sparing
 * Consulting today) or no service line (e.g. Internal Operations) gets zero rows here — there is
 * genuinely nothing to associate, which is the correct, honest state under the new explicit
 * semantics, not a gap to fill.
 */
function matchingDepartment(brandId: string, serviceLineId: string | null) {
  if (!serviceLineId) return undefined;
  return seedDepartments.find((d) => d.brandId === brandId && d.serviceLineId === serviceLineId);
}

function activitiesForDepartment(departmentId: string): string[] {
  return seedActivities.filter((a) => a.departmentId === departmentId).map((a) => a.id);
}

export const seedWorkstreamActivities: WorkstreamActivity[] = seedWorkstreams.flatMap((workstream) => {
  const department = matchingDepartment(workstream.brandId, workstream.serviceLineId);
  if (!department) return [];
  return activitiesForDepartment(department.id).map((activityId) => ({ workstreamId: workstream.id, activityId }));
});
