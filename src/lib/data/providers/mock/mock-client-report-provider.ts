import type { ClientReportProvider, GenerateClientReportInput } from "../client-report-provider";
import type { ClientReport, User } from "../../types";
import {
  canCommentOnClientReport,
  canEditClientReportWording,
  canEditOwnClientDraft,
  canFinalizeClientReport,
  canGenerateClientReport,
  canPermanentlyDeleteClientReport,
  canRestoreClientReport,
  canTrashClientReport,
  canViewClientReport,
} from "../../permissions";
import { computeWeeklyReportSections } from "../../client-report-weekly";
import { dateKeyFromTimestamp } from "@/lib/planner-dates";
import { db } from "./mock-db";

function projectMemberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

/**
 * Phase 9D — the Weekly Client Report content generator. Gathers already-real Tasks/TimeEntries/
 * confirmed-Daily-Update-entries/catalog data (Project-scoped exactly like the pre-9D algorithm:
 * via each Task's own Workstream.projectId, never the whole Company) and hands it to the pure
 * `computeWeeklyReportSections` in `client-report-weekly.ts`, which owns the actual qualifying-Task
 * rule, aggregation, narrative precedence, and anti-double-counting contract — see that module's
 * own doc comment.
 *
 * Phase 9D hotfix: Time Entries are aggregated into `WeeklyReportTimeEvidenceInput` (one row per
 * Task/local-work-date, summed across every legitimate contributor) HERE, mirroring exactly what
 * the hardened `get_client_report_weekly_evidence` RPC does server-side for the real Supabase
 * provider — mock has no RLS to route around, but producing the identical evidence shape keeps the
 * two providers' contract genuinely parity-tested, not just conveniently similar.
 */
/**
 * Shared Tasks/TimeEntries/VisitEntries evidence gathering — used by BOTH manual generation (which
 * layers confirmed Daily Update narrative + a real name-scan on top) and the Phase 9F scheduled
 * generator (`mock-client-report-schedules-provider.ts`, which deliberately passes no Daily Update
 * narrative at all — Section 36). One shared gathering path keeps the two generation modes'
 * Task/Time/Visit evidence genuinely identical by construction, not by convention.
 */
export function gatherWeeklyEvidenceForProject(projectId: string) {
  const projectWorkstreamIds = new Set(db.workstreams.filter((w) => w.projectId === projectId).map((w) => w.id));
  const tasks = db.tasks.filter((t) => projectWorkstreamIds.has(t.workstreamId));
  const taskIds = new Set(tasks.map((t) => t.id));

  const minutesByTaskDate = new Map<string, number>();
  for (const te of db.timeEntries) {
    if (te.durationMinutes == null || !taskIds.has(te.taskId)) continue;
    const dateKey = dateKeyFromTimestamp(te.startTime);
    const key = `${te.taskId}::${dateKey}`;
    minutesByTaskDate.set(key, (minutesByTaskDate.get(key) ?? 0) + te.durationMinutes);
  }
  const timeEvidence = Array.from(minutesByTaskDate.entries()).map(([key, minutes]) => {
    const [taskId, date] = key.split("::");
    return { taskId, date, minutes };
  });

  // Phase 9F — Visit Entries aggregated by their own local visit_date (already the local calendar
  // date at creation time, no dateKeyFromTimestamp bucketing needed), summed across every legitimate
  // contributor for this Project. COMPLETED VISITS ONLY (Phase 9 final semantics fix) — a Planned
  // Visit has no actual hours yet and must contribute zero reportable minutes. Mirrors
  // get_client_report_weekly_evidence's own visitEvidence (`and v.status = 'completed'`).
  const minutesByVisitDate = new Map<string, number>();
  for (const v of db.visitEntries) {
    if (v.projectId !== projectId || v.status !== "completed" || v.durationMinutes == null) continue;
    minutesByVisitDate.set(v.visitDate, (minutesByVisitDate.get(v.visitDate) ?? 0) + v.durationMinutes);
  }
  const visitEvidence = Array.from(minutesByVisitDate.entries()).map(([date, minutes]) => ({ date, minutes }));

  return { tasks, taskIds, timeEvidence, visitEvidence };
}

/**
 * Phase 9D — the Weekly Client Report content generator. Gathers already-real Tasks/TimeEntries/
 * confirmed-Daily-Update-entries/catalog data (Project-scoped exactly like the pre-9D algorithm:
 * via each Task's own Workstream.projectId, never the whole Company) and hands it to the pure
 * `computeWeeklyReportSections` in `client-report-weekly.ts`, which owns the actual qualifying-Task
 * rule, aggregation, narrative precedence, and anti-double-counting contract — see that module's
 * own doc comment.
 *
 * Phase 9D hotfix: Time Entries are aggregated into `WeeklyReportTimeEvidenceInput` (one row per
 * Task/local-work-date, summed across every legitimate contributor) HERE, mirroring exactly what
 * the hardened `get_client_report_weekly_evidence` RPC does server-side for the real Supabase
 * provider — mock has no RLS to route around, but producing the identical evidence shape keeps the
 * two providers' contract genuinely parity-tested, not just conveniently similar.
 */
function generateWeeklyDepartments(viewer: User, projectId: string, rangeStart: string, rangeEnd: string) {
  const { tasks, taskIds, timeEvidence, visitEvidence } = gatherWeeklyEvidenceForProject(projectId);

  const dailyUpdateEntries = db.dailyUpdates
    .filter((u) => u.status === "confirmed")
    .flatMap((u) => u.entries.filter((e) => e.sourceTaskId && taskIds.has(e.sourceTaskId)).map((e) => ({ date: u.date, sourceTaskId: e.sourceTaskId, details: e.details })));

  // Same visibility scope canViewClientReport itself is built on (owner/managed-generator via
  // manages_user), reused here purely as a name-scan safety net — knowing which staff names to
  // screen a candidate narrative for is not a new access boundary of its own.
  const knownStaffNames = db.users.map((u) => u.fullName);

  return computeWeeklyReportSections({
    tasks,
    timeEvidence,
    dailyUpdateEntries,
    visitEvidence,
    activities: db.activities,
    departments: db.departments,
    knownStaffNames,
    rangeStart,
    rangeEnd,
  });
}

function notifyOfClientReportComment(report: ClientReport, author: User) {
  if (report.generatedById === author.id) return;
  db.notifications = [
    ...db.notifications,
    {
      id: crypto.randomUUID(),
      recipientId: report.generatedById,
      type: "client-report-comment" as const,
      message: `${author.fullName} commented on the ${report.companyLabel} client report`,
      relatedTaskId: null,
      relatedReportId: null,
      relatedClientReportId: report.id,
      read: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

function requireOwnerEdit(viewer: User, report: ClientReport) {
  if (!canEditOwnClientDraft(viewer, report)) {
    if (report.status === "finalized") {
      throw new Error("This report is finalized and can no longer be edited.");
    }
    throw new Error("Only the report's owner can edit its entries.");
  }
}

function requireFinalizeAccess(viewer: User, report: ClientReport) {
  if (!canFinalizeClientReport(viewer, report)) {
    throw new Error("You don't have permission to finalize this report.");
  }
}

function requireWordingEditAccess(viewer: User, report: ClientReport) {
  if (!canEditClientReportWording(viewer, report)) {
    throw new Error("You don't have permission to edit this report's wording.");
  }
}

function requireTrashAccess(viewer: User, report: ClientReport) {
  if (!canTrashClientReport(viewer, report)) {
    throw new Error("Only the report's generator or a Superadmin can move it to Trash.");
  }
}

function requireRestoreAccess(viewer: User, report: ClientReport) {
  if (!canRestoreClientReport(viewer, report)) {
    throw new Error("Only the report's generator or a Superadmin can restore it.");
  }
}

function requirePermanentDeleteAccess(viewer: User) {
  if (!canPermanentlyDeleteClientReport(viewer)) {
    throw new Error("Only a Superadmin can permanently delete a report.");
  }
}

/** One `"generation-warning"` history event per warning (Phase 9D) — the smallest backward-
 * compatible way to surface a generation-time note (e.g. a completed Task with no legitimate
 * tracked time, omitted rather than given a fabricated Duration) to whoever reviews the Draft
 * later, reusing the already-migrated `history` jsonb column instead of a new schema/table. Never
 * printed/exported — `ClientReportHistory` is already `print:hidden`, and `message` never contains
 * a staff name by construction (it names a Task, never a person). */
function buildGenerationWarningEvents(viewer: User, warnings: string[]): ClientReport["history"] {
  const now = new Date().toISOString();
  return warnings.map((message) => ({
    id: crypto.randomUUID(),
    type: "generation-warning" as const,
    actorId: viewer.id,
    actorName: viewer.fullName,
    createdAt: now,
    message,
  }));
}

export const mockClientReportProvider: ClientReportProvider = {
  async generateReport(viewer, input: GenerateClientReportInput) {
    const project = db.projects.find((p) => p.id === input.projectId);
    if (!project) throw new Error("Project not found.");
    if (
      !canGenerateClientReport(
        viewer,
        { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: projectMemberUserIds(project.id) },
        db.users
      )
    ) {
      throw new Error("You don't have access to generate a client report for that Project.");
    }
    if (input.rangeStart > input.rangeEnd) throw new Error("Invalid date range.");

    // Company/brand are derived from the Project server-side (mirrors the real RPC) — never
    // trusted from a browser-supplied companyId, closing the "mismatched project_id + company_id"
    // risk explicitly called out for Phase 9B.
    const company = db.companies.find((c) => c.id === project.companyId);
    if (!company) throw new Error(`Project ${project.id} references unknown company ${project.companyId}`);
    const brand = db.brands.find((b) => b.id === company.brandId);
    if (!brand) throw new Error(`Company ${company.id} references unknown brand ${company.brandId}`);

    const { departments, warnings, dailyVisitMinutes } = generateWeeklyDepartments(viewer, project.id, input.rangeStart, input.rangeEnd);

    const now = new Date().toISOString();
    const report: ClientReport = {
      id: crypto.randomUUID(),
      projectId: project.id,
      companyId: company.id,
      companyLabel: company.name,
      brandId: brand.id,
      brandLabel: brand.name,
      rangeLabel: input.rangeLabel,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      status: "draft",
      departments,
      dailyVisitMinutes,
      scheduleId: null,
      comments: [],
      history: buildGenerationWarningEvents(viewer, warnings),
      generatedById: viewer.id,
      generatedByName: viewer.fullName,
      generatedAt: now,
      finalizedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.clientReports = [...db.clientReports, report];
    return report;
  },

  async listReports(viewer) {
    return db.clientReports.filter((r) => r.deletedAt === null && canViewClientReport(viewer, r, db.users));
  },

  async listTrashedReports(viewer) {
    return db.clientReports.filter((r) => r.deletedAt !== null && canViewClientReport(viewer, r, db.users));
  },

  async getReport(viewer, id) {
    const report = db.clientReports.find((r) => r.id === id);
    if (!report) return null;
    if (!canViewClientReport(viewer, report, db.users)) return null;
    return report;
  },

  async updateDraft(viewer, id, departments) {
    const existing = db.clientReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireOwnerEdit(viewer, existing);

    const updated: ClientReport = { ...existing, departments, updatedAt: new Date().toISOString() };
    db.clientReports = db.clientReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async updateDraftWording(viewer, id, edits) {
    const existing = db.clientReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireWordingEditAccess(viewer, existing);

    const editsById = new Map(edits.map((e) => [e.id, e.details]));
    const departments = existing.departments.map((dept) => ({
      ...dept,
      activities: dept.activities.map((activity) => ({
        ...activity,
        lineItems: activity.lineItems.map((item) =>
          editsById.has(item.id) ? { ...item, details: editsById.get(item.id)! } : item
        ),
      })),
    }));

    const updated: ClientReport = { ...existing, departments, updatedAt: new Date().toISOString() };
    db.clientReports = db.clientReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async finalizeReport(viewer, id) {
    const existing = db.clientReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    // Authorization is checked before the already-finalized idempotent short-circuit below,
    // mirroring the SQL RPC's own tightened ordering — an unauthorized caller must never get this
    // report's content back, even via the "already finalized, just return it" convenience path.
    requireFinalizeAccess(viewer, existing);
    if (existing.status === "finalized") return existing;

    const now = new Date().toISOString();
    // Never "re-finalized" — a true Client Report can no longer be reopened (Phase 9B locked
    // immutability rule), so a report can only ever be finalized once, ever.
    const event = {
      id: crypto.randomUUID(),
      type: "finalized" as const,
      actorId: viewer.id,
      actorName: viewer.fullName,
      createdAt: now,
    };
    const updated: ClientReport = {
      ...existing,
      status: "finalized",
      finalizedAt: now,
      history: [...existing.history, event],
      updatedAt: now,
    };
    db.clientReports = db.clientReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async addComment(viewer, id, body) {
    const existing = db.clientReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    if (!canCommentOnClientReport(viewer, existing, db.users)) {
      throw new Error("You don't have permission to comment on this report.");
    }
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment can't be empty.");

    const comment = {
      id: crypto.randomUUID(),
      authorId: viewer.id,
      authorName: viewer.fullName,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    const updated: ClientReport = {
      ...existing,
      comments: [...existing.comments, comment],
      updatedAt: comment.createdAt,
    };
    db.clientReports = db.clientReports.map((r) => (r.id === id ? updated : r));
    notifyOfClientReportComment(updated, viewer);
    return updated;
  },

  async trashReport(viewer, id) {
    const existing = db.clientReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireTrashAccess(viewer, existing);

    const updated: ClientReport = {
      ...existing,
      deletedAt: existing.deletedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.clientReports = db.clientReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async restoreReport(viewer, id) {
    const existing = db.clientReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireRestoreAccess(viewer, existing);
    if (!existing.deletedAt) return existing;

    const updated: ClientReport = { ...existing, deletedAt: null, updatedAt: new Date().toISOString() };
    db.clientReports = db.clientReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async permanentlyDeleteReport(viewer, id) {
    const existing = db.clientReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requirePermanentDeleteAccess(viewer);
    if (!existing.deletedAt) throw new Error("Move the report to Trash before permanently deleting it.");

    db.clientReports = db.clientReports.filter((r) => r.id !== id);
  },
};
