/**
 * Each brand owns its own catalog independently — a Department always belongs
 * to exactly one brand, never shared/inherited across brands. Only Sparing
 * Consulting is seeded today; the other partner brands start with zero rows
 * but the structure already supports them.
 */
export interface Department {
  id: string;
  brandId: string;
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
  /** Display order within the department. */
  position: number;
  /** Quick-start task titles an admin curated for this activity — offered as one-click adds from the workstream detail page. Title-only by design, same "dead simple" precedent as the keyword-suggestion feature; not a full Template. */
  defaultTaskTitles: string[];
}
