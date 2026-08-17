import type { ActivityCatalogProvider, DepartmentWithActivities } from "../activity-catalog-provider";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Activity Catalog provider. Ungated reference data (departments/activities have an
 * unconditional `using (true)` SELECT policy, same treatment as brands/service_lines) — no viewer
 * argument needed, mirroring the mock's own ungated `listDepartments`.
 */
export const supabaseActivityCatalogProvider: ActivityCatalogProvider = {
  async listDepartments(brandId, serviceLineId) {
    const supabase = createClient();
    let departmentsQuery = supabase.from("departments").select("*").order("position");
    if (brandId) departmentsQuery = departmentsQuery.eq("brand_id", brandId);
    if (serviceLineId) departmentsQuery = departmentsQuery.eq("service_line_id", serviceLineId);
    const { data: departmentRows, error: departmentsError } = await departmentsQuery;
    if (departmentsError) throw new Error(departmentsError.message);

    const departmentIds = (departmentRows ?? []).map((d) => d.id);
    const activitiesRes = departmentIds.length
      ? await supabase.from("activities").select("*").in("department_id", departmentIds).order("position")
      : { data: [] as { id: string; department_id: string; name: string; position: number; default_task_titles: string[] }[] };
    if ("error" in activitiesRes && activitiesRes.error) throw new Error(activitiesRes.error.message);

    const activities = (activitiesRes.data ?? []) as {
      id: string;
      department_id: string;
      name: string;
      position: number;
      default_task_titles: string[];
    }[];

    return (departmentRows ?? []).map(
      (d): DepartmentWithActivities => ({
        id: d.id,
        brandId: d.brand_id,
        name: d.name,
        position: d.position,
        serviceLineId: d.service_line_id,
        activities: activities
          .filter((a) => a.department_id === d.id)
          .map((a) => ({ id: a.id, departmentId: a.department_id, name: a.name, position: a.position, defaultTaskTitles: a.default_task_titles })),
      })
    );
  },
};
