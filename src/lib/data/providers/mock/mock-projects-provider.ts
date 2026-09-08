import type { ProjectsProvider, ProjectWithRelations, ProjectTaskSummary, ProjectInput, ClientProjectInput } from "../projects-provider";
import type { Project, ProjectGroup, ProjectStatus, ProjectTrashSettings, User } from "../../types";
import { canAccessProject, canManageProjects } from "../../permissions";
import { INTERNAL_COMPANY_ID } from "../../constants";
import { isTaskClosed } from "../../task-display";
import { db } from "./mock-db";
import { mockProjectTemplatesProvider } from "./mock-project-templates-provider";
import { mockCompaniesProvider } from "./mock-companies-provider";

function requireAdmin(viewer: User) {
  if (!canManageProjects(viewer)) {
    throw new Error("Only an admin can perform this action.");
  }
}

function memberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function taskSummaryFor(projectId: string): ProjectTaskSummary {
  const workstreamIds = db.workstreams.filter((w) => w.projectId === projectId).map((w) => w.id);
  const tasks = db.tasks.filter((t) => workstreamIds.includes(t.workstreamId));
  const today = new Date().toISOString().slice(0, 10);
  const doneCount = tasks.filter((t) => t.status === "completed").length;
  const closedCount = tasks.filter((t) => isTaskClosed(t.status)).length;
  const overdueCount = tasks.filter((t) => !isTaskClosed(t.status) && t.dueDate != null && t.dueDate < today).length;
  return {
    totalCount: tasks.length,
    doneCount,
    // Section 23 — Canceled is CLOSED, never counted as open work; openCount excludes both
    // Completed and Canceled (doneCount alone would leave a Canceled task counted as "open").
    openCount: tasks.length - closedCount,
    overdueCount,
  };
}

function servicesFor(projectId: string): { id: string; name: string; serviceLineId: string | null }[] {
  return db.workstreams
    .filter((w) => w.projectId === projectId)
    .map((w) => ({ id: w.id, name: w.name, serviceLineId: w.serviceLineId }));
}

function toProjectWithRelations(project: Project): ProjectWithRelations | null {
  const company = db.companies.find((c) => c.id === project.companyId);
  if (!company) throw new Error(`Project ${project.id} references unknown company ${project.companyId}`);
  const owner = db.users.find((u) => u.id === project.ownerId);
  if (!owner) throw new Error(`Project ${project.id} references unknown owner ${project.ownerId}`);
  const createdBy = db.users.find((u) => u.id === project.createdById);
  if (!createdBy) throw new Error(`Project ${project.id} references unknown creator ${project.createdById}`);

  const workstreamCount = db.workstreams.filter((w) => w.projectId === project.id).length;
  const tasks = taskSummaryFor(project.id);
  const progressPercent = tasks.totalCount === 0 ? 0 : Math.round((tasks.doneCount / tasks.totalCount) * 100);
  const memberLinks = db.projectMembers.filter((m) => m.projectId === project.id);
  const members = memberLinks
    .map((link) => {
      const u = db.users.find((user) => user.id === link.userId);
      return u ? { ...u, projectRole: link.projectRole } : null;
    })
    .filter((u): u is User & { projectRole: string | null } => u !== null);

  return {
    ...project,
    companyName: company.name,
    isInternal: company.id === INTERNAL_COMPANY_ID,
    owner,
    createdBy,
    members,
    memberCount: members.length,
    workstreamCount,
    services: servicesFor(project.id),
    tasks,
    progressPercent,
  };
}

function requireManageProjects(viewer: User) {
  if (!canManageProjects(viewer)) {
    throw new Error("Only a superadmin may create, edit, or renew a project.");
  }
}

function requireCompanyFound(companyId: string) {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error("Company not found.");
  return company;
}

function requireActiveOwner(ownerId: string) {
  const owner = db.users.find((u) => u.id === ownerId && u.active);
  if (!owner) throw new Error("Owner not found or inactive.");
  return owner;
}

function syncMembers(projectId: string, userIds: string[]) {
  const validIds = userIds.filter((id) => db.users.some((u) => u.id === id && u.active));
  // Preserve each still-selected member's existing projectRole rather than silently discarding it
  // on every metadata save — only genuinely new members start with a null role.
  const existingRoleByUserId = new Map(
    db.projectMembers.filter((m) => m.projectId === projectId).map((m) => [m.userId, m.projectRole])
  );
  db.projectMembers = [
    ...db.projectMembers.filter((m) => m.projectId !== projectId),
    ...validIds.map((userId) => ({ projectId, userId, projectRole: existingRoleByUserId.get(userId) ?? null })),
  ];
}

export const mockProjectsProvider: ProjectsProvider = {
  async listProjects(viewer) {
    return db.projects
      .filter((p) => canAccessProject(viewer, { companyId: p.companyId, ownerId: p.ownerId, memberUserIds: memberUserIds(p.id) }, db.users))
      .map(toProjectWithRelations)
      .filter((p): p is ProjectWithRelations => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getProject(viewer, id) {
    const project = db.projects.find((p) => p.id === id);
    if (!project) return null;
    const accessible = canAccessProject(
      viewer,
      { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: memberUserIds(project.id) },
      db.users
    );
    if (!accessible) return null;
    return toProjectWithRelations(project);
  },

  async createProject(viewer, input: ProjectInput) {
    requireManageProjects(viewer);
    requireCompanyFound(input.companyId);
    if (!input.name.trim()) throw new Error("Title can't be empty.");
    const effectiveOwnerId = input.ownerId ?? viewer.id;
    requireActiveOwner(effectiveOwnerId);
    if (input.projectGroupId && !db.projectGroups.some((g) => g.id === input.projectGroupId)) {
      throw new Error("Project Group not found.");
    }

    if (input.templateId && !db.projectTemplates.some((t) => t.id === input.templateId && t.active)) {
      throw new Error("Project Template not found or inactive.");
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      companyId: input.companyId,
      name: input.name.trim(),
      ownerId: effectiveOwnerId,
      status: "active",
      contractStartDate: input.contractStartDate,
      contractMonths: input.contractMonths,
      contractEndDate: input.contractEndDate,
      description: input.description,
      completionDate: input.completionDate,
      startDate: input.startDate,
      endDate: input.endDate,
      projectGroupId: input.projectGroupId,
      tags: input.tags,
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      trashedAt: null,
      preTrashStatus: null,
      createdById: viewer.id,
      createdAt: now,
      updatedAt: now,
    };
    db.projects = [...db.projects, project];
    syncMembers(id, input.memberUserIds);

    if (input.templateId) {
      // ONE canonical bundle-apply path — the exact same function "Project -> Services -> Apply
      // Template" uses on an existing Project (mockProjectTemplatesProvider.applyToProject),
      // which itself reuses create_workstream's own role validation and the shared Service
      // Template Task/checklist materialization. Nothing is duplicated here.
      await mockProjectTemplatesProvider.applyToProject(viewer, input.templateId, id);
    }

    return toProjectWithRelations(project)!;
  },

  // Project/client consolidation — the ONE normal "New Project" workflow for a brand-new client.
  // Creates the Company (+ optional primary contact) then delegates entirely to this same
  // `createProject` for the Project row/Template materialization — never a duplicated insert.
  // Mock has no real transaction, so failure after the Company is created triggers a best-effort
  // compensating delete (mirroring the real hosted RPC's genuine transactional rollback).
  async createClientProject(viewer, input: ClientProjectInput): Promise<ProjectWithRelations> {
    requireManageProjects(viewer);
    if (!input.name.trim()) throw new Error("Title can't be empty.");
    if (input.brandId && !db.brands.some((b) => b.id === input.brandId)) {
      throw new Error("Brand not found.");
    }

    const company = await mockCompaniesProvider.createCompany(viewer, {
      name: input.name.trim(),
      status: "prospect",
      brandId: input.brandId,
      serviceLineIds: [],
      contractStartDate: input.contractStartDate,
      renewalDate: input.renewalDate,
      assignedStaffIds: [],
    });

    try {
      if (input.contactName?.trim()) {
        await mockCompaniesProvider.createContact(viewer, company.id, {
          name: input.contactName.trim(),
          title: null,
          email: input.contactEmail?.trim() || null,
          phone: input.contactPhone?.trim() || null,
          isPrimary: true,
          notes: null,
        });
      }

      return await mockProjectsProvider.createProject(viewer, {
        companyId: company.id,
        name: input.name,
        ownerId: input.ownerId,
        contractStartDate: input.contractStartDate,
        contractMonths: 12,
        contractEndDate: input.renewalDate,
        completionDate: input.completionDate,
        startDate: input.startDate,
        endDate: input.endDate,
        description: input.description,
        projectGroupId: input.projectGroupId,
        tags: input.tags,
        memberUserIds: input.memberUserIds,
        templateId: input.templateId,
      });
    } catch (err) {
      db.companies = db.companies.filter((c) => c.id !== company.id);
      db.contacts = db.contacts.filter((c) => c.companyId !== company.id);
      throw err;
    }
  },

  // Ordinary metadata edit only — status lifecycle never goes through here, see
  // setProjectStatus/trashProject/restoreProject below.
  async updateProject(viewer, id, input: ProjectInput) {
    requireManageProjects(viewer);
    const existing = db.projects.find((p) => p.id === id);
    if (!existing) throw new Error("Project not found.");
    if (!input.name.trim()) throw new Error("Title can't be empty.");
    const effectiveOwnerId = input.ownerId ?? existing.ownerId;
    requireActiveOwner(effectiveOwnerId);
    if (input.projectGroupId && !db.projectGroups.some((g) => g.id === input.projectGroupId)) {
      throw new Error("Project Group not found.");
    }

    const updated: Project = {
      ...existing,
      name: input.name.trim(),
      ownerId: effectiveOwnerId,
      contractStartDate: input.contractStartDate,
      contractMonths: input.contractMonths,
      contractEndDate: input.contractEndDate,
      completionDate: input.completionDate,
      startDate: input.startDate,
      endDate: input.endDate,
      description: input.description,
      projectGroupId: input.projectGroupId,
      tags: input.tags,
      updatedAt: new Date().toISOString(),
    };
    db.projects = db.projects.map((p) => (p.id === id ? updated : p));
    syncMembers(id, input.memberUserIds);

    return toProjectWithRelations(updated)!;
  },

  async setProjectMemberRole(viewer, projectId, userId, projectRole) {
    requireAdmin(viewer);
    const link = db.projectMembers.find((m) => m.projectId === projectId && m.userId === userId);
    if (!link) throw new Error("That user is not a member of this project.");
    db.projectMembers = db.projectMembers.map((m) =>
      m.projectId === projectId && m.userId === userId ? { ...m, projectRole: projectRole?.trim() || null } : m
    );
  },

  async getTrashSettings() {
    return { ...db.projectTrashSettings };
  },

  async setTrashRetentionDays(viewer, days) {
    requireAdmin(viewer);
    if (days !== null && days <= 0) {
      throw new Error("Retention days must be a positive number, or null to disable automatic purge.");
    }
    const updated: ProjectTrashSettings = { retentionDays: days, updatedAt: new Date().toISOString() };
    db.projectTrashSettings = updated;
    return updated;
  },

  async setProjectStatus(viewer, id, status) {
    requireAdmin(viewer);
    // Product Owner Final Lifecycle Integrity correction — Project = Client workspace; the normal
    // lifecycle is Active <-> Archived only. "on-hold"/"completed"/"cancelled" are retired as
    // normal targets (mirrors the hosted `set_project_status` RPC exactly) — an existing legacy row
    // in one of those states is untouched (this function is never called with a target it isn't
    // asked to move TO); it can still move forward into Active, Archived, or Trash like any other
    // Project.
    if (status !== "active" && status !== "archived") {
      throw new Error(`Invalid status for this action: ${status}`);
    }
    const existing = db.projects.find((p) => p.id === id);
    if (!existing) throw new Error("Project not found.");
    if (existing.status === "trash") throw new Error("This project is in Trash — restore it first.");

    const updated: Project = {
      ...existing,
      status,
      statusReason: null,
      statusChangedAt: new Date().toISOString(),
      statusChangedById: viewer.id,
      // Archive atomically stamps the persisted archive/relationship-end date — never cleared by
      // any other transition (Reactivate simply never sets it, so it survives untouched).
      completionDate: status === "archived" ? new Date().toISOString().slice(0, 10) : existing.completionDate,
      updatedAt: new Date().toISOString(),
    };
    db.projects = db.projects.map((p) => (p.id === id ? updated : p));
    return toProjectWithRelations(updated)!;
  },

  async trashProject(viewer, id) {
    requireAdmin(viewer);
    const existing = db.projects.find((p) => p.id === id);
    if (!existing) throw new Error("Project not found.");
    if (existing.status === "trash") return toProjectWithRelations(existing)!;

    const updated: Project = {
      ...existing,
      preTrashStatus: existing.status,
      status: "trash",
      trashedAt: new Date().toISOString(),
      statusChangedAt: new Date().toISOString(),
      statusChangedById: viewer.id,
      updatedAt: new Date().toISOString(),
    };
    db.projects = db.projects.map((p) => (p.id === id ? updated : p));
    return toProjectWithRelations(updated)!;
  },

  async restoreProject(viewer, id) {
    requireAdmin(viewer);
    const existing = db.projects.find((p) => p.id === id);
    if (!existing) throw new Error("Project not found.");
    if (existing.status !== "trash") throw new Error("This project is not in Trash.");

    const updated: Project = {
      ...existing,
      status: (existing.preTrashStatus ?? "active") as ProjectStatus,
      preTrashStatus: null,
      trashedAt: null,
      statusChangedAt: new Date().toISOString(),
      statusChangedById: viewer.id,
      updatedAt: new Date().toISOString(),
    };
    db.projects = db.projects.map((p) => (p.id === id ? updated : p));
    return toProjectWithRelations(updated)!;
  },

  async listProjectGroups() {
    return [...db.projectGroups].sort((a, b) => a.name.localeCompare(b.name));
  },

  async createProjectGroup(viewer, name) {
    requireAdmin(viewer);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Project Group name can't be empty.");
    if (db.projectGroups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("A Project Group with that name already exists.");
    }
    const group: ProjectGroup = { id: crypto.randomUUID(), name: trimmed };
    db.projectGroups = [...db.projectGroups, group];
    return group;
  },
};
