import type { Role, User } from "../types";

/** Admin Foundation — a User row shaped for the Admin Users list/edit screens, joined with this
 * user's own global Service staffing. serviceLeadershipIds only ever has entries for a Team Lead
 * (supervisor); serviceMembershipIds for Employee/Team Lead; always empty for Admin. */
export interface AdminUserRow extends User {
  serviceLeadershipIds: string[];
  serviceMembershipIds: string[];
}

export interface AdminCreateUserInput {
  fullName: string;
  email: string;
  initialPassword: string;
  role: Role;
  /** Only meaningful when role === "supervisor". */
  serviceLeadershipIds?: string[];
  /** Only meaningful when role is "employee" or "supervisor". */
  serviceMembershipIds?: string[];
}

/**
 * Admin Foundation Part 13 — Admin-only user lifecycle management: create, edit name/role/
 * Services, deactivate/reactivate, reset password. No hard delete — every mutation is superadmin-
 * gated both here (a UI-facing convenience check, matching this codebase's usual RPC-is-the-real-
 * boundary pattern) and, authoritatively, by the underlying SECURITY DEFINER RPC/Server Action.
 * Role-change Service-membership cleanup (Stage 0 Corrections 3/4) is enforced at the DB layer by
 * admin_set_user_role itself — never re-implemented here.
 */
export interface AdminUsersProvider {
  listUsers(viewer: User): Promise<AdminUserRow[]>;
  createUser(viewer: User, input: AdminCreateUserInput): Promise<AdminUserRow>;
  setFullName(viewer: User, userId: string, fullName: string): Promise<AdminUserRow>;
  setRole(viewer: User, userId: string, role: Role): Promise<AdminUserRow>;
  setActive(viewer: User, userId: string, active: boolean): Promise<AdminUserRow>;
  /** Replace-set semantics — the caller submits the full desired set, never a delta. */
  setServiceLeadership(viewer: User, userId: string, serviceLineIds: string[]): Promise<AdminUserRow>;
  setServiceMembership(viewer: User, userId: string, serviceLineIds: string[]): Promise<AdminUserRow>;
  /** Admin can never view/retrieve the resulting password — this always resolves to void. */
  resetPassword(viewer: User, userId: string, newPassword: string): Promise<void>;
}
