import type { AddManualDailyUpdateEntryInput, DailyUpdatesProvider } from "../daily-updates-provider";
import type { DailyUpdate, DailyUpdateEntry, Task, User } from "../../types";
import { canEditDailyUpdate, canReopenDailyUpdate, canReviewDailyUpdate, canViewDailyUpdate } from "../../permissions";
import { STATUS_META } from "@/components/tasks/task-status-badge";
import { workstreamCompactLabel } from "../../workstream-name";
import { dateKeyFromTimestamp, todayDateOnly } from "@/lib/planner-dates";
import { db } from "./mock-db";

/**
 * Work-date handling (Phase 9C hotfix): "today," and which day a Time Entry/status-change/Handoff
 * belongs to, are now the viewer's LOCAL calendar date — never the UTC date embedded in an ISO
 * timestamp string. `todayDateOnly()`/`dateKeyFromTimestamp()` (`src/lib/planner-dates.ts`, the
 * same utility Phase 8D's Planner already established) replace the previous
 * `new Date().toISOString().slice(0, 10)` / `timestamp.slice(0, 10)` pattern everywhere in this
 * file. Timestamp storage itself is untouched — Time Entry `startTime`, `Task.statusChangedAt`, and
 * `TaskHandoff.createdAt` remain real absolute instants; only how this file classifies them into a
 * calendar work-date changed.
 */
function todayDateString(): string {
  return todayDateOnly();
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

interface TaskHierarchy {
  companyId: string;
  companyLabel: string;
  projectId: string | null;
  projectLabel: string | null;
  workstreamId: string | null;
  workstreamLabel: string | null;
  activityId: string | null;
  activityLabel: string | null;
}

/** Task → Workstream ("Service") → Project → Company, plus Task → Activity — the full Phase 8
 * operational hierarchy a Daily Update entry needs so a future weekly report can safely use its
 * narrative as Project-scoped context. `projectId`/`workstreamId` are null wherever the Task's own
 * Workstream genuinely has none (internal/non-client work, or a Workstream not yet assigned to a
 * Project) — never guessed. */
function hierarchyForTask(task: Task): TaskHierarchy {
  const workstream = db.workstreams.find((w) => w.id === task.workstreamId) ?? null;
  const project = workstream?.projectId ? (db.projects.find((p) => p.id === workstream.projectId) ?? null) : null;
  return {
    companyId: task.companyId,
    companyLabel: companyLabelFor(task.companyId),
    projectId: project?.id ?? null,
    projectLabel: project?.name ?? null,
    workstreamId: workstream?.id ?? null,
    workstreamLabel: workstream ? workstreamCompactLabel(workstream.name) : null,
    activityId: task.activityId,
    activityLabel: activityLabelFor(task.activityId),
  };
}

interface TaskDayAccumulator {
  actualMinutes: number;
  statusTouchedToday: boolean;
  notes: string[];
  handoffs: { id: string; text: string }[];
}

function buildTaskEntry(task: Task, acc: TaskDayAccumulator): DailyUpdateEntry {
  const detailBits = [...acc.notes.filter(Boolean), ...acc.handoffs.map((h) => h.text)];
  return {
    id: crypto.randomUUID(),
    source: "task",
    sourceTaskId: task.id,
    handoffIds: acc.handoffs.map((h) => h.id),
    ...hierarchyForTask(task),
    taskLabel: task.title,
    actualMinutes: acc.actualMinutes,
    scheduledMinutes: null,
    progressStatus: task.status,
    progressLabel: STATUS_META[task.status].label,
    details: detailBits.join(" — "),
  };
}

/**
 * One entry per Task the person touched on `date`, never one per underlying event (Phase 9C —
 * previously one entry per time-entry-bearing/status-change task PLUS a separate entry per
 * Handoff, which could duplicate the same Task into two rows). A Task qualifies if the person
 * logged legitimate (non-running) time on it that day, changed its status that day, or sent/
 * received a Handoff on it that day — any of those alone is enough, and all three fold into one
 * combined row when more than one applies the same day. Actual Time is the sum of that day's
 * legitimate Time Entries for that Task; a status change or Handoff alone still surfaces the Task
 * with Actual = 0, since it represents real work/context that day even with nothing logged.
 */
function computeFreshEntries(userId: string, date: string): DailyUpdateEntry[] {
  const perTask = new Map<string, TaskDayAccumulator>();
  function accumulatorFor(taskId: string): TaskDayAccumulator {
    let acc = perTask.get(taskId);
    if (!acc) {
      acc = { actualMinutes: 0, statusTouchedToday: false, notes: [], handoffs: [] };
      perTask.set(taskId, acc);
    }
    return acc;
  }

  for (const task of db.tasks) {
    const dayTimeEntries = db.timeEntries.filter(
      (te) => te.taskId === task.id && te.userId === userId && te.durationMinutes != null && dateKeyFromTimestamp(te.startTime) === date
    );
    if (dayTimeEntries.length > 0) {
      const acc = accumulatorFor(task.id);
      acc.actualMinutes += dayTimeEntries.reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
      acc.notes.push(...dayTimeEntries.map((te) => te.notes).filter((n): n is string => !!n));
    }
    if (task.statusChangedById === userId && task.statusChangedAt && dateKeyFromTimestamp(task.statusChangedAt) === date) {
      accumulatorFor(task.id).statusTouchedToday = true;
    }
  }

  for (const h of db.taskHandoffs) {
    if (dateKeyFromTimestamp(h.createdAt) !== date) continue;
    if (h.handedById !== userId && h.handedToId !== userId) continue;
    const task = db.tasks.find((t) => t.id === h.taskId);
    if (!task) continue;
    const isSent = h.handedById === userId;
    const counterpart = db.users.find((u) => u.id === (isSent ? h.handedToId : h.handedById));
    const counterpartName = counterpart?.fullName ?? "someone";
    const text = isSent ? `Handed off to ${counterpartName} — ${h.workDone}` : `Received from ${counterpartName} — ${h.workRemaining}`;
    accumulatorFor(task.id).handoffs.push({ id: h.id, text });
  }

  const entries: DailyUpdateEntry[] = [];
  for (const [taskId, acc] of perTask) {
    if (acc.actualMinutes === 0 && !acc.statusTouchedToday && acc.handoffs.length === 0) continue;
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) continue;
    entries.push(buildTaskEntry(task, acc));
  }
  return entries;
}

function buildManualEntry(input: AddManualDailyUpdateEntryInput): DailyUpdateEntry {
  const project = input.projectId ? db.projects.find((p) => p.id === input.projectId) : null;
  return {
    id: crypto.randomUUID(),
    source: "manual",
    sourceTaskId: null,
    handoffIds: [],
    companyId: input.companyId,
    companyLabel: input.companyId ? companyLabelFor(input.companyId) : "No client",
    projectId: project?.id ?? null,
    projectLabel: project?.name ?? null,
    workstreamId: null,
    workstreamLabel: null,
    activityId: input.activityId,
    activityLabel: activityLabelFor(input.activityId),
    taskLabel: null,
    actualMinutes: input.actualMinutes,
    scheduledMinutes: input.scheduledMinutes,
    progressStatus: null,
    progressLabel: "Manual entry",
    details: input.details,
  };
}

/** Task-backed entries are keyed by their Task alone (Phase 9C — one row per Task per day, never
 * per underlying event); manual entries by their own id (self-keyed, since nothing auto-drafts
 * them to collide with). Legacy `handoff-sent`/`handoff-received` entries (stored before Phase 9C)
 * keep their original composite key, so a still-open draft holding one can still be matched if
 * somehow still relevant — see `mergeEntries`' own drop-if-subsumed rule for the normal case. */
function entryKey(e: DailyUpdateEntry): string {
  if (e.source === "manual") return `manual:${e.id}`;
  if (e.source === "task") return `task:${e.sourceTaskId}`;
  return `${e.source}:${e.sourceTaskId}:${e.sourceHandoffId ?? ""}`;
}

/** Keeps the person's edited `details`/`scheduledMinutes` (and stable `id`) for anything already
 * seen; everything else on the entry is refreshed from the latest evidence, since minutes/status/
 * hierarchy may have moved on since it was first drafted. A legacy handoff-sourced entry whose
 * Task now has a fresh combined `"task"` entry is dropped as subsumed (Phase 9C: a Handoff never
 * produces its own row anymore) rather than kept forever as a stale duplicate; any other
 * no-longer-evidenced entry (typically a manual one) is preserved exactly as before. */
function mergeEntries(existing: DailyUpdateEntry[], fresh: DailyUpdateEntry[]): DailyUpdateEntry[] {
  const existingByKey = new Map(existing.map((e) => [entryKey(e), e]));
  const merged = fresh.map((f) => {
    const prior = existingByKey.get(entryKey(f));
    if (!prior) return f;
    return { ...f, id: prior.id, details: prior.details, scheduledMinutes: prior.scheduledMinutes ?? null };
  });
  const freshKeys = new Set(fresh.map(entryKey));
  const freshTaskIds = new Set(fresh.filter((f) => f.source === "task").map((f) => f.sourceTaskId));
  const stillMissingFromFresh = existing.filter((e) => {
    if (freshKeys.has(entryKey(e))) return false;
    if ((e.source === "handoff-sent" || e.source === "handoff-received") && e.sourceTaskId && freshTaskIds.has(e.sourceTaskId)) {
      return false;
    }
    return true;
  });
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
        reviewedAt: null,
        reviewedBy: null,
        reviewedByName: null,
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

  async updateEntryScheduledMinutes(viewer, updateId, entryId, scheduledMinutes) {
    const existing = db.dailyUpdates.find((u) => u.id === updateId);
    if (!existing) throw new Error("Daily update not found.");
    requireView(viewer, existing);
    if (!canEditDailyUpdate(viewer, existing)) {
      throw new Error("Only the owner can edit their daily update, and only while it's still a draft.");
    }

    const updated: DailyUpdate = {
      ...existing,
      entries: existing.entries.map((e) => (e.id === entryId ? { ...e, scheduledMinutes } : e)),
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

    // Reopening clears any review marker — the submitted snapshot that was reviewed no longer
    // exists once it's back in draft, so a re-submit must be reviewed again.
    const updated: DailyUpdate = {
      ...existing,
      status: "draft",
      confirmedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewedByName: null,
      updatedAt: new Date().toISOString(),
    };
    db.dailyUpdates = db.dailyUpdates.map((u) => (u.id === updateId ? updated : u));
    return updated;
  },

  async reviewUpdate(viewer, updateId) {
    const existing = db.dailyUpdates.find((u) => u.id === updateId);
    if (!existing) throw new Error("Daily update not found.");
    requireView(viewer, existing);
    if (!canReviewDailyUpdate(viewer, existing, db.users)) {
      if (existing.status !== "confirmed") {
        throw new Error("Only a submitted Daily Update can be reviewed.");
      }
      if (existing.reviewedAt !== null) {
        throw new Error("This Daily Update has already been reviewed.");
      }
      if (existing.userId === viewer.id) {
        throw new Error("You cannot review your own Daily Update.");
      }
      throw new Error("You do not have permission to review this Daily Update.");
    }

    const updated: DailyUpdate = {
      ...existing,
      reviewedAt: new Date().toISOString(),
      reviewedBy: viewer.id,
      reviewedByName: viewer.fullName,
    };
    db.dailyUpdates = db.dailyUpdates.map((u) => (u.id === updateId ? updated : u));
    return updated;
  },
};
