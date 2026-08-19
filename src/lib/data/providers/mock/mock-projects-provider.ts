import type { ProjectsProvider, ProjectWithRelations, ProjectTaskSummary, ProjectInput, ProjectRenewalInput } from "../projects-provider";
import type { Project, User, Workstream } from "../../types";
import { canAccessProject, canManageProjects } from "../../permissions";
import { db } from "./mock-db";

function memberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function taskSummaryFor(projectId: string): ProjectTaskSummary {
  const workstreamIds = db.workstreams.filter((w) => w.projectId === projectId).map((w) => w.id);
  const tasks = db.tasks.filter((t) => workstreamIds.includes(t.workstreamId));
  const today = new Date().toISOString().slice(0, 10);
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const overdueCount = tasks.filter((t) => t.status !== "done" && t.dueDate != null && t.dueDate < today).length;
  return {
    totalCount: tasks.length,
    doneCount,
    openCount: tasks.length - doneCount,
    overdueCount,
  };
}

function servicesFor(projectId: string): { id: string; name: string }[] {
  return db.workstreams.filter((w) => w.projectId === projectId).map((w) => ({ id: w.id, name: w.name }));
}

function toProjectWithRelations(project: Project): ProjectWithRelations | null {
  const company = db.companies.find((c) => c.id === project.companyId);
  if (!company) throw new Error(`Project ${project.id} references unknown company ${project.companyId}`);
  const owner = db.users.find((u) => u.id === project.ownerId);
  if (!owner) throw new Error(`Project ${project.id} references unknown owner ${project.ownerId}`);

  const workstreamCount = db.workstreams.filter((w) => w.projectId === project.id).length;
  const tasks = taskSummaryFor(project.id);
  const progressPercent = tasks.totalCount === 0 ? 0 : Math.round((tasks.doneCount / tasks.totalCount) * 100);
  const members = db.users.filter((u) => memberUserIds(project.id).includes(u.id));

  return {
    ...project,
    companyName: company.name,
    owner,
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
  db.projectMembers = [
    ...db.projectMembers.filter((m) => m.projectId !== projectId),
    ...validIds.map((userId) => ({ projectId, userId })),
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
    requireActiveOwner(input.ownerId);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      companyId: input.companyId,
      name: input.name,
      ownerId: input.ownerId,
      status: input.status,
      contractStartDate: input.contractStartDate,
      contractMonths: input.contractMonths,
      contractEndDate: input.contractEndDate,
      description: input.description,
      createdById: viewer.id,
      createdAt: now,
      updatedAt: now,
    };
    db.projects = [...db.projects, project];
    syncMembers(id, input.memberUserIds);

    return toProjectWithRelations(project)!;
  },

  async updateProject(viewer, id, input: ProjectInput) {
    requireManageProjects(viewer);
    const existing = db.projects.find((p) => p.id === id);
    if (!existing) throw new Error("Project not found.");
    requireActiveOwner(input.ownerId);

    const updated: Project = {
      ...existing,
      name: input.name,
      ownerId: input.ownerId,
      status: input.status,
      contractStartDate: input.contractStartDate,
      contractMonths: input.contractMonths,
      contractEndDate: input.contractEndDate,
      description: input.description,
      updatedAt: new Date().toISOString(),
    };
    db.projects = db.projects.map((p) => (p.id === id ? updated : p));
    syncMembers(id, input.memberUserIds);

    return toProjectWithRelations(updated)!;
  },

  async renewProject(viewer, sourceProjectId, input: ProjectRenewalInput) {
    requireManageProjects(viewer);
    const source = db.projects.find((p) => p.id === sourceProjectId);
    if (!source) throw new Error("Source project not found.");
    requireActiveOwner(input.ownerId);

    const newProjectId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newProject: Project = {
      id: newProjectId,
      companyId: source.companyId,
      name: input.name,
      ownerId: input.ownerId,
      status: "active",
      contractStartDate: input.contractStartDate,
      contractMonths: input.contractMonths,
      contractEndDate: input.contractEndDate,
      description: source.description,
      createdById: viewer.id,
      createdAt: now,
      updatedAt: now,
    };
    db.projects = [...db.projects, newProject];
    syncMembers(newProjectId, input.memberUserIds);

    // Carry forward ONLY the explicitly selected source Services, each as a genuinely new
    // Workstream row — see the real renew_project RPC's own header comment for the full rationale
    // (fresh dates, active-only lead/team, no historical Task/time/note data, never mutating the
    // source). Any id not genuinely belonging to sourceProjectId is silently excluded.
    const sourceWorkstreams = db.workstreams.filter(
      (w) => w.projectId === sourceProjectId && input.workstreamIdsToCarryForward.includes(w.id)
    );
    for (const ws of sourceWorkstreams) {
      const newWsId = crypto.randomUUID();
      const leadStillActive = db.users.some((u) => u.id === ws.leadUserId && u.active);
      const effectiveLead = leadStillActive ? ws.leadUserId : input.ownerId;

      const newWorkstream: Workstream = {
        id: newWsId,
        name: ws.name,
        description: ws.description,
        companyId: source.companyId,
        projectId: newProjectId,
        serviceLineId: ws.serviceLineId,
        brandId: ws.brandId,
        leadUserId: effectiveLead,
        status: "active",
        startDate: input.contractStartDate,
        endDate: null,
        recurrenceFrequency: ws.recurrenceFrequency,
        recurrenceAnchorDate: ws.recurrenceFrequency ? input.contractStartDate : null,
        recurrenceCustomIntervalDays: ws.recurrenceCustomIntervalDays,
        previousOccurrenceWorkstreamId: null,
        createdById: viewer.id,
        createdAt: now,
        updatedAt: now,
      };
      db.workstreams = [...db.workstreams, newWorkstream];

      const activeTeamIds = db.workstreamMembers
        .filter((m) => m.workstreamId === ws.id)
        .map((m) => m.userId)
        .filter((userId) => db.users.some((u) => u.id === userId && u.active));
      db.workstreamMembers = [
        ...db.workstreamMembers,
        ...activeTeamIds.map((userId) => ({ workstreamId: newWsId, userId })),
      ];

      const activityIds = db.workstreamActivities.filter((wa) => wa.workstreamId === ws.id).map((wa) => wa.activityId);
      db.workstreamActivities = [
        ...db.workstreamActivities,
        ...activityIds.map((activityId) => ({ workstreamId: newWsId, activityId })),
      ];
    }

    return toProjectWithRelations(newProject)!;
  },
};
