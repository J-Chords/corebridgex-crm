import type { ServiceStaffing, User } from "../types";

/**
 * Admin Foundation Part 14 — the Service-side mirror of AdminUsersProvider's per-user Service
 * staffing methods: same two underlying tables (service_team_leads/service_employees), viewed and
 * mutated from the Service's own angle instead of the user's. Reuses the existing Service Line
 * catalog (`companiesProvider.listServiceLines`) — never a duplicate catalog. Global to the
 * Service, never per-Project/per-Workstream. Admin-only mutation.
 */
export interface ServiceMembershipProvider {
  listServiceStaffing(viewer: User): Promise<ServiceStaffing[]>;
  /**
   * Project Level Part 12 — read-only, for any active viewer (not Admin-gated like
   * `listServiceStaffing`): the DB's own RLS already allows any active user to read these two
   * tables (`service_team_leads`/`service_employees` are org-directory data, not sensitive), so a
   * legitimate Project viewer can see "who globally leads/works in" a Service their Project uses.
   * Displaying this never grants new authority — see `docs/project-level-product-architecture.md`.
   */
  getStaffingForServiceLines(viewer: User, serviceLineIds: string[]): Promise<ServiceStaffing[]>;
  /** Replace-set semantics. Every user id must be an active supervisor — enforced at the DB layer
   * regardless of this check. */
  setTeamLeads(viewer: User, serviceLineId: string, userIds: string[]): Promise<ServiceStaffing>;
  /** Replace-set semantics. Every user id must be active employee-or-supervisor, never superadmin. */
  setEmployees(viewer: User, serviceLineId: string, userIds: string[]): Promise<ServiceStaffing>;
}
