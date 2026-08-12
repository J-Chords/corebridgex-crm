import type { TaskHandoffsProvider, TaskHandoffWithUsers } from "../task-handoffs-provider";
import type { TaskHandoff, User } from "../../types";
import { canAccessTask, canAcknowledgeHandoff, canCreateHandoff, usersWhoCanReceiveHandoff } from "../../permissions";
import { db } from "./mock-db";

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

function toHandoffWithUsers(handoff: TaskHandoff): TaskHandoffWithUsers {
  const handedBy = db.users.find((u) => u.id === handoff.handedById);
  if (!handedBy) throw new Error(`Handoff ${handoff.id} references unknown user ${handoff.handedById}`);
  const handedTo = db.users.find((u) => u.id === handoff.handedToId);
  if (!handedTo) throw new Error(`Handoff ${handoff.id} references unknown user ${handoff.handedToId}`);
  const acknowledgedBy = handoff.acknowledgedById
    ? (db.users.find((u) => u.id === handoff.acknowledgedById) ?? null)
    : null;
  return { ...handoff, handedBy, handedTo, acknowledgedBy };
}

function sortNewestFirst(handoffs: TaskHandoff[]): TaskHandoff[] {
  return [...handoffs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function notifyOfHandoff(handoff: TaskHandoff, taskTitle: string, author: User) {
  db.notifications = [
    ...db.notifications,
    {
      id: crypto.randomUUID(),
      recipientId: handoff.handedToId,
      type: "task-handoff" as const,
      message: `${author.fullName} handed off "${taskTitle}" to you`,
      relatedTaskId: handoff.taskId,
      relatedReportId: null,
      relatedClientReportId: null,
      read: false,
      createdAt: handoff.createdAt,
    },
  ];
}

export const mockTaskHandoffsProvider: TaskHandoffsProvider = {
  async listHandoffsForTask(viewer, taskId) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return [];
    if (!canAccessTask(viewer, { assigneeIds: taskAssigneeIds(taskId), companyId: task.companyId }, db.users)) {
      return [];
    }
    return sortNewestFirst(db.taskHandoffs.filter((h) => h.taskId === taskId)).map(toHandoffWithUsers);
  },

  async listHandoffCandidates(viewer, taskId) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return [];
    const assigneeIds = taskAssigneeIds(taskId);
    if (!canAccessTask(viewer, { assigneeIds, companyId: task.companyId }, db.users)) return [];
    return usersWhoCanReceiveHandoff({ assigneeIds, companyId: task.companyId }, db.users, viewer.id);
  },

  async createHandoff(viewer, taskId, input) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found.");
    const assigneeIds = taskAssigneeIds(taskId);
    const taskShape = { assigneeIds, companyId: task.companyId };
    if (!canCreateHandoff(viewer, taskShape, db.users)) {
      throw new Error("You don't have access to this task.");
    }
    const candidates = usersWhoCanReceiveHandoff(taskShape, db.users, viewer.id);
    if (!candidates.some((u) => u.id === input.handedToId)) {
      throw new Error("That person doesn't have access to this task.");
    }

    const handoff: TaskHandoff = {
      id: crypto.randomUUID(),
      taskId,
      handedById: viewer.id,
      handedToId: input.handedToId,
      workDone: input.workDone,
      workRemaining: input.workRemaining,
      blockers: input.blockers,
      createdAt: new Date().toISOString(),
      acknowledgedById: null,
      acknowledgedAt: null,
    };
    db.taskHandoffs = [...db.taskHandoffs, handoff];
    notifyOfHandoff(handoff, task.title, viewer);

    return toHandoffWithUsers(handoff);
  },

  async acknowledgeHandoff(viewer, handoffId) {
    const existing = db.taskHandoffs.find((h) => h.id === handoffId);
    if (!existing) throw new Error("Handoff not found.");
    if (!canAcknowledgeHandoff(viewer, existing)) {
      throw new Error("Only the recipient can acknowledge this handoff.");
    }

    const updated: TaskHandoff = {
      ...existing,
      acknowledgedById: viewer.id,
      acknowledgedAt: new Date().toISOString(),
    };
    db.taskHandoffs = db.taskHandoffs.map((h) => (h.id === handoffId ? updated : h));
    return toHandoffWithUsers(updated);
  },

  async listRecentHandoffs(viewer, limit = 5) {
    const accessible = db.taskHandoffs.filter((h) => {
      const task = db.tasks.find((t) => t.id === h.taskId);
      if (!task) return false;
      return canAccessTask(viewer, { assigneeIds: taskAssigneeIds(h.taskId), companyId: task.companyId }, db.users);
    });
    return sortNewestFirst(accessible)
      .slice(0, limit)
      .map((h) => {
        const task = db.tasks.find((t) => t.id === h.taskId);
        return { ...toHandoffWithUsers(h), taskTitle: task?.title ?? "Untitled task" };
      });
  },
};
