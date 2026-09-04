import type { ServiceLinesProvider, ServiceLineInput } from "../service-lines-provider";
import type { Activity, ServiceLine } from "../../types";
import { canManageAdminUsers } from "../../permissions";
import { createClient } from "@/lib/supabase/client";

interface ServiceLineRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toServiceLine(row: ServiceLineRow): ServiceLine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseServiceLinesProvider: ServiceLinesProvider = {
  async listAll(viewer) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage the Service catalog.");
    }
    const supabase = createClient();
    const { data, error } = await supabase.from("service_lines").select("*").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map(toServiceLine);
  },

  async create(_viewer, input: ServiceLineInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_create_service_line", {
      p_name: input.name,
      p_description: input.description,
    });
    if (error) throw new Error(error.message);
    return toServiceLine(data as ServiceLineRow);
  },

  async update(_viewer, id, input: ServiceLineInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_update_service_line", {
      p_id: id,
      p_name: input.name,
      p_description: input.description,
    });
    if (error) throw new Error(error.message);
    return toServiceLine(data as ServiceLineRow);
  },

  async setActive(_viewer, id, isActive) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_set_service_line_active", {
      p_id: id,
      p_is_active: isActive,
    });
    if (error) throw new Error(error.message);
    return toServiceLine(data as ServiceLineRow);
  },

  async delete(_viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_service_line", { p_id: id });
    if (error) throw new Error(error.message);
  },

  async createActivity(_viewer, serviceLineId, brandId, name) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_create_activity_for_service_line", {
      p_service_line_id: serviceLineId,
      p_brand_id: brandId,
      p_name: name,
    });
    if (error) throw new Error(error.message);
    const row = data as { id: string; department_id: string; name: string; position: number; default_task_titles: string[] };
    return {
      id: row.id,
      departmentId: row.department_id,
      name: row.name,
      position: row.position,
      defaultTaskTitles: row.default_task_titles,
    } satisfies Activity;
  },
};
