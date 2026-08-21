import type { VisitEntriesProvider } from "../visit-entries-provider";
import type { VisitEntry } from "../../types";
import { canAccessProject, canDeleteVisitEntry, canViewVisitEntriesForUser } from "../../permissions";
import { dateKeyFromTimestamp, todayDateOnly } from "@/lib/planner-dates";
import { INTERNAL_COMPANY_ID } from "../../constants";
import { visitOverlapsExisting } from "./visit-time-overlap";
import { db } from "./mock-db";

function memberUserIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function overlaps(userId: string, startAt: string, endAt: string, excludeVisitId: string | null): boolean {
  return visitOverlapsExisting(userId, startAt, endAt, excludeVisitId, db.visitEntries, db.timeEntries);
}

function assertAgendaPresent(agenda: string) {
  if (!agenda.trim()) throw new Error("Agenda is required.");
}

function assertNotPastDate(visitDate: string) {
  if (visitDate < todayDateOnly()) throw new Error("A Visit can only be planned for today or a future date.");
}

function assertActualTimesValid(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!(start < end)) throw new Error("Start time must be before end time.");
  if (end - start > 16 * 60 * 60 * 1000) throw new Error("A single Visit cannot exceed 16 hours — check the times.");
  if (dateKeyFromTimestamp(startAt) !== dateKeyFromTimestamp(endAt)) {
    throw new Error("A Visit cannot cross midnight — split it into two Visits.");
  }
}

export const mockVisitEntriesProvider: VisitEntriesProvider = {
  async listMyVisitEntries(viewer) {
    return db.visitEntries.filter((v) => v.userId === viewer.id);
  },

  async listVisitEntriesForUser(viewer, userId) {
    if (!canViewVisitEntriesForUser(viewer, userId, db.users)) return [];
    return db.visitEntries.filter((v) => v.userId === userId);
  },

  async createVisitEntry(viewer, input) {
    const project = db.projects.find((p) => p.id === input.projectId);
    if (!project) throw new Error("Project not found.");
    if (!canAccessProject(viewer, { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: memberUserIds(project.id) }, db.users)) {
      throw new Error("You do not have access to plan a Visit for that Project.");
    }
    if (project.companyId === INTERNAL_COMPANY_ID) {
      throw new Error("Client Visits can only be planned against a Client Project, not Internal/Non-billable work.");
    }
    assertAgendaPresent(input.agenda);
    assertNotPastDate(input.visitDate);

    const now = new Date().toISOString();
    const entry: VisitEntry = {
      id: crypto.randomUUID(),
      userId: viewer.id,
      projectId: input.projectId,
      visitDate: input.visitDate,
      status: "planned",
      startAt: null,
      endAt: null,
      durationMinutes: null,
      agenda: input.agenda.trim(),
      timezone: input.timezone,
      createdAt: now,
      updatedAt: now,
    };
    db.visitEntries = [...db.visitEntries, entry];
    return entry;
  },

  async updateVisitPlan(viewer, id, input) {
    const existing = db.visitEntries.find((v) => v.id === id);
    if (!existing) throw new Error("Visit not found.");
    if (existing.userId !== viewer.id) throw new Error("Only the Visit's own owner can edit it.");
    if (existing.status !== "planned") {
      throw new Error("This Visit is already completed — use Record Visit Hours to correct its actual time instead.");
    }
    assertAgendaPresent(input.agenda);
    assertNotPastDate(input.visitDate);

    const updated: VisitEntry = {
      ...existing,
      visitDate: input.visitDate,
      agenda: input.agenda.trim(),
      updatedAt: new Date().toISOString(),
    };
    db.visitEntries = db.visitEntries.map((v) => (v.id === id ? updated : v));
    return updated;
  },

  async completeVisitEntry(viewer, id, input) {
    const existing = db.visitEntries.find((v) => v.id === id);
    if (!existing) throw new Error("Visit not found.");
    if (existing.userId !== viewer.id) throw new Error("Only the Visit's own owner can record its hours.");
    assertActualTimesValid(input.startAt, input.endAt);
    const actualDate = dateKeyFromTimestamp(input.startAt);
    if (actualDate !== existing.visitDate) {
      throw new Error(
        `The actual time must fall on this Visit's planned date (${existing.visitDate}) — edit the Visit's date first if it genuinely happened on a different day.`
      );
    }
    if (overlaps(viewer.id, input.startAt, input.endAt, id)) {
      throw new Error("This overlaps an existing Time Entry or completed Visit — correct one of them first.");
    }

    const durationMinutes = Math.max(0, Math.round((new Date(input.endAt).getTime() - new Date(input.startAt).getTime()) / 60000));
    const updated: VisitEntry = {
      ...existing,
      status: "completed",
      startAt: input.startAt,
      endAt: input.endAt,
      durationMinutes,
      updatedAt: new Date().toISOString(),
    };
    db.visitEntries = db.visitEntries.map((v) => (v.id === id ? updated : v));
    return updated;
  },

  async deleteVisitEntry(viewer, id) {
    const existing = db.visitEntries.find((v) => v.id === id);
    if (!existing) throw new Error("Visit not found.");
    if (!canDeleteVisitEntry(viewer, existing)) {
      throw new Error("Only the Visit's own owner, or a superadmin, can delete it.");
    }
    db.visitEntries = db.visitEntries.filter((v) => v.id !== id);
  },
};
