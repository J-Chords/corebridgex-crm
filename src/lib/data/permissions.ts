import type { User } from "./types";

/**
 * Single source of truth for RBAC. Every screen, API route, and data-provider
 * implementation should call these instead of checking `user.role` inline.
 * When we add Supabase RLS policies later, they mirror these rules in SQL —
 * this module stays the source of truth; RLS is a defense-in-depth backstop.
 */

export function isSuperadmin(user: User): boolean {
  return user.role === "superadmin";
}

export function isSupervisor(user: User): boolean {
  return user.role === "supervisor";
}

export function isEmployee(user: User): boolean {
  return user.role === "employee";
}

/** True if `manager` is `target`'s direct supervisor, or superadmin (sees everyone's team). */
export function managesUser(manager: User, target: User): boolean {
  if (isSuperadmin(manager)) return true;
  if (manager.id === target.id) return true;
  return isSupervisor(manager) && target.supervisorId === manager.id;
}

/** Company visibility gate: assignedCompanyIds is the primary scope for employees/supervisors. */
export function canAccessCompany(user: User, companyId: string): boolean {
  if (isSuperadmin(user)) return true;
  return user.assignedCompanyIds.includes(companyId);
}

export function canManageTeam(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

export function canInviteUsers(user: User): boolean {
  return isSuperadmin(user);
}

export function canViewOrgCounts(user: User): boolean {
  return isSuperadmin(user);
}

export function canViewUserReport(viewer: User, target: User): boolean {
  return managesUser(viewer, target);
}

export function canGenerateClientFacingReport(user: User, companyId: string): boolean {
  return canAccessCompany(user, companyId);
}
