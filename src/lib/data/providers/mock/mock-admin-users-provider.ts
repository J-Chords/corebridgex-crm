import type { AdminUsersProvider, AdminCreateUserInput, AdminUserRow } from "../admin-users-provider";
import type { Role, User } from "../../types";
import { canManageAdminUsers } from "../../permissions";
import { db } from "./mock-db";

function requireAdmin(viewer: User) {
  if (!canManageAdminUsers(viewer)) {
    throw new Error("Only an admin can manage users.");
  }
}

/** Mirrors the hosted enforce_last_active_superadmin trigger exactly — the last active Admin can
 * never be demoted or deactivated. */
function requireNotLastActiveAdmin(user: User) {
  if (user.role !== "superadmin" || !user.active) return;
  const otherActiveAdmins = db.users.filter(
    (u) => u.id !== user.id && u.role === "superadmin" && u.active
  );
  if (otherActiveAdmins.length === 0) {
    throw new Error("Cannot remove or deactivate the last active admin.");
  }
}

function toRow(user: User): AdminUserRow {
  return {
    ...user,
    serviceLeadershipIds: db.serviceTeamLeads.filter((r) => r.userId === user.id).map((r) => r.serviceLineId),
    serviceMembershipIds: db.serviceEmployees.filter((r) => r.userId === user.id).map((r) => r.serviceLineId),
  };
}

/** Mirrors admin_set_user_role's own role-change Service-membership cleanup (Stage 0 Corrections
 * 3/4) exactly — Team Lead -> Employee drops leadership only; anything -> Admin drops both. */
function applyRoleChangeCleanup(userId: string, newRole: Role) {
  if (newRole === "employee") {
    db.serviceTeamLeads = db.serviceTeamLeads.filter((r) => r.userId !== userId);
  } else if (newRole === "superadmin") {
    db.serviceTeamLeads = db.serviceTeamLeads.filter((r) => r.userId !== userId);
    db.serviceEmployees = db.serviceEmployees.filter((r) => r.userId !== userId);
  }
}

export const mockAdminUsersProvider: AdminUsersProvider = {
  async listUsers(viewer) {
    requireAdmin(viewer);
    return db.users.map(toRow);
  },

  async createUser(viewer, input: AdminCreateUserInput) {
    requireAdmin(viewer);
    const fullName = input.fullName.trim();
    const email = input.email.trim();
    if (!fullName) throw new Error("Name can't be empty.");
    if (!email) throw new Error("Email can't be empty.");
    if (!input.initialPassword || input.initialPassword.length < 8) {
      throw new Error("Initial password must be at least 8 characters.");
    }
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Another account already uses that email.");
    }

    const id = crypto.randomUUID();
    const user: User = {
      id,
      fullName,
      email,
      role: input.role,
      active: true,
      supervisorId: null,
      assignedCompanyIds: [],
      reportingReviewAccess: false,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    db.users = [...db.users, user];

    if (input.role === "supervisor" && input.serviceLeadershipIds?.length) {
      db.serviceTeamLeads = [
        ...db.serviceTeamLeads,
        ...input.serviceLeadershipIds.map((serviceLineId) => ({ serviceLineId, userId: id })),
      ];
    }
    if ((input.role === "employee" || input.role === "supervisor") && input.serviceMembershipIds?.length) {
      db.serviceEmployees = [
        ...db.serviceEmployees,
        ...input.serviceMembershipIds.map((serviceLineId) => ({ serviceLineId, userId: id })),
      ];
    }
    return toRow(user);
  },

  async setFullName(viewer, userId, fullName) {
    requireAdmin(viewer);
    const trimmed = fullName.trim();
    if (!trimmed) throw new Error("Name can't be empty.");
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new Error(`User ${userId} not found.`);
    const updated = { ...target, fullName: trimmed };
    db.users = db.users.map((u) => (u.id === userId ? updated : u));
    return toRow(updated);
  },

  async setRole(viewer, userId, role) {
    requireAdmin(viewer);
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new Error(`User ${userId} not found.`);
    if (target.role !== role) requireNotLastActiveAdmin(target);
    const updated = { ...target, role };
    db.users = db.users.map((u) => (u.id === userId ? updated : u));
    applyRoleChangeCleanup(userId, role);
    return toRow(updated);
  },

  async setActive(viewer, userId, active) {
    requireAdmin(viewer);
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new Error(`User ${userId} not found.`);
    if (!active) requireNotLastActiveAdmin(target);
    const updated = { ...target, active };
    db.users = db.users.map((u) => (u.id === userId ? updated : u));
    return toRow(updated);
  },

  async setServiceLeadership(viewer, userId, serviceLineIds) {
    requireAdmin(viewer);
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new Error(`User ${userId} not found.`);
    if (target.role !== "supervisor" || !target.active) {
      throw new Error("Only an active Team Lead can lead a Service.");
    }
    db.serviceTeamLeads = [
      ...db.serviceTeamLeads.filter((r) => r.userId !== userId),
      ...Array.from(new Set(serviceLineIds)).map((serviceLineId) => ({ serviceLineId, userId })),
    ];
    return toRow(target);
  },

  async setServiceMembership(viewer, userId, serviceLineIds) {
    requireAdmin(viewer);
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new Error(`User ${userId} not found.`);
    if (target.role === "superadmin" || !target.active) {
      throw new Error("Only an active Employee or Team Lead can be a Service member.");
    }
    db.serviceEmployees = [
      ...db.serviceEmployees.filter((r) => r.userId !== userId),
      ...Array.from(new Set(serviceLineIds)).map((serviceLineId) => ({ serviceLineId, userId })),
    ];
    return toRow(target);
  },

  async resetPassword(viewer, userId) {
    requireAdmin(viewer);
    const target = db.users.find((u) => u.id === userId);
    if (!target) throw new Error(`User ${userId} not found.`);
    // Mock mode has no real credential store — only re-arms the forced-change flag, mirroring the
    // real Admin API path's own must_change_password re-arm.
    const updated = { ...target, mustChangePassword: true };
    db.users = db.users.map((u) => (u.id === userId ? updated : u));
  },
};
