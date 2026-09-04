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
  ProjectTemplate,
  ProjectTrashSettings,
  TimeEntryCorrection,
  VisitEntry,
} from "../../types";

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
  workstreams: [...seedWorkstreams],
  workstreamMembers: [...seedWorkstreamMembers],
  workstreamActivities: [...seedWorkstreamActivities],
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
  departments: [...seedDepartments],
  activities: [...seedActivities],
  accomplishmentsReports: [...seedAccomplishmentsReports],
  savedViews: [...seedSavedViews],
  projects: [...seedProjects],
  projectMembers: [...seedProjectMembers],
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
  // Project Level completion pass — Templates, member responsibility (folded into projectMembers'
  // own rows, see seed-project-members.ts), Trash retention.
  projectTemplates: [] as ProjectTemplate[],
  // Correction — each entry references an existing Service Template/recipe (`templates.id`), never
  // a bare Service Line. serviceLineId is always derived from that recipe, never independent input.
  projectTemplateServices: [] as { projectTemplateId: string; serviceTemplateId: string; serviceLineId: string }[],
  projectTemplateActivities: [] as { projectTemplateId: string; serviceTemplateId: string; activityId: string }[],
  projectTrashSettings: { retentionDays: null, updatedAt: new Date().toISOString() } as ProjectTrashSettings,
};
