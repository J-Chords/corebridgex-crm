import type {
  ManualTimeEntryInput,
  TimeEntriesProvider,
  TimeEntryWithTask,
  TimeEntryWithUser,
  TimeEntryWithUserAndTask,
} from "../time-entries-provider";
import type { TimeEntry, User } from "../../types";
import { canAccessTask, canLogTime, canViewTimeForUser } from "../../permissions";
import { INTERNAL_COMPANY_ID } from "../../constants";
import { db } from "./mock-db";

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

function toTimeEntryWithUser(entry: TimeEntry): TimeEntryWithUser {
  const user = db.users.find((u) => u.id === entry.userId);
  if (!user) {
    throw new Error(`Time entry ${entry.id} references unknown user ${entry.userId}`);
  }
  return { ...entry, user };
}

function toTimeEntryWithTask(entry: TimeEntry): TimeEntryWithTask {
  const task = db.tasks.find((t) => t.id === entry.taskId);
  if (!task) {
    throw new Error(`Time entry ${entry.id} references unknown task ${entry.taskId}`);
  }
  return { ...entry, task: { id: task.id, title: task.title, companyId: task.companyId } };
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

/** Finalizes whatever timer `userId` currently has running, on any task, as a *pause* (resumable) rather than a final stop — this is what "starting a new timer auto-pauses the previous one" means in practice. */
function pauseAnyRunningTimer(userId: string) {
  const running = db.timeEntries.find((te) => te.userId === userId && te.durationMinutes === null);
  if (!running) return;
  const endTime = new Date().toISOString();
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
    pauseAnyRunningTimer(viewer.id);

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      taskId,
      userId: viewer.id,
      startTime: new Date().toISOString(),
      endTime: null,
      durationMinutes: null,
      notes: null,
      billable: task.companyId !== INTERNAL_COMPANY_ID,
      pausedForResume: false,
      continuesFromEntryId: null,
    };
    db.timeEntries = [...db.timeEntries, entry];
    return toTimeEntryWithUser(entry);
  },

  async stopTimer(viewer, timeEntryId) {
    const entry = db.timeEntries.find((te) => te.id === timeEntryId);
    if (!entry) throw new Error("Time entry not found.");
    if (entry.userId !== viewer.id) throw new Error("You can only stop your own timer.");
    if (entry.durationMinutes !== null) throw new Error("This timer isn't running.");

    const endTime = new Date().toISOString();
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

    pauseAnyRunningTimer(viewer.id);

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      taskId: paused.taskId,
      userId: viewer.id,
      startTime: new Date().toISOString(),
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
};
