import type { ActivityCatalogProvider, ActivityInput, DepartmentWithActivities } from "../activity-catalog-provider";
import type { Activity } from "../../types";
import { createClient } from "@/lib/supabase/client";

interface ActivityRow {
  id: string;
  department_id: string;
  name: string;
  description: string | null;
  position: number;
  default_task_titles: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    description: row.description,
    position: row.position,
    defaultTaskTitles: row.default_task_titles,
    isActive: row.is_active,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Real Supabase Activity Catalog provider. `listDepartments` stays ungated reference data
 * (departments/activities have an unconditional `using (true)` SELECT policy, same treatment as
 * brands/service_lines) — no viewer argument needed there, mirroring the mock's own ungated read.
 * The catalog-management methods below are Admin-only RPCs (`admin_update_activity`/
 * `admin_set_activity_active`/`admin_delete_activity`) — the real access boundary is server-side
 * (`is_superadmin()` inside each function), never a client-side check.
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
      : { data: [] as ActivityRow[] };
    if ("error" in activitiesRes && activitiesRes.error) throw new Error(activitiesRes.error.message);

    const activities = ((activitiesRes.data ?? []) as ActivityRow[]).map(toActivity);

    return (departmentRows ?? []).map(
      (d): DepartmentWithActivities => ({
        id: d.id,
        brandId: d.brand_id,
        name: d.name,
        position: d.position,
        serviceLineId: d.service_line_id,
        activities: activities.filter((a) => a.departmentId === d.id),
      })
    );
  },

  async updateActivity(_viewer, id, input: ActivityInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_update_activity", {
      p_id: id,
      p_name: input.name,
      p_description: input.description,
      p_default_task_titles: input.defaultTaskTitles,
    });
    if (error) throw new Error(error.message);
    return toActivity(data as ActivityRow);
  },

  async setActivityActive(_viewer, id, isActive) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_set_activity_active", {
      p_id: id,
      p_is_active: isActive,
    });
    if (error) throw new Error(error.message);
    return toActivity(data as ActivityRow);
  },

  async deleteActivity(_viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_activity", { p_id: id });
    if (error) throw new Error(error.message);
  },
};
