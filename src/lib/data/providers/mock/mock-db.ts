import { seedUsers } from "./seed-users";
import { seedBrands } from "./seed-brands";
import { seedServiceLines } from "./seed-service-lines";
import { seedCompanies } from "./seed-companies";
import { seedCompanyServiceLines } from "./seed-company-service-lines";
import { seedClientContacts } from "./seed-client-contacts";
import { seedWorkstreams } from "./seed-workstreams";
import { seedWorkstreamMembers } from "./seed-workstream-members";
import { seedWorkstreamActivities } from "./seed-workstream-activities";
import { seedTasks } from "./seed-tasks";
import { seedTaskAssignees } from "./seed-task-assignees";
import { seedChecklistItems } from "./seed-checklist-items";
import { seedNotifications } from "./seed-notifications";
import { seedTimeEntries } from "./seed-time-entries";
import { seedNotes } from "./seed-notes";
import { seedTemplates } from "./seed-templates";
import { seedTemplateTasks } from "./seed-template-tasks";
import { seedTemplateChecklistItems } from "./seed-template-checklist-items";
import { seedTaskHandoffs } from "./seed-task-handoffs";
import { seedDepartments } from "./seed-departments";
import { seedActivities } from "./seed-activities";
import { seedAccomplishmentsReports } from "./seed-accomplishments-reports";
import { seedSavedViews } from "./seed-saved-views";
import { seedProjects } from "./seed-projects";
import { seedProjectMembers } from "./seed-project-members";
import { seedProjectGroups } from "./seed-project-groups";
import type {
  ClientReport,
  ClientReportSchedule,
  DailyUpdate,
  Document,
  ProjectComment,
  ProjectIssue,
  ProjectTeamLead,
  ProjectTrashSettings,
  TimeEntryCorrection,
  VisitEntry,
} from "../../types";

/**
 * Phase 3 (CD-208) — canonical Template/Activity brand decoupling, mirrored from the hosted
 * migration's own data migration (`20260924100000_phase3_canonical_template_brand_decoupling.sql`):
 * one canonical (brandId = null) Department per Service Line that has any seeded Department, with
 * every one of that Service Line's Activities re-pointed onto it. Only one seed Brand ("Sparing
 * Consulting") has any Departments at all, so there is no cross-Brand name-collision risk to guard
 * against here (unlike the hosted migration, which defensively checks for one).
 */
const serviceLineIdsWithDepartments = Array.from(
  new Set(seedDepartments.filter((d) => d.serviceLineId).map((d) => d.serviceLineId as string))
);
const canonicalDepartmentIdByServiceLineId = new Map(
  serviceLineIdsWithDepartments.map((serviceLineId) => [serviceLineId, `dept-canonical-${serviceLineId}`])
);
const canonicalDepartments = serviceLineIdsWithDepartments.map((serviceLineId, index) => ({
  id: canonicalDepartmentIdByServiceLineId.get(serviceLineId)!,
  brandId: null,
  name: seedServiceLines.find((sl) => sl.id === serviceLineId)?.name ?? "General",
  position: index,
  serviceLineId,
}));
const legacyDepartmentIdsByServiceLineId = new Map(
  serviceLineIdsWithDepartments.map((serviceLineId) => [
    serviceLineId,
    new Set(seedDepartments.filter((d) => d.serviceLineId === serviceLineId).map((d) => d.id)),
  ])
);
const activitiesWithCanonicalDepartment = seedActivities.map((a) => {
  for (const [serviceLineId, legacyIds] of legacyDepartmentIdsByServiceLineId) {
    if (legacyIds.has(a.departmentId)) {
      return { ...a, departmentId: canonicalDepartmentIdByServiceLineId.get(serviceLineId)! };
    }
  }
  return a;
});
const departmentsWithCanonical = [...seedDepartments, ...canonicalDepartments];

/**
 * Phase 3 (CD-208) — true Template/Activity snapshot semantics, mirrored from the hosted
 * migration's own one-time backfill (`20260924110000_phase3_template_snapshot_schema.sql`): every
 * seeded Workstream-Activity association is frozen with its CURRENT (seed-time) name/description/
 * defaultTaskTitles/position, and every seeded Workstream's `name` is frozen to its current Service
 * Line name, so switching `workstreamDisplayHeading` away from a live join is invisible for
 * existing seed data — exactly the same "capture current state at migration time" step the real
 * migration performs, just done here at mock-module-load time instead of via SQL.
 */
const workstreamActivitiesWithSnapshot = seedWorkstreamActivities.map((wa) => {
  const activity = seedActivities.find((a) => a.id === wa.activityId);
  return {
    ...wa,
    name: activity?.name ?? "Unknown Activity",
    description: activity?.description ?? null,
    defaultTaskTitles: activity?.defaultTaskTitles ?? [],
    position: activity?.position ?? 0,
  };
});

const workstreamsWithFrozenNames = seedWorkstreams.map((w) => {
  if (!w.serviceLineId) return w;
  const serviceLine = seedServiceLines.find((sl) => sl.id === w.serviceLineId);
  return serviceLine ? { ...w, name: serviceLine.name } : w;
});

/**
 * Single in-memory mock "database", shared by every mock provider so a
 * mutation made through one provider (e.g. assigning staff to a company)
 * is immediately visible to the others (e.g. the auth session's user
 * record). Resets to seed data on a full page reload — that's expected
 * for a mock backend, not a bug.
 */
export const db = {
  users: [...seedUsers],
  brands: [...seedBrands],
  serviceLines: [...seedServiceLines],
  companies: [...seedCompanies],
  companyServiceLines: [...seedCompanyServiceLines],
  contacts: [...seedClientContacts],
  workstreams: [...workstreamsWithFrozenNames],
  workstreamMembers: [...seedWorkstreamMembers],
  workstreamActivities: [...workstreamActivitiesWithSnapshot],
  tasks: [...seedTasks],
  taskAssignees: [...seedTaskAssignees],
  checklistItems: [...seedChecklistItems],
  notifications: [...seedNotifications],
  timeEntries: [...seedTimeEntries],
  // No seed rows — corrections only ever come from a real Supervisor/Superadmin action taken in-app.
  timeEntryCorrections: [] as TimeEntryCorrection[],
  notes: [...seedNotes],
  templates: [...seedTemplates],
  templateTasks: [...seedTemplateTasks],
  templateChecklistItems: [...seedTemplateChecklistItems],
  taskHandoffs: [...seedTaskHandoffs],
  departments: [...departmentsWithCanonical],
  activities: [...activitiesWithCanonicalDepartment],
  accomplishmentsReports: [...seedAccomplishmentsReports],
  savedViews: [...seedSavedViews],
  projects: [...seedProjects],
  projectMembers: [...seedProjectMembers],
  // Phase 4 — no seed rows. No historical Project ever had an Additional Team Lead (a purely
  // additive new relation); populated at runtime as people staff a Project.
  projectTeamLeads: [] as ProjectTeamLead[],
  // No seed rows here on purpose — every row is dated "today" at creation time, and seed data is
  // all fixed past dates. Populated at runtime as people open My Day.
  dailyUpdates: [] as DailyUpdate[],
  // No seed rows — generated on demand from a company + date range, same as accomplishmentsReports
  // started before any were seeded.
  clientReports: [] as ClientReport[],
  // Phase 9F — no seed rows, same rationale as dailyUpdates: every row is dated "today" at creation
  // time, populated at runtime as people log a Visit from My Day.
  visitEntries: [] as VisitEntry[],
  // Phase 9F — no seed rows; created at runtime by a reporting reviewer/superadmin from the
  // Schedules tab.
  clientReportSchedules: [] as ClientReportSchedule[],
  // Phase 14B — no seed rows; no UI exists yet to create them through. Mock security probes create
  // their own throwaway rows directly via mockDocumentsProvider.
  documents: [] as Document[],
  // Admin Foundation — global Service staffing. No seed rows: zero-Service Team Lead/Employee
  // membership is a valid starting state for every existing seeded user, per Stage 1's own explicit
  // "zero-Service creation is valid" rule.
  serviceTeamLeads: [] as { serviceLineId: string; userId: string }[],
  serviceEmployees: [] as { serviceLineId: string; userId: string }[],
  // Project Level Stage C.
  projectGroups: [...seedProjectGroups],
  projectComments: [] as ProjectComment[],
  projectIssues: [] as ProjectIssue[],
  projectTrashSettings: { retentionDays: null, updatedAt: new Date().toISOString() } as ProjectTrashSettings,
};
