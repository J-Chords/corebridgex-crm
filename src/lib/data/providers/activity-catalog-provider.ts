import type { Activity, Department, User } from "../types";

export interface DepartmentWithActivities extends Department {
  activities: Activity[];
}

export interface ActivityInput {
  name: string;
  description: string | null;
  defaultTaskTitles: string[];
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * `listDepartments` stays ungated reference/lookup data — same as listBrands()/listServiceLines()
 * on CompaniesProvider — since it's just a catalog of standard activity names, not sensitive
 * content. The Activity Level catalog-management methods below are Admin-only (mirroring
 * `ServiceLinesProvider`'s own create/update/setActive/delete shape) — each enforces this itself,
 * server-side, regardless of what the client sends.
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
  /** Name/description/Suggested Tasks only — never moves an Activity to a different Department/
   * Brand/Service Line (that scope is immutable once created; historical Tasks/Project Services
   * already reference this Activity's id). */
  updateActivity(viewer: User, id: string, input: ActivityInput): Promise<Activity>;
  setActivityActive(viewer: User, id: string, isActive: boolean): Promise<Activity>;
  /**
   * Hard-deletes only when the Activity has never been used anywhere (workstream_activities/tasks/
   * project_issues/project_template_activities) — proven explicitly, not merely inferred from a
   * cascade succeeding, since two of those relationships are ON DELETE CASCADE and would otherwise
   * silently destroy history instead of blocking the delete. Throws a friendly error directing to
   * `setActivityActive(id, false)` instead when any usage exists.
   */
  deleteActivity(viewer: User, id: string): Promise<void>;
}
