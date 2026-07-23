import type { Role } from "./role";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  /** Direct manager. Null for superadmins / anyone with no supervisor. */
  supervisorId: string | null;
  /** Company IDs this user is scoped to — the primary visibility gate. */
  assignedCompanyIds: string[];
  createdAt: string;
}
