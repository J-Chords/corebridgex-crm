import type { Role } from "./types";

/**
 * Admin Foundation — visible role names, deliberately decoupled from the technical DB role
 * values ("superadmin"/"supervisor"/"employee", unchanged, since renaming a DB enum/text value
 * would touch every RLS policy and helper function that compares against it for no benefit).
 * Every screen must read a role name through this map, never render `user.role` raw.
 */
export const ROLE_LABELS: Record<Role, string> = {
  employee: "Employee",
  supervisor: "Team Lead",
  superadmin: "Admin",
};
