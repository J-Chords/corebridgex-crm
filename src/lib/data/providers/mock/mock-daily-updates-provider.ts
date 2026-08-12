import type { AddManualDailyUpdateEntryInput, DailyUpdatesProvider } from "../daily-updates-provider";
import type { DailyUpdate, DailyUpdateEntry, DailyUpdateEntrySource, Task, TaskHandoff, TaskStatus, User } from "../../types";
import { canEditDailyUpdate, canReopenDailyUpdate, canViewDailyUpdate } from "../../permissions";
import { db } from "./mock-db";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Never actually rendered — the UI always prefers TaskStatusBadge for task entries, which have a real progressStatus. Kept only so progressLabel is a meaningful string on every entry, not a blank. */
function humanizeStatus(status: TaskStatus): string {
  return status
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function companyLabelFor(companyId: string): string {
  return db.companies.find((c) => c.id === companyId)?.name ?? "Unknown client";
}

function activityLabelFor(activityId: string | null): string | null {
  if (!activityId) return null;
  const activity = db.activities.find((a) => a.id === activityId);
  if (!activity) return null;
  const department = db.departments.find((d) => d.id === activity.departmentId);
  return `${department?.name ?? "Other"}: ${activity.name}`;
}

function buildTaskEntry(task: Task, minutesLogged: number, dayTimeEntryNotes: string[]): DailyUpdateEntry {
  const detailBits = [task.title, ...dayTimeEntryNotes.filter(Boolean)];
  return {
    id: crypto.randomUUID(),
    source: "task",
    sourceTaskId: task.id,
    sourceHandoffId: null,
    companyId: task.companyId,
    companyLabel: companyLabelFor(task.companyId),
    activityId: task.activityId,
    activityLabel: activityLabelFor(task.activityId),
    minutesLogged,
    progressStatus: task.status,
    progressLabel: humanizeStatus(task.status),
    details: detailBits.join(" — "),
  };
}

function buildHandoffEntry(handoff: TaskHandoff, source: Extract<DailyUpdateEntrySource, "handoff-sent" | "handoff-received">): DailyUpdateEntry | null {
  const task = db.tasks.find((t) => t.id === handoff.taskId);
  if (!task) return null;
  const isSent = source === "handoff-sent";
  const counterpart = db.users.find((u) => u.id === (isSent ? handoff.handedToId : handoff.handedById));
  const counterpartName = counterpart?.fullName ?? "someone";
  const detail = isSent ? handoff.workDone : handoff.workRemaining;

  return {
    id: crypto.randomUUID(),
    source,
    sourceTaskId: task.id,
    sourceHandoffId: handoff.id,
    companyId: task.companyId,
    companyLabel: companyLabelFor(task.companyId),
    activityId: task.activityId,
    activityLabel: activityLabelFor(task.activityId),
    minutesLogged: 0,
    progressStatus: null,
    progressLabel: isSent ? `Handed off to ${counterpartName}` : `Received from ${counterpartName}`,
    details: `${task.title} — ${detail}`.trim(),
  };
}

/** Every task/handoff `userId` touched on `date` — one entry per event, never aggregated. */
function computeFreshEntries(userId: string, date: string): DailyUpdateEntry[] {
  const taskEntries = db.tasks
    .map((task) => {
      const dayTimeEntries = db.timeEntries.filter(
        (te) =>
          te.taskId === task.id &&
          te.userId === userId &&
          te.durationMinutes != null &&
          te.startTime.slice(0, 10) === date
      );
      const statusTouchedToday = task.statusChangedById === userId && task.statusChangedAt?.slice(0, 10) === date;
      const minutesLogged = dayTimeEntries.reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
      if (minutesLogged === 0 && !statusTouchedToday) return null;
      const notes = dayTimeEntries.map((te) => te.notes).filter((n): n is string => !!n);
      return buildTaskEntry(task, minutesLogged, notes);
    })
    .filter((e): e is DailyUpdateEntry => e !== null);

  const handoffEntries = db.taskHandoffs
    .filter((h) => h.createdAt.slice(0, 10) === date && (h.handedById === userId || h.handedToId === userId))
    .map((h) => buildHandoffEntry(h, h.handedById === userId ? "handoff-sent" : "handoff-received"))
    .filter((e): e is DailyUpdateEntry => e !== null);

  return [...taskEntries, ...handoffEntries];
}

function buildManualEntry(input: AddManualDailyUpdateEntryInput): DailyUpdateEntry {
  return {
    id: crypto.randomUUID(),
    source: "manual",
    sourceTaskId: null,
    sourceHandoffId: null,
    companyId: input.companyId,
    companyLabel: input.companyId ? companyLabelFor(input.companyId) : "No client",
    activityId: input.activityId,
    activityLabel: activityLabelFor(input.activityId),
    minutesLogged: input.minutesLogged,
    progressStatus: null,
    progressLabel: "Manual entry",
    details: input.details,
  };
}

/** Manual entries have no task/handoff to key off of — keyed by their own id instead, which is enough since `computeFreshEntries` never produces a "manual" entry to match against anyway (they only ever land in `mergeEntries`'s "still missing from fresh" bucket, i.e. always preserved as-is). */
function entryKey(e: DailyUpdateEntry): string {
  if (e.source === "manual") return `manual:${e.id}`;
  return `${e.source}:${e.sourceTaskId}:${e.sourceHandoffId ?? ""}`;
}

/** Keeps the person's edited `details` (and stable `id`) for anything already seen; everything else on the entry is refreshed from the latest evidence, since minutes/status may have moved on since it was first drafted. Never removes or reorders an already-seen entry. */
function mergeEntries(existing: DailyUpdateEntry[], fresh: DailyUpdateEntry[]): DailyUpdateEntry[] {
  const existingByKey = new Map(existing.map((e) => [entryKey(e), e]));
  const merged = fresh.map((f) => {
    const prior = existingByKey.get(entryKey(f));
    return prior ? { ...f, id: prior.id, details: prior.details } : f;
  });
  const freshKeys = new Set(fresh.map(entryKey));
  const stillMissingFromFresh = existing.filter((e) => !freshKeys.has(entryKey(e)));
  return [...merged, ...stillMissingFromFresh];
}

function requireView(viewer: User, update: DailyUpdate) {
  if (!canViewDailyUpdate(viewer, update, db.users)) {
    throw new Error("You don't have access to this daily update.");
  }
}

export const mockDailyUpdatesProvider: DailyUpdatesProvider = {
  async getMyTodayUpdate(viewer) {
    const date = todayDateString();
    const existing = db.dailyUpdates.find((u) => u.userId === viewer.id && u.date === date);

    if (existing && existing.status === "confirmed") {
      return existing;
    }

    const fresh = computeFreshEntries(viewer.id, date);
    const now = new Date().toISOString();

    if (!existing) {
      const created: DailyUpdate = {
        id: crypto.randomUUID(),
        userId: viewer.id,
        date,
        status: "draft",
        entries: fresh,
        generatedAt: now,
        confirmedAt: null,
        updatedAt: now,
      };
      db.dailyUpdates = [...db.dailyUpdates, created];
      return created;
    }

    const merged: DailyUpdate = { ...existing, entries: mergeEntries(existing.entries, fresh), updatedAt: now };
    db.dailyUpdates = db.dailyUpdates.map((u) => (u.id === existing.id ? merged : u));
    return merged;
  },

  async listUpdatesForDate(viewer, date) {
    return db.dailyUpdates
      .filter((u) => u.date === date && canViewDailyUpdate(viewer, u, db.users))
      .sort((a, b) => a.userId.localeCompare(b.userId));
  },

  async updateEntryDetails(viewer, updateId, entryId, details) {
    const existing = db.dailyUpdates.find((u) => u.id === updateId);
    if (!existing) throw new Error("Daily update not found.");
    requireView(viewer, existing);
    if (!canEditDailyUpdate(viewer, existing)) {
      throw new Error("Only the owner can edit their daily update, and only while it's still a draft.");
    }

    const updated: DailyUpdate = {
      ...existing,
      entries: existing.entries.map((e) => (e.id === entryId ? { ...e, details } : e)),
      updatedAt: new Date().toISOString(),
    };
    db.dailyUpdates = db.dailyUpdates.map((u) => (u.id === updateId ? updated : u));
    return updated;
  },

  async addManualEntry(viewer, updateId, input) {
    const existing = db.dailyUpdates.find((u) => u.id === updateId);
    if (!existing) throw new Error("Daily update not found.");
    requireView(viewer, existing);
    if (!canEditDailyUpdate(viewer, existing)) {
      throw new Error("Only the owner can add an entry to their daily update, and only while it's still a draft.");
    }
    const updated: DailyUpdate = {
      ...existing,
      entries: [...existing.entries, buildManualEntry(input)],
      updatedAt: new Date().toISOString(),
    };
    db.dailyUpdates = db.dailyUpdates.map((u) => (u.id === updateId ? updated : u));
    return updated;
  },

  async confirmUpdate(viewer, updateId) {
    const existing = db.dailyUpdates.find((u) => u.id === updateId);
    if (!existing) throw new Error("Daily update not found.");
    requireView(viewer, existing);
    if (!canEditDailyUpdate(viewer, existing)) {
      throw new Error("Only the owner can confirm their daily update, and only while it's still a draft.");
    }

    const now = new Date().toISOString();
    const updated: DailyUpdate = { ...existing, status: "confirmed", confirmedAt: now, updatedAt: now };
    db.dailyUpdates = db.dailyUpdates.map((u) => (u.id === updateId ? updated : u));
    return updated;
  },

  async reopenUpdate(viewer, updateId) {
    const existing = db.dailyUpdates.find((u) => u.id === updateId);
    if (!existing) throw new Error("Daily update not found.");
    requireView(viewer, existing);
    if (!canReopenDailyUpdate(viewer, existing)) {
      throw new Error("Only the owner can reopen their daily update, and only once it's confirmed.");
    }

    const updated: DailyUpdate = { ...existing, status: "draft", confirmedAt: null, updatedAt: new Date().toISOString() };
    db.dailyUpdates = db.dailyUpdates.map((u) => (u.id === updateId ? updated : u));
    return updated;
  },
};
