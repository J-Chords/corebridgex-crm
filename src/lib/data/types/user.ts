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
  /**
   * Phase 9E — an orthogonal capability, NOT a fourth role: Corebridge still has exactly Employee/
   * Supervisor/Superadmin. Grants the narrow "Sparing Efficiency" Client Report review/finalization
   * privileges (org-wide Client Report view, wording-only draft edits, finalize) regardless of role
   * — an Employee with this set gets those privileges, a Supervisor without it does not, even for
   * their own direct report's draft. Only a Superadmin may grant/revoke it
   * (`set_reporting_review_access`); Superadmin itself is always treated as having every reviewer
   * privilege, granted or not (`hasReportingReviewAccess`). Never inferred from role/title/department/
   * email/name.
   */
  reportingReviewAccess: boolean;
  /**
   * Admin Foundation — true for an Admin-created account until the user completes their own
   * forced first password change (`complete_required_password_change()`), and re-armed by an
   * Admin-driven password reset. Always false for pre-existing users. Never a fourth role.
   */
  mustChangePassword: boolean;
  createdAt: string;
}
