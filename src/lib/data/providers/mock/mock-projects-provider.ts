import type {
  ProjectsProvider,
  ProjectWithRelations,
  ProjectTaskSummary,
  ProjectInput,
  ClientProjectInput,
  ProjectTemplateSelection,
} from "../projects-provider";
import type { WorkstreamWithRelations } from "../workstreams-provider";
import type { Project, ProjectGroup, ProjectStatus, ProjectTrashSettings, User } from "../../types";
import { canAccessProject, canManageProjects, canManageProjectRecord, canCreateProject, isSuperadmin, isSupervisor } from "../../permissions";
import { INTERNAL_COMPANY_ID } from "../../constants";
import { isTaskClosed } from "../../task-display";
import { db } from "./mock-db";
import { mockCompaniesProvider } from "./mock-companies-provider";
import { mockWorkstreamsProvider } from "./mock-workstreams-provider";

function requireAdmin(viewer: User) {
  if (!canManageProjects(viewer)) {
    throw new Error("Only an admin can perform this action.");
  }
}

function requireManageRecord(viewer: User, project: { ownerId: string }) {
  if (!canManageProjectRecord(viewer, project)) {
    throw new Error("You don't have permission to edit this project.");
  }
}

/** Phase 3 (CD-208) — atomic-in-spirit for the mock: applies every selection, best-effort rolling
 * back any Workstream already created in this same call if a later one fails, mirroring the real
 * RPC's true transactional guarantee (a plpgsql function body is one transaction) as closely as a
 * non-transactional in-memory store can. Never copies global Template staffing (Team Leads/Members)
 * — createWorkstream never reads service_team_leads/service_employees, so neither does this. */
async function applyTemplatesInternal(
  viewer: User,
  projectId: string,
  templates: ProjectTemplateSelection[]
): Promise<WorkstreamWithRelations[]> {
  const created: WorkstreamWithRelations[] = [];
  try {
    for (const template of templates) {
      const serviceLine = db.serviceLines.find((sl) => sl.id === template.serviceLineId && sl.isActive);
      if (!serviceLine) throw new Error("Template is not active or not found.");
      const activityIds =
        template.activityIds ??
        db.activities
          .filter((a) => a.isActive)
          .filter((a) => {
            const department = db.departments.find((d) => d.id === a.departmentId);
            return department?.serviceLineId === template.serviceLineId && department.brandId === null;
          })
          .map((a) => a.id);
      const ws = await mockWorkstreamsProvider.createWorkstream(viewer, {
        name: serviceLine.name,
        description: null,
        companyId: "",
        projectId,
        serviceLineId: template.serviceLineId,
        leadUserId: template.leadUserId ?? viewer.id,
        teamUserIds: [],
        activityIds,
        status: "active",
        startDate: null,
        endDate: null,
        recurrenceFrequency: null,
        recurrenceAnchorDate: null,
        recurrenceCustomIntervalDays: null,
        previousOccurrenceWorkstreamId: null,
      });
      created.push(ws);
    }
    return created;
  } catch (err) {
    // Best-effort compensating rollback — real Supabase gets this for free from the RPC's own
    // transaction; the mock has no transactions, so it undoes what it already created instead.
    db.workstreams = db.workstreams.filter((w) => !created.some((c) => c.id === w.id));
    db.workstreamActivities = db.workstreamActivities.filter((wa) => !created.some((c) => c.id === wa.workstreamId));
    db.workstreamMembers = db.workstreamMembers.filter((wm) => !created.some((c) => c.id === wm.workstreamId));
    throw err;
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

  const partnerBrand = project.partnerBrandId ? (db.brands.find((b) => b.id === project.partnerBrandId) ?? null) : null;

  return {
    ...project,
    companyName: company.name,
    isInternal: company.id === INTERNAL_COMPANY_ID,
    owner,
    partnerBrand,
    createdBy,
    members,
    memberCount: members.length,
    workstreamCount,
    services: servicesFor(project.id),
    tasks,
    progressPercent,
  };
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
    if (!canCreateProject(viewer)) {
      throw new Error("Only an admin or a team lead may create a project.");
    }
    requireCompanyFound(input.companyId);
    if (!input.name.trim()) throw new Error("Title can't be empty.");
    // Phase 3 (CD-208) — a Team Lead always becomes the owner of their own Project, never
    // client-chosen; only Admin may pick a different owner (defaulting to themselves).
    const effectiveOwnerId = isSupervisor(viewer) && !isSuperadmin(viewer) ? viewer.id : (input.ownerId ?? viewer.id);
    requireActiveOwner(effectiveOwnerId);
    if (input.projectGroupId && !db.projectGroups.some((g) => g.id === input.projectGroupId)) {
      throw new Error("Project Group not found.");
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
      archivedAt: null,
      startDate: input.startDate,
      endDate: input.endDate,
      projectGroupId: input.projectGroupId,
      partnerBrandId: input.partnerBrandId,
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

    if (input.templates && input.templates.length > 0) {
      try {
        await applyTemplatesInternal(viewer, id, input.templates);
      } catch (err) {
        // Atomic-in-spirit: a failed Template application rolls back the whole Project creation too.
        db.projects = db.projects.filter((p) => p.id !== id);
        db.projectMembers = db.projectMembers.filter((m) => m.projectId !== id);
        throw err;
      }
    }

    return toProjectWithRelations(project)!;
  },

  // Project/client consolidation — the ONE normal "New Project" workflow for a brand-new client.
  // Creates the Company (+ optional primary contact) then delegates entirely to this same
  // `createProject` for the Project row — never a duplicated insert. Mock has no real transaction,
  // so failure after the Company is created triggers a best-effort compensating delete (mirroring
  // the real hosted RPC's genuine transactional rollback).
  async createClientProject(viewer, input: ClientProjectInput): Promise<ProjectWithRelations> {
    if (!canCreateProject(viewer)) {
      throw new Error("Only an admin or a team lead may create a project.");
    }
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
        partnerBrandId: input.partnerBrandId ?? input.brandId,
        tags: input.tags,
        memberUserIds: input.memberUserIds,
        templates: input.templates,
      });
    } catch (err) {
      db.companies = db.companies.filter((c) => c.id !== company.id);
      db.contacts = db.contacts.filter((c) => c.companyId !== company.id);
      throw err;
    }
  },

  // Ordinary metadata edit only — status lifecycle never goes through here, see
  // setProjectStatus/trashProject/restoreProject below. Phase 3 (CD-208) — gated by
  // canManageProjectRecord (Admin, or the Supervisor who is literally this Project's owner), not
  // the old blanket canManageProjects. Protected fields (name, owner, Partner Brand) are silently
  // kept at their current value for a non-Admin caller, enforced here in the "backend" — never
  // trusting the client, matching the real Supabase update_project_record RPC's own behavior.
  async updateProject(viewer, id, input: ProjectInput) {
    const existing = db.projects.find((p) => p.id === id);
    if (!existing) throw new Error("Project not found.");
    requireManageRecord(viewer, existing);
    const admin = isSuperadmin(viewer);
    if (admin && !input.name.trim()) throw new Error("Title can't be empty.");
    const effectiveOwnerId = admin ? (input.ownerId ?? existing.ownerId) : existing.ownerId;
    if (admin) requireActiveOwner(effectiveOwnerId);
    if (input.projectGroupId && !db.projectGroups.some((g) => g.id === input.projectGroupId)) {
      throw new Error("Project Group not found.");
    }

    const updated: Project = {
      ...existing,
      name: admin ? input.name.trim() : existing.name,
      ownerId: effectiveOwnerId,
      partnerBrandId: admin ? input.partnerBrandId : existing.partnerBrandId,
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
    // Phase 3 (CD-208) section 29 — Team Lead must not gain new Member-staffing rights; member sync
    // stays Admin-only (unchanged from before).
    if (admin) syncMembers(id, input.memberUserIds);

    return toProjectWithRelations(updated)!;
  },

  async applyProjectTemplates(viewer, projectId, templates) {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found.");
    requireManageRecord(viewer, project);
    return applyTemplatesInternal(viewer, projectId, templates);
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

  async setProjectStatus(viewer, id, status, reason) {
    requireAdmin(viewer);
    // Boss-Aligned Project Status Restoration — the normal Project business-state set is Active/On
    // Hold/Completed/Canceled/Archived (mirrors the hosted `set_project_status` RPC exactly).
    if (status !== "active" && status !== "on-hold" && status !== "completed" && status !== "cancelled" && status !== "archived") {
      throw new Error(`Invalid status for this action: ${status}`);
    }
    const existing = db.projects.find((p) => p.id === id);
    if (!existing) throw new Error("Project not found.");
    if (existing.status === "trash") throw new Error("This project is in Trash — restore it first.");
    if ((status === "on-hold" || status === "cancelled") && !reason?.trim()) {
      throw new Error(`A reason is required when moving a project to ${status}.`);
    }

    const updated: Project = {
      ...existing,
      status,
      statusReason: status === "on-hold" || status === "cancelled" ? reason!.trim() : null,
      statusChangedAt: new Date().toISOString(),
      statusChangedById: viewer.id,
      // Two intentionally distinct dates, never conflated: completionDate is a genuine successful
      // completion, stamped once and never overwritten by any later transition (including a later
      // Archive/Cancel/re-Active); archivedAt is the Archive lifecycle's own date, always updated to
      // the latest Archive (so a later re-Archive correctly reflects the newest date) and never
      // touched by Reactivate (so "Previously Archived On" survives it).
      completionDate: status === "completed" && !existing.completionDate ? new Date().toISOString().slice(0, 10) : existing.completionDate,
      archivedAt: status === "archived" ? new Date().toISOString() : existing.archivedAt,
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
    // Phase 3 (CD-208) section 30 — widened from Admin-only to Admin-or-Supervisor.
    if (!isSuperadmin(viewer) && !isSupervisor(viewer)) {
      throw new Error("Only an admin or a team lead may create a Project Group.");
    }
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
