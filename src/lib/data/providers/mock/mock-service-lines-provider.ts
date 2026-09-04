import type { ServiceLinesProvider, ServiceLineInput } from "../service-lines-provider";
import type { Activity, Department, ServiceLine, User } from "../../types";
import { canManageAdminUsers } from "../../permissions";
import { db } from "./mock-db";

function requireAdmin(viewer: User) {
  if (!canManageAdminUsers(viewer)) {
    throw new Error("Only an admin can manage the Service catalog.");
  }
}

function requireUniqueName(name: string, excludeId?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Service name is required.");
  const clash = db.serviceLines.some(
    (sl) => sl.id !== excludeId && sl.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (clash) throw new Error(`A Service named "${trimmed}" already exists.`);
  return trimmed;
}

export const mockServiceLinesProvider: ServiceLinesProvider = {
  async listAll(viewer) {
    requireAdmin(viewer);
    return db.serviceLines;
  },

  async create(viewer, input: ServiceLineInput) {
    requireAdmin(viewer);
    const name = requireUniqueName(input.name);
    const now = new Date().toISOString();
    const serviceLine: ServiceLine = {
      id: crypto.randomUUID(),
      name,
      description: input.description?.trim() || null,
      isActive: true,
      createdById: viewer.id,
      createdAt: now,
      updatedAt: now,
    };
    db.serviceLines = [...db.serviceLines, serviceLine];
    return serviceLine;
  },

  async update(viewer, id, input: ServiceLineInput) {
    requireAdmin(viewer);
    const existing = db.serviceLines.find((sl) => sl.id === id);
    if (!existing) throw new Error("Service not found.");
    const name = requireUniqueName(input.name, id);
    const updated: ServiceLine = {
      ...existing,
      name,
      description: input.description?.trim() || null,
      updatedAt: new Date().toISOString(),
    };
    db.serviceLines = db.serviceLines.map((sl) => (sl.id === id ? updated : sl));
    return updated;
  },

  async setActive(viewer, id, isActive) {
    requireAdmin(viewer);
    const existing = db.serviceLines.find((sl) => sl.id === id);
    if (!existing) throw new Error("Service not found.");
    const updated: ServiceLine = { ...existing, isActive, updatedAt: new Date().toISOString() };
    db.serviceLines = db.serviceLines.map((sl) => (sl.id === id ? updated : sl));
    return updated;
  },

  async delete(viewer, id) {
    requireAdmin(viewer);
    const existing = db.serviceLines.find((sl) => sl.id === id);
    if (!existing) throw new Error("Service not found.");
    // Mirrors the hosted RPC's own FK-violation proof (RESTRICT on every referencing table) —
    // checked explicitly here since the in-memory mock has no real foreign-key engine to lean on.
    const inUse =
      db.workstreams.some((w) => w.serviceLineId === id) ||
      db.templates.some((t) => t.serviceLineId === id) ||
      db.departments.some((d) => d.serviceLineId === id) ||
      db.companyServiceLines.some((csl) => csl.serviceLineId === id) ||
      db.serviceTeamLeads.some((r) => r.serviceLineId === id) ||
      db.serviceEmployees.some((r) => r.serviceLineId === id);
    if (inUse) {
      throw new Error(
        "This Service has historical usage (Projects, Templates, Activities, or staffing) and can't be deleted — deactivate it instead."
      );
    }
    db.serviceLines = db.serviceLines.filter((sl) => sl.id !== id);
  },

  async createActivity(viewer, serviceLineId, brandId, name) {
    requireAdmin(viewer);
    if (!db.serviceLines.some((sl) => sl.id === serviceLineId)) throw new Error("Service not found.");
    if (!db.brands.some((b) => b.id === brandId)) throw new Error("Brand not found.");
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Activity name is required.");

    let department: Department | undefined = db.departments.find(
      (d) => d.brandId === brandId && d.serviceLineId === serviceLineId
    );
    if (!department) {
      const serviceLine = db.serviceLines.find((sl) => sl.id === serviceLineId);
      department = {
        id: crypto.randomUUID(),
        brandId,
        name: serviceLine?.name ?? "General",
        position: db.departments.filter((d) => d.brandId === brandId).length,
        serviceLineId,
      };
      db.departments = [...db.departments, department];
    }

    const existingActivity = db.activities.find(
      (a) => a.departmentId === department!.id && a.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingActivity) return existingActivity;

    const activity: Activity = {
      id: crypto.randomUUID(),
      departmentId: department.id,
      name: trimmedName,
      position: db.activities.filter((a) => a.departmentId === department!.id).length,
      defaultTaskTitles: [],
    };
    db.activities = [...db.activities, activity];
    return activity;
  },
};
