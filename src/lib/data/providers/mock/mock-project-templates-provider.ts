import type { ProjectTemplatesProvider } from "../projects-provider";
import type { ProjectTemplate, ProjectTemplateApplyStep, User } from "../../types";
import { canManageProjects } from "../../permissions";
import { db } from "./mock-db";
import { applyServiceTemplateToProject } from "./mock-templates-provider";

function requireAdmin(viewer: User) {
  if (!canManageProjects(viewer)) {
    throw new Error("Only an admin can manage Project Templates.");
  }
}

export const mockProjectTemplatesProvider: ProjectTemplatesProvider = {
  async listTemplates(viewer) {
    requireAdmin(viewer);
    return [...db.projectTemplates].sort((a, b) => a.name.localeCompare(b.name));
  },

  async getTemplateServices(viewer, templateId) {
    requireAdmin(viewer);
    return db.projectTemplateServices
      .filter((s) => s.projectTemplateId === templateId)
      .map((s) => ({
        serviceTemplateId: s.serviceTemplateId,
        serviceLineId: s.serviceLineId,
        activityIds: db.projectTemplateActivities
          .filter((a) => a.projectTemplateId === templateId && a.serviceTemplateId === s.serviceTemplateId)
          .map((a) => a.activityId),
      }));
  },

  async createTemplate(viewer, name, description) {
    requireAdmin(viewer);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Template name can't be empty.");
    const now = new Date().toISOString();
    const template: ProjectTemplate = {
      id: crypto.randomUUID(),
      name: trimmed,
      description,
      active: true,
      createdById: viewer.id,
      createdAt: now,
      updatedAt: now,
    };
    db.projectTemplates = [...db.projectTemplates, template];
    return template;
  },

  async updateTemplate(viewer, templateId, name, description, active) {
    requireAdmin(viewer);
    const existing = db.projectTemplates.find((t) => t.id === templateId);
    if (!existing) throw new Error("Project Template not found.");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Template name can't be empty.");
    const updated = { ...existing, name: trimmed, description, active, updatedAt: new Date().toISOString() };
    db.projectTemplates = db.projectTemplates.map((t) => (t.id === templateId ? updated : t));
    return updated;
  },

  async setTemplateServices(viewer, templateId, serviceTemplateIds) {
    requireAdmin(viewer);
    if (!db.projectTemplates.some((t) => t.id === templateId)) throw new Error("Project Template not found.");

    const uniqueIds = Array.from(new Set(serviceTemplateIds));
    const seenServiceLineIds = new Set<string>();
    const rows: { projectTemplateId: string; serviceTemplateId: string; serviceLineId: string }[] = [];
    for (const serviceTemplateId of uniqueIds) {
      const recipe = db.templates.find((t) => t.id === serviceTemplateId);
      if (!recipe) continue;
      if (!recipe.serviceLineId) {
        throw new Error(`"${recipe.name}" has no Service Line configured and cannot be added to a Project Template.`);
      }
      if (seenServiceLineIds.has(recipe.serviceLineId)) {
        throw new Error("This Project Template already includes a different Service Template for that Service Line.");
      }
      seenServiceLineIds.add(recipe.serviceLineId);
      rows.push({ projectTemplateId: templateId, serviceTemplateId, serviceLineId: recipe.serviceLineId });
    }

    db.projectTemplateActivities = db.projectTemplateActivities.filter((a) => a.projectTemplateId !== templateId);
    db.projectTemplateServices = [
      ...db.projectTemplateServices.filter((s) => s.projectTemplateId !== templateId),
      ...rows,
    ];
  },

  async setTemplateActivities(viewer, templateId, serviceTemplateId, activityIds) {
    requireAdmin(viewer);
    const bundleEntry = db.projectTemplateServices.find(
      (s) => s.projectTemplateId === templateId && s.serviceTemplateId === serviceTemplateId
    );
    if (!bundleEntry) throw new Error("This Project Template does not include that Service Template — add it first.");

    for (const activityId of activityIds) {
      const activity = db.activities.find((a) => a.id === activityId);
      const department = activity ? db.departments.find((d) => d.id === activity.departmentId) : null;
      if (!department || department.serviceLineId !== bundleEntry.serviceLineId) {
        throw new Error("That Activity does not belong to the selected Service Template's Service Line.");
      }
    }

    db.projectTemplateActivities = [
      ...db.projectTemplateActivities.filter(
        (a) => !(a.projectTemplateId === templateId && a.serviceTemplateId === serviceTemplateId)
      ),
      ...Array.from(new Set(activityIds)).map((activityId) => ({ projectTemplateId: templateId, serviceTemplateId, activityId })),
    ];
  },

  async applyToProject(viewer, projectTemplateId, projectId): Promise<ProjectTemplateApplyStep[]> {
    const template = db.projectTemplates.find((t) => t.id === projectTemplateId && t.active);
    if (!template) throw new Error("Project Template not found or inactive.");
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found.");

    const bundleEntries = db.projectTemplateServices.filter((s) => s.projectTemplateId === projectTemplateId);
    const steps: ProjectTemplateApplyStep[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const entry of bundleEntries) {
      const recipe = db.templates.find((t) => t.id === entry.serviceTemplateId);
      const serviceLine = db.serviceLines.find((sl) => sl.id === entry.serviceLineId);
      const activityIds = db.projectTemplateActivities
        .filter((a) => a.projectTemplateId === projectTemplateId && a.serviceTemplateId === entry.serviceTemplateId)
        .map((a) => a.activityId);

      const result = await applyServiceTemplateToProject(
        viewer,
        entry.serviceTemplateId,
        projectId,
        project.ownerId,
        [],
        today,
        activityIds
      );

      steps.push({
        serviceLineId: entry.serviceLineId,
        serviceLineName: serviceLine?.name ?? "Service",
        serviceTemplateName: recipe?.name ?? "Service Template",
        status: result.status,
        workstreamId: result.workstreamId,
        activitiesMerged: result.activitiesMerged,
      });
    }

    return steps;
  },
};
