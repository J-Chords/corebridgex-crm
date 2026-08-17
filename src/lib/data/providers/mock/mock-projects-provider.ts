import type { ProjectsProvider, ProjectWithRelations, ProjectTaskSummary } from "../projects-provider";
import type { Project } from "../../types";
import { canAccessProject } from "../../permissions";
import { db } from "./mock-db";

function memberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function taskSummaryFor(companyId: string): ProjectTaskSummary {
  // Mock has no workstreams.projectId field (deliberately not added this slice — every Company
  // maps to exactly one Project today, so joining via companyId is equivalent and avoids
  // threading a new field through every Workstream call site for a read-only surface). The real
  // Supabase provider uses the actual workstreams.project_id column instead.
  const workstreamIds = db.workstreams.filter((w) => w.companyId === companyId).map((w) => w.id);
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

function toProjectWithRelations(project: Project): ProjectWithRelations | null {
  const company = db.companies.find((c) => c.id === project.companyId);
  if (!company) throw new Error(`Project ${project.id} references unknown company ${project.companyId}`);
  const owner = db.users.find((u) => u.id === project.ownerId);
  if (!owner) throw new Error(`Project ${project.id} references unknown owner ${project.ownerId}`);

  const workstreamCount = db.workstreams.filter((w) => w.companyId === project.companyId).length;
  const tasks = taskSummaryFor(project.companyId);
  const progressPercent = tasks.totalCount === 0 ? 0 : Math.round((tasks.doneCount / tasks.totalCount) * 100);

  return {
    ...project,
    companyName: company.name,
    owner,
    memberCount: memberUserIds(project.id).length,
    workstreamCount,
    tasks,
    progressPercent,
  };
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
};
