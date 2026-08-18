import type { WorkstreamsProvider, WorkstreamWithRelations } from "../workstreams-provider";
import type { Workstream, User } from "../../types";
import {
  canAccessCompany,
  canAccessWorkstream,
  canCreateWorkstream,
  canCreateWorkstreamInProject,
  canManageWorkstreams,
  isEmployee,
} from "../../permissions";
import { computeWorkstreamBudget } from "../../time-budget";
import { computeWorkstreamRecurrence } from "../../recurrence";
import { db } from "./mock-db";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function workstreamTeamIds(workstreamId: string): string[] {
  return db.workstreamMembers.filter((m) => m.workstreamId === workstreamId).map((m) => m.userId);
}

function workstreamActivityIds(workstreamId: string): string[] {
  return db.workstreamActivities.filter((wa) => wa.workstreamId === workstreamId).map((wa) => wa.activityId);
}

/**
 * The workstream itself carries no estimate of its own — "expected" is a roll-up, summed from its
 * own tasks' `expectedMinutes` (null if literally none of them has one set, matching the identical
 * "only count items that actually have a budget" rule `computeBudgetRollup` already uses one level
 * up for the client-level rollup). Only completed entries count toward logged hours — a still-running
 * timer's partial elapsed time isn't "logged" yet, matching every other hours-logged surface in the app.
 */
function workstreamHours(workstreamId: string) {
  const tasks = db.tasks.filter((t) => t.workstreamId === workstreamId);
  const expectedMinutes = tasks.some((t) => t.expectedMinutes != null)
    ? tasks.reduce((sum, t) => sum + (t.expectedMinutes ?? 0), 0)
    : null;
  const taskIds = tasks.map((t) => t.id);
  const entries = db.timeEntries.filter((te) => taskIds.includes(te.taskId) && te.durationMinutes !== null);

  let billableMinutes = 0;
  let nonBillableMinutes = 0;
  for (const entry of entries) {
    if (entry.billable) billableMinutes += entry.durationMinutes ?? 0;
    else nonBillableMinutes += entry.durationMinutes ?? 0;
  }

  return computeWorkstreamBudget({
    expectedMinutes,
    actualMinutes: billableMinutes + nonBillableMinutes,
    billableMinutes,
    nonBillableMinutes,
  });
}

function toWorkstreamWithRelations(workstream: Workstream): WorkstreamWithRelations {
  const company = db.companies.find((c) => c.id === workstream.companyId);
  if (!company) {
    throw new Error(`Workstream ${workstream.id} references unknown company ${workstream.companyId}`);
  }
  const brand = db.brands.find((b) => b.id === workstream.brandId);
  if (!brand) {
    throw new Error(`Workstream ${workstream.id} references unknown brand ${workstream.brandId}`);
  }
  const serviceLine = workstream.serviceLineId
    ? (db.serviceLines.find((sl) => sl.id === workstream.serviceLineId) ?? null)
    : null;
  const lead = db.users.find((u) => u.id === workstream.leadUserId);
  if (!lead) {
    throw new Error(`Workstream ${workstream.id} references unknown lead ${workstream.leadUserId}`);
  }
  const team = db.users.filter((u) => workstreamTeamIds(workstream.id).includes(u.id));
  const activityIds = workstreamActivityIds(workstream.id);
  const activities = db.activities
    .filter((a) => activityIds.includes(a.id))
    .sort((a, b) => a.position - b.position);

  const tasks = db.tasks.filter((t) => t.workstreamId === workstream.id);
  const taskCount = tasks.length;
  const doneTaskCount = tasks.filter((t) => t.status === "done").length;
  const progressPercent = taskCount === 0 ? 0 : Math.round((doneTaskCount / taskCount) * 100);
  const budget = workstreamHours(workstream.id);

  const hasSuccessor = db.workstreams.some((w) => w.previousOccurrenceWorkstreamId === workstream.id);
  const recurrence = computeWorkstreamRecurrence(
    workstream.recurrenceFrequency
      ? {
          frequency: workstream.recurrenceFrequency,
          anchorDate: workstream.recurrenceAnchorDate ?? workstream.startDate ?? todayDateString(),
          customIntervalDays: workstream.recurrenceCustomIntervalDays,
        }
      : null,
    workstream.startDate,
    hasSuccessor,
    todayDateString()
  );

  return {
    ...workstream,
    company,
    serviceLine,
    brand,
    lead,
    team,
    activities,
    taskCount,
    doneTaskCount,
    progressPercent,
    budget,
    recurrence,
  };
}

function projectMemberIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

/**
 * Mirrors enforce_workstream_project_link exactly: when a Project is given, its own companyId
 * wins (closing the "guess between multiple Projects" risk); when omitted, resolved from
 * companyId ONLY when that Company has exactly one Project — ambiguous/missing cases throw
 * rather than silently pick one.
 */
function resolveProject(companyId: string, projectId: string | null | undefined): { projectId: string; companyId: string } {
  if (projectId) {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found.");
    return { projectId: project.id, companyId: project.companyId };
  }
  const matches = db.projects.filter((p) => p.companyId === companyId);
  if (matches.length === 0) throw new Error("This company has no project yet — create one before adding a service.");
  if (matches.length > 1) throw new Error("This company has more than one project — a service must specify which project it belongs to.");
  return { projectId: matches[0].id, companyId: matches[0].companyId };
}

function requireAccess(viewer: User, workstream: Workstream) {
  const accessible = canAccessWorkstream(
    viewer,
    { leadUserId: workstream.leadUserId, teamUserIds: workstreamTeamIds(workstream.id), companyId: workstream.companyId },
    db.users
  );
  if (!accessible) throw new Error("You don't have access to this workstream.");
}

function requireManage(viewer: User, workstream?: Workstream) {
  if (!canManageWorkstreams(viewer)) {
    throw new Error("Only supervisors and superadmins can manage workstreams.");
  }
  if (workstream) requireAccess(viewer, workstream);
}

function syncTeam(workstreamId: string, userIds: string[]) {
  db.workstreamMembers = [
    ...db.workstreamMembers.filter((m) => m.workstreamId !== workstreamId),
    ...userIds.map((userId) => ({ workstreamId, userId })),
  ];
}

function syncWorkstreamActivities(workstreamId: string, activityIds: string[]) {
  db.workstreamActivities = [
    ...db.workstreamActivities.filter((wa) => wa.workstreamId !== workstreamId),
    ...activityIds.map((activityId) => ({ workstreamId, activityId })),
  ];
}

/**
 * Every selected activity must belong to a department mapped to the workstream's own service line —
 * the same invariant the picker itself only ever offers, enforced here rather than trusted from the
 * caller. A workstream with no service line selected can't have any activities either.
 */
function requireActivitiesBelongToService(activityIds: string[], serviceLineId: string | null) {
  if (activityIds.length === 0) return;
  if (!serviceLineId) {
    throw new Error("Activities can only be selected once a service is chosen.");
  }
  for (const activityId of activityIds) {
    const activity = db.activities.find((a) => a.id === activityId);
    const department = activity ? db.departments.find((d) => d.id === activity.departmentId) : undefined;
    if (!department || department.serviceLineId !== serviceLineId) {
      throw new Error("One of the selected activities doesn't belong to this workstream's service.");
    }
  }
}

export const mockWorkstreamsProvider: WorkstreamsProvider = {
  async listWorkstreams(viewer, filters) {
    let workstreams = db.workstreams.filter((e) =>
      canAccessWorkstream(
        viewer,
        { leadUserId: e.leadUserId, teamUserIds: workstreamTeamIds(e.id), companyId: e.companyId },
        db.users
      )
    );
    if (filters?.companyId) {
      workstreams = workstreams.filter((e) => e.companyId === filters.companyId);
    }
    return workstreams.map(toWorkstreamWithRelations);
  },

  async getWorkstream(viewer, id) {
    const workstream = db.workstreams.find((e) => e.id === id);
    if (!workstream) return null;
    const accessible = canAccessWorkstream(
      viewer,
      { leadUserId: workstream.leadUserId, teamUserIds: workstreamTeamIds(id), companyId: workstream.companyId },
      db.users
    );
    if (!accessible) return null;
    return toWorkstreamWithRelations(workstream);
  },

  async createWorkstream(viewer, input) {
    // Resolves/validates the Project first — mirrors enforce_workstream_project_link exactly, and
    // its resolved companyId always wins over whatever the caller sent (closes the "guess between
    // multiple Projects" / "pass an unrelated companyId" risk for every role, not just Employee).
    const resolved = resolveProject(input.companyId, input.projectId);
    const project = db.projects.find((p) => p.id === resolved.projectId)!;

    if (input.projectId) {
      if (!canCreateWorkstreamInProject(viewer, { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: projectMemberIds(project.id) }, db.users)) {
        throw new Error("You don't have access to create a service in that project.");
      }
    } else if (!canCreateWorkstream(viewer, resolved.companyId, db.users)) {
      throw new Error("You don't have access to create a workstream for that company.");
    }
    if (isEmployee(viewer) && input.leadUserId !== viewer.id) {
      // Mirrors the real workstreams_insert RLS check exactly — an Employee may only ever create
      // a workstream they themselves lead, never one assigned to someone else. This is what makes
      // the new workstream visible to them afterward (canAccessWorkstream's own lead/self check),
      // without granting any broader staff-assignment power.
      throw new Error("You can only create a workstream you lead yourself.");
    }
    const company = db.companies.find((c) => c.id === resolved.companyId);
    if (!company) throw new Error("Company not found.");
    requireActivitiesBelongToService(input.activityIds, input.serviceLineId);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const workstream: Workstream = {
      id,
      name: input.name,
      description: input.description,
      companyId: resolved.companyId,
      projectId: resolved.projectId,
      serviceLineId: input.serviceLineId,
      brandId: company.brandId,
      leadUserId: input.leadUserId,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      recurrenceFrequency: input.recurrenceFrequency,
      recurrenceAnchorDate: input.recurrenceFrequency ? input.recurrenceAnchorDate : null,
      recurrenceCustomIntervalDays: input.recurrenceFrequency === "custom" ? input.recurrenceCustomIntervalDays : null,
      previousOccurrenceWorkstreamId: input.previousOccurrenceWorkstreamId ?? null,
      createdById: viewer.id,
      createdAt: now,
      updatedAt: now,
    };

    db.workstreams = [...db.workstreams, workstream];
    syncTeam(id, input.teamUserIds);
    syncWorkstreamActivities(id, input.activityIds);

    return toWorkstreamWithRelations(workstream);
  },

  async updateWorkstream(viewer, id, input) {
    const existing = db.workstreams.find((e) => e.id === id);
    if (!existing) throw new Error("Workstream not found.");
    requireManage(viewer, existing);
    if (!canAccessCompany(viewer, input.companyId, db.users)) {
      throw new Error("You don't have access to that company.");
    }
    requireActivitiesBelongToService(input.activityIds, input.serviceLineId);

    const updated: Workstream = {
      ...existing,
      name: input.name,
      description: input.description,
      serviceLineId: input.serviceLineId,
      leadUserId: input.leadUserId,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      recurrenceFrequency: input.recurrenceFrequency,
      recurrenceAnchorDate: input.recurrenceFrequency ? input.recurrenceAnchorDate : null,
      recurrenceCustomIntervalDays: input.recurrenceFrequency === "custom" ? input.recurrenceCustomIntervalDays : null,
      updatedAt: new Date().toISOString(),
    };

    db.workstreams = db.workstreams.map((e) => (e.id === id ? updated : e));
    syncTeam(id, input.teamUserIds);
    syncWorkstreamActivities(id, input.activityIds);

    return toWorkstreamWithRelations(updated);
  },
};
