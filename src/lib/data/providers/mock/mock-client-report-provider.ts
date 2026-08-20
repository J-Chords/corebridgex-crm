import type { ClientReportProvider, GenerateClientReportInput } from "../client-report-provider";
import type {
  ClientReport,
  ClientReportDepartmentSection,
  ClientReportLineItem,
  ClientReportLineItemSource,
  Task,
  User,
} from "../../types";
import {
  canCommentOnClientReport,
  canEditOwnClientDraft,
  canFinalizeClientReport,
  canGenerateClientReport,
  canPermanentlyDeleteClientReport,
  canRestoreClientReport,
  canTrashClientReport,
  canViewClientReport,
} from "../../permissions";
import { formatMinutes } from "../../../format-minutes";
import { db } from "./mock-db";

function projectMemberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function eachDateInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = shiftDate(d, 1)) dates.push(d);
  return dates;
}

/**
 * Everyone who touched this company on `date` — either through one of this Project's own tasks
 * (time logged or status changed) or through a confirmed Daily Update entry for this company that
 * day. The second check is load-bearing for manual Daily Update entries: they have no backing
 * task, so the task/time-entry scan alone would never discover their owner as a contributor, and
 * their confirmed, human-written entry would be silently dropped from every client report for this
 * company. Daily Update entries are still Company-scoped, not Project-scoped (Daily Update has no
 * Project concept yet) — a known, disclosed residual gap, not something 9B invents a fix for.
 */
function contributorsForDate(companyTasks: Task[], companyId: string, date: string): Set<string> {
  const ids = new Set<string>();
  for (const task of companyTasks) {
    for (const te of db.timeEntries) {
      if (te.taskId === task.id && te.durationMinutes != null && te.startTime.slice(0, 10) === date) {
        ids.add(te.userId);
      }
    }
    if (task.statusChangedById && task.statusChangedAt?.slice(0, 10) === date) {
      ids.add(task.statusChangedById);
    }
  }
  for (const update of db.dailyUpdates) {
    if (update.date !== date || update.status !== "confirmed") continue;
    if (update.entries.some((e) => e.companyId === companyId)) {
      ids.add(update.userId);
    }
  }
  return ids;
}

interface RawContribution {
  activityId: string | null;
  date: string;
  minutes: number;
  details: string;
  source: ClientReportLineItemSource;
}

/**
 * The one person, one day, one company resolution — never both sourced at once, so nothing is ever
 * double-counted. If this person confirmed their Daily Update for this day, their entries for this
 * company ARE the line items (their own curated, human-reviewed text). Otherwise — never opened My
 * Day, or still a draft — fall back to raw task/time evidence for just this person and this day.
 *
 * The raw fallback deliberately uses ONLY the task title + duration, never task notes or time-entry
 * notes — unlike the internal Accomplishments Report's evidence gathering. Those notes are casual,
 * never-reviewed internal remarks; nobody has ever considered whether they're safe to show a client.
 * A confirmed Daily Update's `details`, by contrast, is the person's own reviewed status-update prose
 * — still not guaranteed name-free (hence the mandatory edit-before-finalize review on this report),
 * but a meaningfully more deliberate source than an offhand time-entry note.
 */
function resolveDayContribution(
  userId: string,
  date: string,
  companyId: string,
  companyTasks: Task[]
): RawContribution[] {
  const update = db.dailyUpdates.find((u) => u.userId === userId && u.date === date);
  if (update && update.status === "confirmed") {
    return update.entries
      .filter((e) => e.companyId === companyId)
      .map((e) => ({
        activityId: e.activityId,
        date,
        minutes: e.minutesLogged,
        details: e.details,
        source: "daily-update" as const,
      }));
  }

  const items: RawContribution[] = [];
  for (const task of companyTasks) {
    const dayTimeEntries = db.timeEntries.filter(
      (te) =>
        te.taskId === task.id &&
        te.userId === userId &&
        te.durationMinutes != null &&
        te.startTime.slice(0, 10) === date
    );
    const minutes = dayTimeEntries.reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
    const statusTouched = task.statusChangedById === userId && task.statusChangedAt?.slice(0, 10) === date;
    if (minutes === 0 && !statusTouched) continue;
    items.push({
      activityId: task.activityId,
      date,
      minutes,
      details: minutes > 0 ? `${task.title} (${formatMinutes(minutes)})` : task.title,
      source: "raw",
    });
  }
  return items;
}

function toLineItem(c: RawContribution): ClientReportLineItem {
  return { id: crypto.randomUUID(), date: c.date, minutes: c.minutes, details: c.details, source: c.source };
}

function byDate(a: ClientReportLineItem, b: ClientReportLineItem): number {
  return a.date.localeCompare(b.date);
}

/**
 * Only departments/activities that were actually touched appear here — there's no "every catalog
 * activity, ticked or not" walk like the internal Accomplishments Report. The generator adds anything
 * else via "+ Add section" on the detail page.
 *
 * Phase 9B: Task evidence is scoped to this one Project — via each Task's own Workstream.projectId
 * — never to the whole Company. A Company with two annual Projects (e.g. "...2025-2026" and
 * "...2026-2027") can never have both years' work mixed into a single report generation this way.
 */
function computeDepartmentSections(
  projectId: string,
  companyId: string,
  rangeStart: string,
  rangeEnd: string
): ClientReportDepartmentSection[] {
  const projectWorkstreamIds = new Set(db.workstreams.filter((w) => w.projectId === projectId).map((w) => w.id));
  const companyTasks = db.tasks.filter((t) => projectWorkstreamIds.has(t.workstreamId));
  const contributions: RawContribution[] = [];
  for (const date of eachDateInRange(rangeStart, rangeEnd)) {
    for (const userId of contributorsForDate(companyTasks, companyId, date)) {
      contributions.push(...resolveDayContribution(userId, date, companyId, companyTasks));
    }
  }

  const byActivityId = new Map<string, RawContribution[]>();
  const otherContributions: RawContribution[] = [];
  for (const c of contributions) {
    if (c.activityId === null) {
      otherContributions.push(c);
      continue;
    }
    const list = byActivityId.get(c.activityId) ?? [];
    list.push(c);
    byActivityId.set(c.activityId, list);
  }

  interface DeptAccum {
    departmentId: string;
    departmentName: string;
    position: number;
    activities: { activityId: string; activityName: string; position: number; lineItems: ClientReportLineItem[] }[];
  }
  const departmentsById = new Map<string, DeptAccum>();

  for (const [activityId, items] of byActivityId) {
    const activity = db.activities.find((a) => a.id === activityId);
    if (!activity) continue;
    const department = db.departments.find((d) => d.id === activity.departmentId);
    if (!department) continue;
    let dept = departmentsById.get(department.id);
    if (!dept) {
      dept = { departmentId: department.id, departmentName: department.name, position: department.position, activities: [] };
      departmentsById.set(department.id, dept);
    }
    dept.activities.push({
      activityId: activity.id,
      activityName: activity.name,
      position: activity.position,
      lineItems: items.map(toLineItem).sort(byDate),
    });
  }

  const departments: ClientReportDepartmentSection[] = Array.from(departmentsById.values())
    .sort((a, b) => a.position - b.position)
    .map((d) => ({
      departmentId: d.departmentId,
      departmentName: d.departmentName,
      activities: d.activities
        .sort((a, b) => a.position - b.position)
        .map(({ activityId, activityName, lineItems }) => ({ activityId, activityName, lineItems })),
    }));

  if (otherContributions.length > 0) {
    departments.push({
      departmentId: null,
      departmentName: "Other",
      activities: [
        {
          activityId: null,
          activityName: "Untagged work",
          lineItems: otherContributions.map(toLineItem).sort(byDate),
        },
      ],
    });
  }

  return departments;
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
  if (!canFinalizeClientReport(viewer, report, db.users)) {
    throw new Error("You don't have permission to finalize this report.");
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

    const departments = computeDepartmentSections(project.id, company.id, input.rangeStart, input.rangeEnd);

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
      comments: [],
      history: [],
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
