import type {
  ManualTimeEntryInput,
  TimeEntriesProvider,
  TimeEntryWithTask,
  TimeEntryWithUser,
  TimeEntryWithUserAndTask,
} from "../time-entries-provider";
import type { TimeEntry, TimeEntryCorrection, User } from "../../types";
import { canAccessTask, canCorrectTimeEntry, canLogTime, canViewTimeForUser } from "../../permissions";
import { INTERNAL_COMPANY_ID } from "../../constants";
import { timeIntervalOverlapsVisit } from "./visit-time-overlap";
import { db } from "./mock-db";
import { mockTasksProvider } from "./mock-tasks-provider";

/** Phase 9 final integrity hotfix — the reciprocal side of Visit/Time anti-double-counting: no
 * persisted Task Time interval may overlap a Visit, regardless of which was created first. Every
 * Time-write path below checks this BEFORE mutating anything (never partially finalize one entry
 * and then fail to start/stop the next). */
function requireNoVisitConflict(userId: string, start: string, end: string, message: string) {
  if (timeIntervalOverlapsVisit(userId, start, end, db.visitEntries)) {
    throw new Error(message);
  }
}

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

/** How many correction records exist for one entry — the cheap "should I show a Corrected badge" signal; the full chain is fetched separately, on demand, via `listCorrectionsForTimeEntry`. */
function correctionCountFor(timeEntryId: string): number {
  return db.timeEntryCorrections.filter((c) => c.timeEntryId === timeEntryId).length;
}

/** A task's own cumulative logged total — every completed entry across every assignee, already reflecting any corrections since those mutate `durationMinutes` in place. Mirrors `workstreamHours`'s "only completed entries count" rule in `mock-workstreams-provider.ts`. */
function taskActualMinutes(taskId: string): number {
  return db.timeEntries
    .filter((te) => te.taskId === taskId && te.durationMinutes !== null)
    .reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
}

function toTimeEntryWithUser(entry: TimeEntry): TimeEntryWithUser {
  const user = db.users.find((u) => u.id === entry.userId);
  if (!user) {
    throw new Error(`Time entry ${entry.id} references unknown user ${entry.userId}`);
  }
  return { ...entry, user, correctionCount: correctionCountFor(entry.id) };
}

function toTimeEntryWithTask(entry: TimeEntry): TimeEntryWithTask {
  const task = db.tasks.find((t) => t.id === entry.taskId);
  if (!task) {
    throw new Error(`Time entry ${entry.id} references unknown task ${entry.taskId}`);
  }
  return {
    ...entry,
    correctionCount: correctionCountFor(entry.id),
    task: {
      id: task.id,
      title: task.title,
      companyId: task.companyId,
      expectedMinutes: task.expectedMinutes,
      actualMinutes: taskActualMinutes(task.id),
    },
  };
}

function toTimeEntryWithUserAndTask(entry: TimeEntry): TimeEntryWithUserAndTask {
  return { ...toTimeEntryWithUser(entry), ...toTimeEntryWithTask(entry) };
}

function requireTaskAccess(viewer: User, taskId: string) {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("Task not found.");
  const assigneeIds = taskAssigneeIds(taskId);
  if (!canAccessTask(viewer, { assigneeIds, companyId: task.companyId }, db.users)) {
    throw new Error("You don't have access to this task.");
  }
  if (!canLogTime(viewer, { assigneeIds })) {
    throw new Error("You don't have permission to log time on this task.");
  }
  return task;
}

function minutesBetween(start: string, end: string): number {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

/** Every entry for `userId`, latest `startTime` first — the one place "what did this person do most recently" gets resolved, so `getPausedTimer`/auto-pause can't drift out of sync with each other. */
function entriesForUserByRecency(userId: string): TimeEntry[] {
  return db.timeEntries.filter((te) => te.userId === userId).sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
}

/** Finalizes whatever timer `userId` currently has running, on any task, as a *pause* (resumable)
 * rather than a final stop — this is what "starting a new timer auto-pauses the previous one" means
 * in practice. `endTime` is passed in (never recomputed here) so the caller can check this exact
 * finalized interval against Visits BEFORE calling this — the whole operation must never partially
 * pause a timer and then fail the next step. */
function pauseAnyRunningTimer(userId: string, endTime: string) {
  const running = db.timeEntries.find((te) => te.userId === userId && te.durationMinutes === null);
  if (!running) return;
  const durationMinutes = minutesBetween(running.startTime, endTime);
  db.timeEntries = db.timeEntries.map((te) =>
    te.id === running.id ? { ...te, endTime, durationMinutes, pausedForResume: true } : te
  );
}

export const mockTimeEntriesProvider: TimeEntriesProvider = {
  async listTimeEntriesForTask(viewer, taskId) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return [];
    const assigneeIds = taskAssigneeIds(taskId);
    if (!canAccessTask(viewer, { assigneeIds, companyId: task.companyId }, db.users)) return [];

    return db.timeEntries
      .filter((te) => te.taskId === taskId)
      .sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
      .map(toTimeEntryWithUser);
  },

  async listMyTimeEntries(viewer) {
    return db.timeEntries
      .filter((te) => te.userId === viewer.id)
      .sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
      .map(toTimeEntryWithTask);
  },

  async listTimeEntriesForDate(viewer, date) {
    return db.timeEntries
      .filter((te) => te.startTime.slice(0, 10) === date && canViewTimeForUser(viewer, te.userId, db.users))
      .sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
      .map(toTimeEntryWithUserAndTask);
  },

  async getRunningTimer(viewer) {
    const running = db.timeEntries.find((te) => te.userId === viewer.id && te.durationMinutes === null);
    return running ? toTimeEntryWithTask(running) : null;
  },

  async getPausedTimer(viewer) {
    const latest = entriesForUserByRecency(viewer.id)[0];
    return latest && latest.pausedForResume ? toTimeEntryWithTask(latest) : null;
  },

  async startTimer(viewer, taskId) {
    const task = requireTaskAccess(viewer, taskId);
    const now = new Date().toISOString();

    // Reject BEFORE any mutation — never partially pause the prior timer and then fail to start
    // the next one (Phase 9 final integrity hotfix, Section E.2).
    requireNoVisitConflict(viewer.id, now, now, "You have a Visit logged for this time — pause/stop it or adjust the Visit before starting a timer.");
    const running = db.timeEntries.find((te) => te.userId === viewer.id && te.durationMinutes === null);
    if (running) {
      requireNoVisitConflict(
        viewer.id,
        running.startTime,
        now,
        "Your running timer overlaps a logged Visit — resolve the conflict before starting a new one."
      );
    }
    pauseAnyRunningTimer(viewer.id, now);

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      taskId,
      userId: viewer.id,
      startTime: now,
      endTime: null,
      durationMinutes: null,
      notes: null,
      billable: task.companyId !== INTERNAL_COMPANY_ID,
      pausedForResume: false,
      continuesFromEntryId: null,
    };
    db.timeEntries = [...db.timeEntries, entry];

    // Work actually starting is the missing lifecycle event between Todo and In Progress — only
    // that one transition is automatic; Blocked/Waiting on client/Done are never overridden here.
    // Routed through the real Task status-update path (not a raw db.tasks mutation) so
    // statusChangedAt/statusChangedById are set correctly and resolve through the same
    // current-viewer-aware actor resolution Task hydration already uses. The timer itself has
    // already been committed above, so if this unexpectedly failed it must never roll the timer
    // back or fail the Start Timer action the person actually asked for — starting a timer must
    // never end in "nothing happened."
    if (task.status === "todo") {
      try {
        await mockTasksProvider.updateTaskStatus(viewer, taskId, "in-progress");
      } catch {
        // Timer already started successfully; the status transition is a best-effort side effect.
      }
    }

    return toTimeEntryWithUser(entry);
  },

  async stopTimer(viewer, timeEntryId) {
    const entry = db.timeEntries.find((te) => te.id === timeEntryId);
    if (!entry) throw new Error("Time entry not found.");
    if (entry.userId !== viewer.id) throw new Error("You can only stop your own timer.");
    if (entry.durationMinutes !== null) throw new Error("This timer isn't running.");

    const endTime = new Date().toISOString();
    // The completed interval must not overlap a Visit — reject rather than silently changing/
    // deleting Visit data (Phase 9 final integrity hotfix, Section E.4).
    requireNoVisitConflict(
      viewer.id,
      entry.startTime,
      endTime,
      "This timer's interval overlaps a logged Visit — resolve the Visit conflict before stopping it."
    );
    const updated: TimeEntry = {
      ...entry,
      endTime,
      durationMinutes: minutesBetween(entry.startTime, endTime),
      pausedForResume: false,
    };
    db.timeEntries = db.timeEntries.map((te) => (te.id === timeEntryId ? updated : te));
    return toTimeEntryWithUser(updated);
  },

  async pauseTimer(viewer, timeEntryId) {
    const entry = db.timeEntries.find((te) => te.id === timeEntryId);
    if (!entry) throw new Error("Time entry not found.");
    if (entry.userId !== viewer.id) throw new Error("You can only pause your own timer.");
    if (entry.durationMinutes !== null) throw new Error("This timer isn't running.");

    const endTime = new Date().toISOString();
    // Same requirement as stop — the finalized interval must not overlap a Visit (Phase 9 final
    // integrity hotfix, Section E.5).
    requireNoVisitConflict(
      viewer.id,
      entry.startTime,
      endTime,
      "This timer's interval overlaps a logged Visit — resolve the Visit conflict before pausing it."
    );
    const updated: TimeEntry = {
      ...entry,
      endTime,
      durationMinutes: minutesBetween(entry.startTime, endTime),
      pausedForResume: true,
    };
    db.timeEntries = db.timeEntries.map((te) => (te.id === timeEntryId ? updated : te));
    return toTimeEntryWithUser(updated);
  },

  async resumeTimer(viewer, pausedEntryId) {
    const paused = db.timeEntries.find((te) => te.id === pausedEntryId);
    if (!paused) throw new Error("Time entry not found.");
    if (paused.userId !== viewer.id) throw new Error("You can only resume your own timer.");
    if (!paused.pausedForResume) throw new Error("This entry isn't paused.");
    requireTaskAccess(viewer, paused.taskId);

    const now = new Date().toISOString();
    requireNoVisitConflict(viewer.id, now, now, "You have a Visit logged for this time — pause/stop it or adjust the Visit before resuming this timer.");
    const running = db.timeEntries.find((te) => te.userId === viewer.id && te.durationMinutes === null);
    if (running) {
      requireNoVisitConflict(
        viewer.id,
        running.startTime,
        now,
        "Your running timer overlaps a logged Visit — resolve the conflict before resuming another one."
      );
    }
    pauseAnyRunningTimer(viewer.id, now);

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      taskId: paused.taskId,
      userId: viewer.id,
      startTime: now,
      endTime: null,
      durationMinutes: null,
      notes: null,
      billable: paused.billable,
      pausedForResume: false,
      continuesFromEntryId: paused.id,
    };
    db.timeEntries = [...db.timeEntries, entry];
    return toTimeEntryWithUser(entry);
  },

  async createManualEntry(viewer, taskId, input: ManualTimeEntryInput) {
    requireTaskAccess(viewer, taskId);

    // A duration-only manual entry (endTime left null — no specific clock range) still represents a
    // real occupied span starting at startTime for durationMinutes minutes; that implied span, not
    // an arbitrarily invented one, is what gets checked against Visits (Phase 9 final integrity
    // hotfix, Section E.1).
    const effectiveEnd = input.endTime ?? new Date(new Date(input.startTime).getTime() + input.durationMinutes * 60000).toISOString();
    requireNoVisitConflict(viewer.id, input.startTime, effectiveEnd, "This time overlaps a logged Visit — resolve the Visit conflict before logging this entry.");

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      taskId,
      userId: viewer.id,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
      billable: input.billable,
      pausedForResume: false,
      continuesFromEntryId: null,
    };
    db.timeEntries = [...db.timeEntries, entry];
    return toTimeEntryWithUser(entry);
  },

  async correctTimeEntry(viewer, timeEntryId, correctedDurationMinutes, reason) {
    const entry = db.timeEntries.find((te) => te.id === timeEntryId);
    if (!entry) throw new Error("Time entry not found.");
    // Permission is checked before the running-timer check (rather than after) so an unauthorized
    // caller learns nothing about the entry's state — just that they can't touch it.
    if (!canCorrectTimeEntry(viewer, entry.userId, db.users)) {
      throw new Error("You don't have permission to correct this time entry.");
    }
    if (entry.durationMinutes === null) {
      throw new Error("A running time entry can't be corrected — stop or pause it first.");
    }
    const roundedCorrection = Math.round(correctedDurationMinutes);
    if (!Number.isFinite(roundedCorrection) || roundedCorrection <= 0) {
      throw new Error("Corrected duration must be greater than zero.");
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      throw new Error("A reason is required.");
    }

    // previousDurationMinutes is the entry's *current* value, not necessarily its original one — a
    // second correction of an already-corrected entry chains from here, so the full sequence
    // reconstructs correctly even though the entry itself only ever holds the latest value.
    const correction: TimeEntryCorrection = {
      id: crypto.randomUUID(),
      timeEntryId,
      employeeUserId: entry.userId,
      previousDurationMinutes: entry.durationMinutes,
      correctedDurationMinutes: roundedCorrection,
      reason: trimmedReason,
      correctedById: viewer.id,
      correctedByName: viewer.fullName,
      correctedAt: new Date().toISOString(),
    };
    db.timeEntryCorrections = [...db.timeEntryCorrections, correction];

    const updated: TimeEntry = { ...entry, durationMinutes: roundedCorrection };
    db.timeEntries = db.timeEntries.map((te) => (te.id === timeEntryId ? updated : te));

    return toTimeEntryWithUser(updated);
  },

  async listCorrectionsForTimeEntry(viewer, timeEntryId) {
    const entry = db.timeEntries.find((te) => te.id === timeEntryId);
    if (!entry) return [];
    if (!canViewTimeForUser(viewer, entry.userId, db.users)) return [];

    return db.timeEntryCorrections
      .filter((c) => c.timeEntryId === timeEntryId)
      .sort((a, b) => (a.correctedAt < b.correctedAt ? -1 : 1));
  },
};
