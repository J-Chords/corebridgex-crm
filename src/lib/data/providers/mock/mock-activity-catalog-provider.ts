import type { ActivityCatalogProvider, ActivityInput, DepartmentWithActivities } from "../activity-catalog-provider";
import type { Activity, Department } from "../../types";
import { canManageAdminUsers } from "../../permissions";
import { db } from "./mock-db";

function toDepartmentWithActivities(department: Department): DepartmentWithActivities {
  const activities = db.activities
    .filter((a) => a.departmentId === department.id)
    .sort((a, b) => a.position - b.position);
  return { ...department, activities };
}

function requireAdmin(viewer: { role: string; active: boolean }) {
  if (!canManageAdminUsers(viewer as Parameters<typeof canManageAdminUsers>[0])) {
    throw new Error("Only an admin can manage the Activity catalog.");
  }
}

export const mockActivityCatalogProvider: ActivityCatalogProvider = {
  async listDepartments(brandId, serviceLineId) {
    const departments = db.departments
      .filter((d) => !brandId || d.brandId === brandId)
      .filter((d) => !serviceLineId || d.serviceLineId === serviceLineId)
      .sort((a, b) => a.position - b.position);
    return departments.map(toDepartmentWithActivities);
  },

  async updateActivity(viewer, id, input: ActivityInput) {
    requireAdmin(viewer);
    const existing = db.activities.find((a) => a.id === id);
    if (!existing) throw new Error("Activity not found.");
    const name = input.name.trim();
    if (!name) throw new Error("Activity name is required.");
    const clash = db.activities.some(
      (a) => a.id !== id && a.departmentId === existing.departmentId && a.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) throw new Error(`An Activity named "${name}" already exists for this Service.`);
    const updated: Activity = {
      ...existing,
      name,
      description: input.description?.trim() || null,
      defaultTaskTitles: input.defaultTaskTitles,
      updatedAt: new Date().toISOString(),
    };
    db.activities = db.activities.map((a) => (a.id === id ? updated : a));
    return updated;
  },

  async setActivityActive(viewer, id, isActive) {
    requireAdmin(viewer);
    const existing = db.activities.find((a) => a.id === id);
    if (!existing) throw new Error("Activity not found.");
    const updated: Activity = { ...existing, isActive, updatedAt: new Date().toISOString() };
    db.activities = db.activities.map((a) => (a.id === id ? updated : a));
    return updated;
  },

  async deleteActivity(viewer, id) {
    requireAdmin(viewer);
    const existing = db.activities.find((a) => a.id === id);
    if (!existing) throw new Error("Activity not found.");
    // Explicit usage proof, not FK-failure inference — mirrors admin_delete_activity's hosted RPC
    // exactly, since workstream_activities/project_template_activities cascade-delete in the real
    // schema and would otherwise silently destroy history instead of blocking the delete.
    const inUse =
      db.workstreamActivities.some((wa) => wa.activityId === id) ||
      db.tasks.some((t) => t.activityId === id) ||
      db.projectIssues.some((pi) => pi.activityId === id) ||
      db.projectTemplateActivities.some((pta) => pta.activityId === id);
    if (inUse) {
      throw new Error("This Activity has historical usage and cannot be deleted — deactivate it instead.");
    }
    db.activities = db.activities.filter((a) => a.id !== id);
  },
};
