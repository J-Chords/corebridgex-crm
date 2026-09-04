import type { ProjectIssuesProvider, ProjectIssueInput } from "../projects-provider";
import type { ProjectIssue, User } from "../../types";
import { canAccessProject, canEditProjectIssueDetails, canProgressProjectIssue } from "../../permissions";
import { db } from "./mock-db";

function memberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function requireProjectAccess(viewer: User, projectId: string) {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");
  const accessible = canAccessProject(
    viewer,
    { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: memberUserIds(project.id) },
    db.users
  );
  if (!accessible) throw new Error("You don't have access to this project.");
  return project;
}

function toRow(issue: ProjectIssue): ProjectIssue {
  const creator = db.users.find((u) => u.id === issue.createdById);
  const assignee = issue.assignedToId ? db.users.find((u) => u.id === issue.assignedToId) : null;
  const activity = issue.activityId ? db.activities.find((a) => a.id === issue.activityId) : null;
  return {
    ...issue,
    createdByName: creator?.fullName ?? "Unknown",
    assignedToName: assignee?.fullName ?? null,
    activityName: activity?.name ?? null,
  };
}

function validateWorkstreamTaskActivity(
  projectId: string,
  workstreamId: string | null,
  taskId: string | null,
  activityId: string | null
) {
  if (workstreamId && !db.workstreams.some((w) => w.id === workstreamId && w.projectId === projectId)) {
    throw new Error("Service not found on this project.");
  }
  if (taskId && !db.tasks.some((t) => t.id === taskId && t.workstreamId === workstreamId)) {
    throw new Error("Task not found on this project.");
  }
  if (activityId) {
    if (!workstreamId) throw new Error("An Activity requires its Service to be selected too.");
    if (!db.workstreamActivities.some((wa) => wa.workstreamId === workstreamId && wa.activityId === activityId)) {
      throw new Error("That Activity does not belong to the selected Service.");
    }
  }
}

export const mockProjectIssuesProvider: ProjectIssuesProvider = {
  async listIssues(viewer, projectId) {
    requireProjectAccess(viewer, projectId);
    return db.projectIssues
      .filter((i) => i.projectId === projectId)
      .map(toRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createIssue(viewer, projectId, input: ProjectIssueInput) {
    requireProjectAccess(viewer, projectId);
    const title = input.title.trim();
    if (!title) throw new Error("Title can't be empty.");
    validateWorkstreamTaskActivity(projectId, input.workstreamId, input.taskId, input.activityId);
    if (input.assignedToId && !db.users.some((u) => u.id === input.assignedToId && u.active)) {
      throw new Error("Assignee not found or inactive.");
    }
    const now = new Date().toISOString();
    const issue: ProjectIssue = {
      id: crypto.randomUUID(),
      projectId,
      title,
      description: input.description,
      status: "open",
      createdById: viewer.id,
      createdByName: viewer.fullName,
      assignedToId: input.assignedToId,
      assignedToName: null,
      workstreamId: input.workstreamId,
      activityId: input.activityId,
      activityName: null,
      taskId: input.taskId,
      resolution: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.projectIssues = [...db.projectIssues, issue];
    return toRow(issue);
  },

  async updateIssueDetails(viewer, issueId, input: ProjectIssueInput) {
    const existing = db.projectIssues.find((i) => i.id === issueId);
    if (!existing) throw new Error("Issue not found.");
    if (!canEditProjectIssueDetails(viewer, existing)) {
      throw new Error("Only the issue's reporter or an admin can edit its details.");
    }
    const title = input.title.trim();
    if (!title) throw new Error("Title can't be empty.");
    validateWorkstreamTaskActivity(existing.projectId, input.workstreamId, input.taskId, input.activityId);
    if (input.assignedToId && !db.users.some((u) => u.id === input.assignedToId && u.active)) {
      throw new Error("Assignee not found or inactive.");
    }
    const updated: ProjectIssue = {
      ...existing,
      title,
      description: input.description,
      assignedToId: input.assignedToId,
      workstreamId: input.workstreamId,
      activityId: input.activityId,
      taskId: input.taskId,
      updatedAt: new Date().toISOString(),
    };
    db.projectIssues = db.projectIssues.map((i) => (i.id === issueId ? updated : i));
    return toRow(updated);
  },

  async setIssueStatus(viewer, issueId, status, resolution) {
    const existing = db.projectIssues.find((i) => i.id === issueId);
    if (!existing) throw new Error("Issue not found.");
    if (!canProgressProjectIssue(viewer, existing)) {
      throw new Error("Only the issue's reporter, its assignee, or an admin may progress it.");
    }
    const updated: ProjectIssue = {
      ...existing,
      status,
      resolution: status === "resolved" ? (resolution ?? null) : existing.resolution,
      resolvedAt: status === "resolved" ? new Date().toISOString() : status === "open" ? null : existing.resolvedAt,
      updatedAt: new Date().toISOString(),
    };
    db.projectIssues = db.projectIssues.map((i) => (i.id === issueId ? updated : i));
    return toRow(updated);
  },
};
