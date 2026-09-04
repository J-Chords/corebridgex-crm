import type {
  AccomplishmentsReportProvider,
  GenerateReportInput,
} from "../accomplishments-report-provider";
import type {
  AccomplishmentsReport,
  AccomplishmentsReportActivityLine,
  AccomplishmentsReportBrandSection,
  ReportKind,
  ReportRangeLabel,
  Task,
  User,
} from "../../types";
import {
  canCommentOnAccomplishmentsReport,
  canEditAccomplishmentsReportEntries,
  canGenerateAccomplishmentsReport,
  canReopenAccomplishmentsReport,
  canViewAccomplishmentsReport,
} from "../../permissions";
import { mockActivityCatalogProvider } from "./mock-activity-catalog-provider";
import { db } from "./mock-db";

function dateInRange(iso: string, rangeStart: string, rangeEnd: string): boolean {
  const date = iso.slice(0, 10);
  return date >= rangeStart && date <= rangeEnd;
}

/** True if `actorId` is the one who did the work — always true for a client report, which attributes to anyone. */
function matchesActor(kind: ReportKind, subjectId: string, actorId: string | null): boolean {
  if (kind === "client") return true;
  return actorId === subjectId;
}

interface TaskEvidence {
  task: Task;
  checklistDone: { description: string }[];
  timeEntryMinutes: number;
  timeEntryNotes: string[];
  taskNotes: string[];
  statusTouched: boolean;
}

function gatherEvidence(
  task: Task,
  kind: ReportKind,
  subjectId: string,
  rangeStart: string,
  rangeEnd: string
): TaskEvidence {
  const checklistDone = db.checklistItems
    .filter(
      (ci) =>
        ci.taskId === task.id &&
        ci.isDone &&
        ci.completedAt &&
        dateInRange(ci.completedAt, rangeStart, rangeEnd) &&
        matchesActor(kind, subjectId, ci.completedById)
    )
    .map((ci) => ({ description: ci.description }));

  const timeEntries = db.timeEntries.filter(
    (te) =>
      te.taskId === task.id &&
      te.durationMinutes != null &&
      dateInRange(te.startTime, rangeStart, rangeEnd) &&
      matchesActor(kind, subjectId, te.userId)
  );
  const timeEntryMinutes = timeEntries.reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
  const timeEntryNotes = timeEntries.map((te) => te.notes).filter((n): n is string => !!n);

  const taskNotes = db.notes
    .filter(
      (n) =>
        n.taskId === task.id &&
        dateInRange(n.createdAt, rangeStart, rangeEnd) &&
        matchesActor(kind, subjectId, n.authorId)
    )
    .map((n) => n.body);

  const statusTouched =
    task.statusChangedAt != null &&
    dateInRange(task.statusChangedAt, rangeStart, rangeEnd) &&
    matchesActor(kind, subjectId, task.statusChangedById);

  return { task, checklistDone, timeEntryMinutes, timeEntryNotes, taskNotes, statusTouched };
}

function isTouched(e: TaskEvidence): boolean {
  return e.checklistDone.length > 0 || e.timeEntryMinutes > 0 || e.statusTouched;
}

/** One deterministic display line per contributing task — plain concatenation, no summarization. */
function taskFragment(e: TaskEvidence): string {
  let line = `- ${e.task.title}`;
  if (e.timeEntryMinutes > 0) line += ` (${(e.timeEntryMinutes / 60).toFixed(1)}h)`;
  const bits = [...e.timeEntryNotes, ...e.taskNotes].filter(Boolean);
  if (bits.length > 0) line += `: ${bits.join("; ")}`;
  return line;
}

/** Distinct client company names behind a line's matched work, briefly listed — only meaningful on person reports. */
function companyLabelFor(matching: TaskEvidence[]): string {
  const names = Array.from(
    new Set(
      matching
        .map((e) => db.companies.find((c) => c.id === e.task.companyId)?.name)
        .filter((n): n is string => !!n)
    )
  );
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

function buildLine(
  activityId: string | null,
  activityName: string,
  entries: TaskEvidence[]
): AccomplishmentsReportActivityLine {
  const matching = entries.filter((e) => (e.task.activityId ?? null) === activityId);
  return {
    activityId,
    activityName,
    done: matching.length > 0,
    detail: matching.map(taskFragment).join("\n"),
    sourceTaskIds: matching.map((e) => e.task.id),
    companyLabel: companyLabelFor(matching),
  };
}

async function buildBrandSections(
  entries: TaskEvidence[],
  forceIncludeBrandId: string | null
): Promise<AccomplishmentsReportBrandSection[]> {
  const byBrand = new Map<string, TaskEvidence[]>();
  for (const e of entries) {
    const company = db.companies.find((c) => c.id === e.task.companyId);
    // A brand-less client's work is silently excluded from every brand section, same as the
    // Supabase implementation — never a crash, never a fabricated brand grouping.
    if (!company || !company.brandId) continue;
    const list = byBrand.get(company.brandId) ?? [];
    list.push(e);
    byBrand.set(company.brandId, list);
  }
  if (forceIncludeBrandId && !byBrand.has(forceIncludeBrandId)) {
    byBrand.set(forceIncludeBrandId, []);
  }

  const brands = Array.from(byBrand.keys())
    .map((id) => db.brands.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b)
    .sort((a, b) => a.name.localeCompare(b.name));

  const sections: AccomplishmentsReportBrandSection[] = [];
  for (const brand of brands) {
    const brandEntries = byBrand.get(brand.id) ?? [];
    const departmentsWithActivities = await mockActivityCatalogProvider.listDepartments(brand.id);
    const departments = departmentsWithActivities
      .map((dept) => ({
        departmentId: dept.id,
        departmentName: dept.name,
        // Only activities with real evidence — not the department's full catalog. The rest are
        // available (individually) via "+ Add service."
        activities: dept.activities.map((activity) => buildLine(activity.id, activity.name, brandEntries)).filter((a) => a.done),
      }))
      .filter((dept) => dept.activities.length > 0);
    const other = buildLine(null, "Other (untagged)", brandEntries);
    sections.push({ brandId: brand.id, brandName: brand.name, departments, other, otherIncluded: other.done });
  }
  return sections;
}

function subjectLabel(kind: ReportKind, subjectId: string): string {
  if (kind === "person") {
    return db.users.find((u) => u.id === subjectId)?.fullName ?? "Unknown person";
  }
  return db.companies.find((c) => c.id === subjectId)?.name ?? "Unknown client";
}

/** The user a report is "about" — the recipient of any reviewer comment notification. */
function reportOwnerId(report: AccomplishmentsReport): string {
  return report.kind === "person" ? report.subjectId : report.generatedById;
}

function rangeWord(rangeLabel: ReportRangeLabel): string {
  if (rangeLabel === "today") return "daily ";
  if (rangeLabel === "this-week") return "weekly ";
  return "";
}

function notifyOfReportComment(report: AccomplishmentsReport, author: User) {
  const recipientId = reportOwnerId(report);
  if (recipientId === author.id) return;
  db.notifications = [
    ...db.notifications,
    {
      id: crypto.randomUUID(),
      recipientId,
      type: "report-comment" as const,
      message: `${author.fullName} commented on your ${rangeWord(report.rangeLabel)}accomplishments report`,
      relatedTaskId: null,
      relatedReportId: report.id,
      relatedClientReportId: null,
      read: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

function requireViewAccess(viewer: User, report: AccomplishmentsReport) {
  if (!canViewAccomplishmentsReport(viewer, report, db.users)) {
    throw new Error("You don't have access to that report.");
  }
}

function requireOwnerEdit(viewer: User, report: AccomplishmentsReport) {
  if (!canEditAccomplishmentsReportEntries(viewer, report)) {
    if (report.status === "finalized") {
      throw new Error("This report is finalized and can no longer be edited.");
    }
    throw new Error("Only the report's owner can edit its entries.");
  }
}

export const mockAccomplishmentsReportProvider: AccomplishmentsReportProvider = {
  async generateReport(viewer, input: GenerateReportInput) {
    // A person report is always about yourself — never trust a client-supplied subjectId for it.
    const subjectId = input.kind === "person" ? viewer.id : input.subjectId;
    if (!canGenerateAccomplishmentsReport(viewer, input.kind, subjectId, db.users)) {
      throw new Error("You don't have access to generate a report for that subject.");
    }

    const candidateTasks = input.kind === "client" ? db.tasks.filter((t) => t.companyId === subjectId) : db.tasks;
    const entries = candidateTasks
      .map((t) => gatherEvidence(t, input.kind, subjectId, input.rangeStart, input.rangeEnd))
      .filter(isTouched);

    const forceIncludeBrandId =
      input.kind === "client" ? (db.companies.find((c) => c.id === subjectId)?.brandId ?? null) : null;
    const brandSections = await buildBrandSections(entries, forceIncludeBrandId);

    const now = new Date().toISOString();
    const report: AccomplishmentsReport = {
      id: crypto.randomUUID(),
      kind: input.kind,
      subjectId,
      subjectLabel: subjectLabel(input.kind, subjectId),
      rangeLabel: input.rangeLabel,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      status: "draft",
      brandSections,
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

    db.accomplishmentsReports = [...db.accomplishmentsReports, report];
    return report;
  },

  async listReports(viewer) {
    return db.accomplishmentsReports.filter(
      (r) => r.deletedAt === null && canViewAccomplishmentsReport(viewer, r, db.users)
    );
  },

  async listTrashedReports(viewer) {
    return db.accomplishmentsReports.filter(
      (r) => r.deletedAt !== null && canViewAccomplishmentsReport(viewer, r, db.users)
    );
  },

  async getReport(viewer, id) {
    const report = db.accomplishmentsReports.find((r) => r.id === id);
    if (!report) return null;
    if (!canViewAccomplishmentsReport(viewer, report, db.users)) return null;
    return report;
  },

  async updateDraft(viewer, id, brandSections) {
    const existing = db.accomplishmentsReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireOwnerEdit(viewer, existing);

    const updated: AccomplishmentsReport = { ...existing, brandSections, updatedAt: new Date().toISOString() };
    db.accomplishmentsReports = db.accomplishmentsReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async finalizeReport(viewer, id) {
    const existing = db.accomplishmentsReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    if (existing.status === "finalized") return existing;
    requireOwnerEdit(viewer, existing);

    const now = new Date().toISOString();
    const hasFinalizedBefore = existing.history.some((e) => e.type === "finalized" || e.type === "re-finalized");
    const event = {
      id: crypto.randomUUID(),
      type: hasFinalizedBefore ? ("re-finalized" as const) : ("finalized" as const),
      actorId: viewer.id,
      actorName: viewer.fullName,
      createdAt: now,
    };
    const updated: AccomplishmentsReport = {
      ...existing,
      status: "finalized",
      finalizedAt: now,
      history: [...existing.history, event],
      updatedAt: now,
    };
    db.accomplishmentsReports = db.accomplishmentsReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async reopenReport(viewer, id) {
    const existing = db.accomplishmentsReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    if (!canReopenAccomplishmentsReport(viewer, existing)) {
      if (existing.status !== "finalized") throw new Error("Only a finalized report can be reopened.");
      throw new Error("Only the report's owner can reopen it.");
    }

    const now = new Date().toISOString();
    const event = {
      id: crypto.randomUUID(),
      type: "reopened" as const,
      actorId: viewer.id,
      actorName: viewer.fullName,
      createdAt: now,
    };
    const updated: AccomplishmentsReport = {
      ...existing,
      status: "draft",
      finalizedAt: null,
      history: [...existing.history, event],
      updatedAt: now,
    };
    db.accomplishmentsReports = db.accomplishmentsReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async addComment(viewer, id, body) {
    const existing = db.accomplishmentsReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    if (!canCommentOnAccomplishmentsReport(viewer, existing, db.users)) {
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
    const updated: AccomplishmentsReport = {
      ...existing,
      comments: [...existing.comments, comment],
      updatedAt: comment.createdAt,
    };
    db.accomplishmentsReports = db.accomplishmentsReports.map((r) => (r.id === id ? updated : r));
    notifyOfReportComment(updated, viewer);
    return updated;
  },

  async trashReport(viewer, id) {
    const existing = db.accomplishmentsReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireViewAccess(viewer, existing);

    const updated: AccomplishmentsReport = {
      ...existing,
      deletedAt: existing.deletedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.accomplishmentsReports = db.accomplishmentsReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async restoreReport(viewer, id) {
    const existing = db.accomplishmentsReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireViewAccess(viewer, existing);
    if (!existing.deletedAt) return existing;

    const updated: AccomplishmentsReport = { ...existing, deletedAt: null, updatedAt: new Date().toISOString() };
    db.accomplishmentsReports = db.accomplishmentsReports.map((r) => (r.id === id ? updated : r));
    return updated;
  },

  async permanentlyDeleteReport(viewer, id) {
    const existing = db.accomplishmentsReports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    requireViewAccess(viewer, existing);
    if (!existing.deletedAt) throw new Error("Move the report to Trash before permanently deleting it.");

    db.accomplishmentsReports = db.accomplishmentsReports.filter((r) => r.id !== id);
  },
};
