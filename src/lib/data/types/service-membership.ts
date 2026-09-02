/**
 * Admin Foundation Part 6 — global Service staffing. Team Lead / Employee membership is a
 * relationship between a user and a Service Line, global across every Project/Workstream that
 * happens to use that service (never per-Project). Deliberately two concrete shapes (mirroring the
 * two underlying tables, service_team_leads/service_employees), not one polymorphic membership
 * type — Leadership and Membership have different write-rules (Leadership is role-restricted to
 * active Team Leads).
 */
export interface ServiceStaffing {
  serviceLineId: string;
  teamLeadUserIds: string[];
  employeeUserIds: string[];
}
