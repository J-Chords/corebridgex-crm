/**
 * Phase 3 (CD-208) — `brandId` is null for the canonical, Brand-independent Department that scopes
 * a Service Line's Activity structure going forward (canonical Template Activities no longer
 * depend on Brand at all). A non-null `brandId` marks a legacy, historical per-Brand Department,
 * preserved but no longer the source canonical flows read from.
 */
export interface Department {
  id: string;
  brandId: string | null;
  name: string;
  /** Display order within the brand. */
  position: number;
  /**
   * Null when this department isn't tied to one particular client service — a workstream with no
   * service line set (or whose service line has no matching department) still sees this department's
   * activities as part of its brand's catalog. When a workstream's service line DOES match a
   * department's own serviceLineId, the activity picker narrows to just that department instead of
   * the whole brand — see `ActivityCatalogProvider.listDepartments`.
   */
  serviceLineId: string | null;
}

export interface Activity {
  id: string;
  departmentId: string;
  name: string;
  /** Catalog metadata (Activity Level) — null description is a valid "not written yet" state. */
  description: string | null;
  /** Display order within the department. */
  position: number;
  /** Quick-start task titles an admin curated for this activity — offered as one-click adds from the workstream detail page. Title-only by design, same "dead simple" precedent as the keyword-suggestion feature; not a full Template. */
  defaultTaskTitles: string[];
  /** Inactive Activities stay referentially intact (historical Tasks/Project Services keep
   * pointing at them) but must not be offered as a new configuration/Task choice — see callers,
   * which filter to active-only for new-choice pickers while preserving an already-selected
   * inactive Activity wherever it's already attached. */
  isActive: boolean;
  /** Null only for an Activity that predates this column (seed/legacy data) — never fabricate a
   * creator for those; show a truthful "legacy — creator not recorded" state instead. */
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
