import type { ServiceMembershipProvider } from "../service-membership-provider";
import type { ServiceStaffing } from "../../types";
import { canManageAdminUsers } from "../../permissions";
import { createClient } from "@/lib/supabase/client";

async function fetchStaffing(serviceLineId: string): Promise<ServiceStaffing> {
  const supabase = createClient();
  const [{ data: leads }, { data: members }] = await Promise.all([
    supabase.from("service_team_leads").select("user_id").eq("service_line_id", serviceLineId),
    supabase.from("service_employees").select("user_id").eq("service_line_id", serviceLineId),
  ]);
  return {
    serviceLineId,
    teamLeadUserIds: (leads ?? []).map((r) => r.user_id as string),
    employeeUserIds: (members ?? []).map((r) => r.user_id as string),
  };
}

export const supabaseServiceMembershipProvider: ServiceMembershipProvider = {
  async listServiceStaffing(viewer) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage Service staffing.");
    }
    const supabase = createClient();
    const [{ data: lines, error }, { data: leads }, { data: members }] = await Promise.all([
      supabase.from("service_lines").select("id"),
      supabase.from("service_team_leads").select("service_line_id, user_id"),
      supabase.from("service_employees").select("service_line_id, user_id"),
    ]);
    if (error) throw new Error(error.message);
    return (lines ?? []).map((line) => ({
      serviceLineId: line.id as string,
      teamLeadUserIds: (leads ?? [])
        .filter((r) => r.service_line_id === line.id)
        .map((r) => r.user_id as string),
      employeeUserIds: (members ?? [])
        .filter((r) => r.service_line_id === line.id)
        .map((r) => r.user_id as string),
    }));
  },

  async setTeamLeads(viewer, serviceLineId, userIds) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage Service staffing.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_service_team_leads", {
      p_service_line_id: serviceLineId,
      p_user_ids: userIds,
    });
    if (error) throw new Error(error.message);
    return fetchStaffing(serviceLineId);
  },

  async setEmployees(viewer, serviceLineId, userIds) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage Service staffing.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_service_employees", {
      p_service_line_id: serviceLineId,
      p_user_ids: userIds,
    });
    if (error) throw new Error(error.message);
    return fetchStaffing(serviceLineId);
  },
};
