import type { WorkstreamMember } from "../../types";

/**
 * Initial workstream staffing, backfilled from whichever active users already
 * had that workstream's company in their assignedCompanyIds — so nobody loses
 * visibility into work they could already see before workstreams existed.
 * Supervisors aren't listed explicitly; canAccessWorkstream's supervisor branch
 * already grants access via managing a team member who is listed.
 */
export const seedWorkstreamMembers: WorkstreamMember[] = [
  { workstreamId: "workstream-1", userId: "user-employee-1" }, // Alicia — company-1
  { workstreamId: "workstream-2", userId: "user-employee-1" }, // Alicia — company-2
  { workstreamId: "workstream-3", userId: "user-employee-2" }, // Sam — company-3 (Payroll)
  { workstreamId: "workstream-4", userId: "user-employee-2" }, // Sam — company-3 (Bookkeeping)
  { workstreamId: "workstream-5", userId: "user-employee-2" }, // Sam — company-4
  { workstreamId: "workstream-6", userId: "user-employee-3" }, // Dana — company-5
  { workstreamId: "workstream-7", userId: "user-employee-3" }, // Dana — company-6
  { workstreamId: "workstream-8", userId: "user-employee-4" }, // Leo — company-7
  { workstreamId: "workstream-9", userId: "user-employee-4" }, // Leo — company-8
  // workstream-10/11 (company-9/company-10) and the Internal workstream have no
  // additional team members — company-9/10 aren't in anyone's assignedCompanyIds
  // today (superadmin-only), and Internal is always visible via canAccessWorkstream.
];
