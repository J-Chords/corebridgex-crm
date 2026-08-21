import type { ClientReportSchedulesProvider, ReportableProjectRef } from "../client-report-schedules-provider";
import type { ClientReport, ClientReportSchedule, User } from "../../types";
import { canManageClientReportSchedules } from "../../permissions";
import { computeWeeklyReportSections } from "../../client-report-weekly";
import { computeNextClientReportRun, computeScheduledReportRange } from "../../client-report-schedule-timing";
import { INTERNAL_COMPANY_ID } from "../../constants";
import { gatherWeeklyEvidenceForProject } from "./mock-client-report-provider";
import { db } from "./mock-db";

function requireScheduleAccess(viewer: User) {
  if (!canManageClientReportSchedules(viewer)) {
    throw new Error("Only a reporting reviewer or superadmin can manage recurring Client Report schedules.");
  }
}

/**
 * Generates (idempotently) the Draft for `schedule`'s current computed period — the mock-provider
 * equivalent of `run_one_client_report_schedule`, used by BOTH `runScheduleNow` and
 * `processDueSchedulesForTesting` (Section 39/52: one generation function, no divergent "test"
 * algorithm). Deliberately reuses the SAME `gatherWeeklyEvidenceForProject` + `computeWeeklyReportSections`
 * the manual generator uses, passing an EMPTY `dailyUpdateEntries` array — Section 36's own locked
 * simplification for automated generation (Task description/title only, never Daily Update
 * narrative, never Task Notes) is achieved for free this way: with no candidates, `resolveNarrative`
 * always falls through to description/title, with zero separate code path to maintain.
 */
function runOneSchedule(schedule: ClientReportSchedule): ClientReport {
  const { rangeStart, rangeEnd } = computeScheduledReportRange(schedule.timezone, new Date());

  const existing = db.clientReports.find((r) => r.scheduleId === schedule.id && r.rangeStart === rangeStart && r.rangeEnd === rangeEnd);
  if (existing) return existing;

  const project = db.projects.find((p) => p.id === schedule.projectId);
  if (!project) throw new Error("Project not found.");
  const company = db.companies.find((c) => c.id === project.companyId);
  if (!company) throw new Error(`Project ${project.id} references unknown company ${project.companyId}`);
  const brand = db.brands.find((b) => b.id === company.brandId);
  if (!brand) throw new Error(`Company ${company.id} references unknown brand ${company.brandId}`);
  const creator = db.users.find((u) => u.id === schedule.createdBy);

  const { tasks, timeEvidence, visitEvidence } = gatherWeeklyEvidenceForProject(schedule.projectId);
  const { departments, warnings, dailyVisitMinutes } = computeWeeklyReportSections({
    tasks,
    timeEvidence,
    dailyUpdateEntries: [],
    visitEvidence,
    activities: db.activities,
    departments: db.departments,
    knownStaffNames: db.users.map((u) => u.fullName),
    rangeStart,
    rangeEnd,
  });

  const now = new Date().toISOString();
  const history = warnings.map((message) => ({
    id: crypto.randomUUID(),
    type: "generation-warning" as const,
    actorId: schedule.createdBy,
    actorName: creator?.fullName ?? "",
    createdAt: now,
    message,
  }));

  const report: ClientReport = {
    id: crypto.randomUUID(),
    projectId: project.id,
    companyId: company.id,
    companyLabel: company.name,
    brandId: brand.id,
    brandLabel: brand.name,
    rangeLabel: "custom",
    rangeStart,
    rangeEnd,
    status: "draft",
    departments,
    dailyVisitMinutes,
    scheduleId: schedule.id,
    comments: [],
    history,
    generatedById: schedule.createdBy,
    generatedByName: creator?.fullName ?? "",
    generatedAt: now,
    finalizedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.clientReports = [...db.clientReports, report];

  db.clientReportSchedules = db.clientReportSchedules.map((s) =>
    s.id === schedule.id
      ? { ...s, lastRunAt: now, lastReportId: report.id, updatedAt: now, nextRunAt: computeNextClientReportRun(s.weekday, s.localTime, s.timezone, new Date()).toISOString() }
      : s
  );
  return report;
}

/** Mock has no background cron — this is the testable equivalent of the due-runner, calling the
 * exact same `runOneSchedule` (Section 52: due-schedule behavior must be testable through the same
 * provider contract even though background cron itself doesn't literally run in mock). */
export function processDueSchedulesForTesting(now: Date = new Date()) {
  for (const schedule of db.clientReportSchedules) {
    if (!schedule.active) continue;
    if (new Date(schedule.nextRunAt).getTime() > now.getTime()) continue;
    try {
      runOneSchedule(schedule);
    } catch {
      db.clientReportSchedules = db.clientReportSchedules.map((s) =>
        s.id === schedule.id ? { ...s, nextRunAt: computeNextClientReportRun(s.weekday, s.localTime, s.timezone, now).toISOString() } : s
      );
    }
  }
}

export const mockClientReportSchedulesProvider: ClientReportSchedulesProvider = {
  async listSchedules(viewer) {
    if (!canManageClientReportSchedules(viewer)) return [];
    return db.clientReportSchedules;
  },

  async listSchedulableProjects(viewer) {
    if (!canManageClientReportSchedules(viewer)) return [];
    const refs: ReportableProjectRef[] = [];
    for (const project of db.projects) {
      if (project.companyId === INTERNAL_COMPANY_ID) continue;
      const company = db.companies.find((c) => c.id === project.companyId);
      if (!company) continue;
      refs.push({ projectId: project.id, projectName: project.name, companyId: company.id, companyName: company.name });
    }
    return refs.sort((a, b) => a.companyName.localeCompare(b.companyName) || a.projectName.localeCompare(b.projectName));
  },

  async createSchedule(viewer, input) {
    requireScheduleAccess(viewer);
    // Phase 9 final integrity hotfix: scheduling is an orthogonal, organization-wide Client
    // Reporting capability, not ordinary operational Project access — requires only that the
    // Project genuinely exists and is a real Client Project (never Internal/Non-billable), never
    // `canAccessProject`.
    const project = db.projects.find((p) => p.id === input.projectId);
    if (!project) throw new Error("Project not found.");
    if (project.companyId === INTERNAL_COMPANY_ID) {
      throw new Error("Recurring Client Report schedules can only be created for a Client Project, not Internal/Non-billable work.");
    }
    const now = new Date().toISOString();
    const schedule: ClientReportSchedule = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      createdBy: viewer.id,
      active: true,
      weekday: input.weekday,
      localTime: input.localTime,
      timezone: input.timezone,
      nextRunAt: computeNextClientReportRun(input.weekday, input.localTime, input.timezone, new Date()).toISOString(),
      lastRunAt: null,
      lastReportId: null,
      createdAt: now,
      updatedAt: now,
    };
    db.clientReportSchedules = [...db.clientReportSchedules, schedule];
    return schedule;
  },

  async updateSchedule(viewer, id, input) {
    requireScheduleAccess(viewer);
    const existing = db.clientReportSchedules.find((s) => s.id === id);
    if (!existing) throw new Error("Schedule not found.");
    const updated: ClientReportSchedule = {
      ...existing,
      weekday: input.weekday,
      localTime: input.localTime,
      timezone: input.timezone,
      active: input.active,
      nextRunAt: input.active ? computeNextClientReportRun(input.weekday, input.localTime, input.timezone, new Date()).toISOString() : existing.nextRunAt,
      updatedAt: new Date().toISOString(),
    };
    db.clientReportSchedules = db.clientReportSchedules.map((s) => (s.id === id ? updated : s));
    return updated;
  },

  async deleteSchedule(viewer, id) {
    requireScheduleAccess(viewer);
    if (!db.clientReportSchedules.some((s) => s.id === id)) throw new Error("Schedule not found.");
    db.clientReportSchedules = db.clientReportSchedules.filter((s) => s.id !== id);
    // Historical reports survive, detached (Section 41/49.Q) — never deleted.
    db.clientReports = db.clientReports.map((r) => (r.scheduleId === id ? { ...r, scheduleId: null } : r));
  },

  async runScheduleNow(viewer, id) {
    requireScheduleAccess(viewer);
    const schedule = db.clientReportSchedules.find((s) => s.id === id);
    if (!schedule) throw new Error("Schedule not found.");
    runOneSchedule(schedule);
  },
};
