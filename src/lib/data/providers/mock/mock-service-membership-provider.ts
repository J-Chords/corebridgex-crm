import type { ServiceMembershipProvider } from "../service-membership-provider";
import type { ServiceStaffing } from "../../types";
import { canManageAdminUsers } from "../../permissions";
import { db } from "./mock-db";

function toStaffing(serviceLineId: string): ServiceStaffing {
  return {
    serviceLineId,
    teamLeadUserIds: db.serviceTeamLeads.filter((r) => r.serviceLineId === serviceLineId).map((r) => r.userId),
    employeeUserIds: db.serviceEmployees.filter((r) => r.serviceLineId === serviceLineId).map((r) => r.userId),
  };
}

export const mockServiceMembershipProvider: ServiceMembershipProvider = {
  async listServiceStaffing(viewer) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage Service staffing.");
    }
    return db.serviceLines.map((line) => toStaffing(line.id));
  },

  async getStaffingForServiceLines(viewer, serviceLineIds) {
    if (!viewer.active) return [];
    return Array.from(new Set(serviceLineIds)).map((id) => toStaffing(id));
  },

  async setTeamLeads(viewer, serviceLineId, userIds) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage Service staffing.");
    }
    for (const userId of userIds) {
      const user = db.users.find((u) => u.id === userId);
      if (!user || user.role !== "supervisor" || !user.active) {
        throw new Error(`User ${userId} is not an active Team-Lead-eligible user.`);
      }
    }
    db.serviceTeamLeads = [
      ...db.serviceTeamLeads.filter((r) => r.serviceLineId !== serviceLineId),
      ...Array.from(new Set(userIds)).map((userId) => ({ serviceLineId, userId })),
    ];
    return toStaffing(serviceLineId);
  },

  async setEmployees(viewer, serviceLineId, userIds) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage Service staffing.");
    }
    for (const userId of userIds) {
      const user = db.users.find((u) => u.id === userId);
      if (!user || user.role === "superadmin" || !user.active) {
        throw new Error(`User ${userId} is not an active Employee-membership-eligible user.`);
      }
    }
    db.serviceEmployees = [
      ...db.serviceEmployees.filter((r) => r.serviceLineId !== serviceLineId),
      ...Array.from(new Set(userIds)).map((userId) => ({ serviceLineId, userId })),
    ];
    return toStaffing(serviceLineId);
  },
};
