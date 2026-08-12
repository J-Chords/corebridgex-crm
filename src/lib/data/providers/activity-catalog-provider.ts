import type { Activity, Department } from "../types";

export interface DepartmentWithActivities extends Department {
  activities: Activity[];
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Treated as ungated reference/lookup data — same as listBrands()/listServiceLines()
 * on CompaniesProvider — since it's just a catalog of standard activity names, not
 * sensitive content. A future catalog-management screen is where a view/edit
 * permission would get added, once that screen actually exists.
 */
export interface ActivityCatalogProvider {
  /**
   * Omit brandId for the full cross-brand tree; pass it to scope to one brand (e.g. the "+ Add
   * service"/"+ Add section" report dialogs, which browse a whole brand's catalog).
   *
   * Pass serviceLineId too to narrow further to one workstream's own service — e.g. the task form's
   * activity picker once a workstream is selected — matching the Client → Workstream (service) →
   * Activity → Task hierarchy. Only departments whose own `serviceLineId` matches are returned in
   * that case; a department with no `serviceLineId` set is excluded (nothing to match), not shown by
   * default. Omit serviceLineId (or pass a workstream with no service line of its own) to fall back
   * to the full brand catalog — you can't scope narrower than "brand" without a concrete service.
   */
  listDepartments(brandId?: string, serviceLineId?: string): Promise<DepartmentWithActivities[]>;
}
