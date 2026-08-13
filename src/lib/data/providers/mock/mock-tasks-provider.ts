import type { TasksProvider, TaskWithRelations } from "../tasks-provider";
import type { ChecklistItem, Workstream, Task, TaskStatus, User } from "../../types";
import {
  assignableStaffFor,
  canAccessWorkstream,
  canAccessTask,
  canEditTask,
  canProgressTask,
  isEmployee,
  isSuperadmin,
} from "../../permissions";
import { db } from "./mock-db";

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

function workstreamTeamIds(workstreamId: string): string[] {
  return db.workstreamMembers.filter((m) => m.workstreamId === workstreamId).map((m) => m.userId);
}

function requireWorkstreamAccess(viewer: User, workstream: Workstream) {
  const accessible = canAccessWorkstream(
    viewer,
    { leadUserId: workstream.leadUserId, teamUserIds: workstreamTeamIds(workstream.id), companyId: workstream.companyId },
    db.users
  );
  if (!accessible) throw new Error("You don't have access to that workstream.");
}

function toTaskWithRelations(task: Task): TaskWithRelations {
  const company = db.companies.find((c) => c.id === task.companyId);
  if (!company) {
    throw new Error(`Task ${task.id} references unknown company ${task.companyId}`);
  }
  const workstreamRecord = db.workstreams.find((e) => e.id === task.workstreamId);
  if (!workstreamRecord) {
    throw new Error(`Task ${task.id} references unknown workstream ${task.workstreamId}`);
  }
  const workstream = { id: workstreamRecord.id, name: workstreamRecord.name };
  const activity = (() => {
    if (!task.activityId) return null;
    const activityRecord = db.activities.find((a) => a.id === task.activityId);
    if (!activityRecord) return null;
    const department = db.departments.find((d) => d.id === activityRecord.departmentId);
    return { id: activityRecord.id, name: activityRecord.name, departmentName: department?.name ?? "" };
  })();
  const assigneeIds = taskAssigneeIds(task.id);
  const assignees = db.users.filter((u) => assigneeIds.includes(u.id));
  const checklistItems = db.checklistItems
    .filter((ci) => ci.taskId === task.id)
    .sort((a, b) => a.position - b.position);
  const createdBy = db.users.find((u) => u.id === task.createdById);
  if (!createdBy) {
    throw new Error(`Task ${task.id} references unknown creator ${task.createdById}`);
  }
  const statusChangedBy = task.statusChangedById
    ? (db.users.find((u) => u.id === task.statusChangedById) ?? null)
    : null;

  const total = checklistItems.length;
  const done = checklistItems.filter((ci) => ci.isDone).length;
  const progressPercent = total === 0 ? 0 : Math.round((done / total) * 100);

  return { ...task, company, workstream, activity, assignees, checklistItems, createdBy, statusChangedBy, progressPercent };
}

function requireAccess(viewer: User, task: Task) {
  if (!canAccessTask(viewer, { assigneeIds: taskAssigneeIds(task.id), companyId: task.companyId }, db.users)) {
    throw new Error("You don't have access to this task.");
  }
}

/** Employees can only ever assign themselves; supervisors are limited to their own team. */
function resolveAssigneeIds(viewer: User, requested: string[]): string[] {
  if (isEmployee(viewer)) return [viewer.id];
  const allowedIds = new Set(assignableStaffFor(viewer, db.users).map((u) => u.id));
  const resolved = requested.filter((id) => allowedIds.has(id));
  return resolved.length > 0 ? resolved : [viewer.id];
}

/** Same short labels the task-status UI already uses (`task-status-badge.tsx`'s `STATUS_META`) — duplicated here rather than imported, since a data-layer provider shouldn't reach into a "use client" component file just for five words. */
const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  "in-progress": "In progress",
  blocked: "Blocked",
  "waiting-on-client": "Waiting on client",
  done: "Done",
};

/** Notified recipients must actually be able to open the task the notification links to — otherwise the click-through dead-ends on an access-denied page (can happen, e.g., when an assignee's own `assignedCompanyIds` doesn't cover the task's company). */
function notifiableRecipients(candidateIds: string[], task: Task, currentAssigneeIds: string[]): string[] {
  return candidateIds.filter((id) => {
    const recipientUser = db.users.find((u) => u.id === id);
    return (
      recipientUser != null &&
      canAccessTask(recipientUser, { assigneeIds: currentAssigneeIds, companyId: task.companyId }, db.users)
    );
  });
}

/** Only the newly-added assignees get notified — never someone who was already on the task, and never the actor about their own action (mirrors `notifyOfSelfAddedTask` never notifying the self-adder). Called with an empty/no-op diff on every edit that doesn't touch assignees, so it's always safe to call unconditionally. */
function notifyOfAssignment(task: Task, newlyAssignedIds: string[], actor: User) {
  const recipients = notifiableRecipients(
    newlyAssignedIds.filter((id) => id !== actor.id),
    task,
    taskAssigneeIds(task.id)
  );
  if (recipients.length === 0) return;

  const createdAt = new Date().toISOString();
  const newNotifications = recipients.map((recipientId) => ({
    id: crypto.randomUUID(),
    recipientId,
    type: "task-assigned" as const,
    message: `${actor.fullName} assigned you to "${task.title}"`,
    relatedTaskId: task.id,
    relatedReportId: null,
    relatedClientReportId: null,
    read: false,
    createdAt,
  }));
  db.notifications = [...db.notifications, ...newNotifications];
}

/**
 * Kept deliberately restrained, per the product rule: other current assignees (never the actor
 * about their own change), plus — only when the actor is an employee — their own supervisor, so the
 * one person actually responsible for that employee's work hears about it. Superadmins are never
 * added automatically; nothing here turns the notification feed into an audit log. A `Set` naturally
 * dedupes the rare case where the supervisor is also an assignee.
 */
function notifyOfStatusChange(task: Task, newStatus: TaskStatus, actor: User, currentAssigneeIds: string[]) {
  const candidates = new Set(currentAssigneeIds.filter((id) => id !== actor.id));
  if (isEmployee(actor) && actor.supervisorId) candidates.add(actor.supervisorId);
  candidates.delete(actor.id);
  const recipients = notifiableRecipients(Array.from(candidates), task, currentAssigneeIds);
  if (recipients.length === 0) return;

  const createdAt = new Date().toISOString();
  const newNotifications = recipients.map((recipientId) => ({
    id: crypto.randomUUID(),
    recipientId,
    type: "task-status-changed" as const,
    message: `${actor.fullName} changed "${task.title}" to ${TASK_STATUS_LABELS[newStatus]}`,
    relatedTaskId: task.id,
    relatedReportId: null,
    relatedClientReportId: null,
    read: false,
    createdAt,
  }));
  db.notifications = [...db.notifications, ...newNotifications];
}

function notifyOfSelfAddedTask(task: Task, author: User) {
  const recipients = new Set<string>();
  if (author.supervisorId) recipients.add(author.supervisorId);
  db.users.filter((u) => isSuperadmin(u) && u.active).forEach((u) => recipients.add(u.id));

  const createdAt = new Date().toISOString();
  const newNotifications = Array.from(recipients).map((recipientId) => ({
    id: crypto.randomUUID(),
    recipientId,
    type: "self-added-task" as const,
    message: `${author.fullName} added a new task: "${task.title}"`,
    relatedTaskId: task.id,
    relatedReportId: null,
    relatedClientReportId: null,
    read: false,
    createdAt,
  }));
  db.notifications = [...db.notifications, ...newNotifications];
}

function syncChecklistItems(taskId: string, items: { id?: string; description: string }[]) {
  const existing = db.checklistItems.filter((ci) => ci.taskId === taskId);
  const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id));
  const kept = existing.filter((ci) => keepIds.has(ci.id));

  const updated: ChecklistItem[] = items.map((item, index) => {
    if (item.id) {
      const match = kept.find((ci) => ci.id === item.id);
      if (match) return { ...match, description: item.description, position: index };
    }
    return {
      id: crypto.randomUUID(),
      taskId,
      description: item.description,
      isDone: false,
      position: index,
      completedById: null,
      completedAt: null,
    };
  });

  db.checklistItems = [...db.checklistItems.filter((ci) => ci.taskId !== taskId), ...updated];
}

export const mockTasksProvider: TasksProvider = {
  async listTasks(viewer) {
    const tasks = db.tasks.filter((t) =>
      canAccessTask(viewer, { assigneeIds: taskAssigneeIds(t.id), companyId: t.companyId }, db.users)
    );
    return tasks.map(toTaskWithRelations);
  },

  async getTask(viewer, id) {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (!canAccessTask(viewer, { assigneeIds: taskAssigneeIds(id), companyId: task.companyId }, db.users)) {
      return null;
    }
    return toTaskWithRelations(task);
  },

  async createTask(viewer, input) {
    const workstream = db.workstreams.find((e) => e.id === input.workstreamId);
    if (!workstream) throw new Error("Workstream not found.");
    requireWorkstreamAccess(viewer, workstream);

    const assigneeIds =
      input.allowUnassigned && input.assigneeIds.length === 0
        ? []
        : resolveAssigneeIds(viewer, input.assigneeIds);
    const selfAdded = isEmployee(viewer);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const task: Task = {
      id,
      title: input.title,
      description: input.description,
      companyId: workstream.companyId,
      workstreamId: workstream.id,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      expectedMinutes: input.expectedMinutes ?? null,
      createdById: viewer.id,
      selfAdded,
      templateId: input.templateId ?? null,
      activityId: input.activityId ?? null,
      relatedContactId: null,
      recurrenceRule: null,
      statusChangedById: null,
      statusChangedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.tasks = [...db.tasks, task];
    db.taskAssignees = [
      ...db.taskAssignees,
      ...assigneeIds.map((userId) => ({ taskId: id, userId })),
    ];
    syncChecklistItems(id, input.checklistItems);

    // Every initial assignee is "newly assigned" on create — the actor-exclusion inside
    // notifyOfAssignment already makes this a no-op for a self-added task, since its sole assignee
    // is always the creator themselves.
    notifyOfAssignment(task, assigneeIds, viewer);
    if (selfAdded) notifyOfSelfAddedTask(task, viewer);

    return toTaskWithRelations(task);
  },

  async updateTask(viewer, id, input) {
    const existing = db.tasks.find((t) => t.id === id);
    if (!existing) throw new Error("Task not found.");
    if (!canEditTask(viewer, existing)) {
      throw new Error("You don't have permission to edit this task.");
    }
    const workstream = db.workstreams.find((e) => e.id === input.workstreamId);
    if (!workstream) throw new Error("Workstream not found.");
    requireWorkstreamAccess(viewer, workstream);

    // Captured before db.taskAssignees is overwritten below — this is the "before" set the new one
    // gets diffed against, so already-assigned people never get a redundant notification.
    const previousAssigneeIds = taskAssigneeIds(id);
    const assigneeIds = resolveAssigneeIds(viewer, input.assigneeIds);
    const statusChanged = input.status !== existing.status;

    const updated: Task = {
      ...existing,
      title: input.title,
      description: input.description,
      companyId: workstream.companyId,
      workstreamId: workstream.id,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      expectedMinutes: input.expectedMinutes ?? null,
      activityId: input.activityId ?? null,
      statusChangedById: statusChanged ? viewer.id : existing.statusChangedById,
      statusChangedAt: statusChanged ? new Date().toISOString() : existing.statusChangedAt,
      updatedAt: new Date().toISOString(),
    };

    db.tasks = db.tasks.map((t) => (t.id === id ? updated : t));
    db.taskAssignees = [
      ...db.taskAssignees.filter((ta) => ta.taskId !== id),
      ...assigneeIds.map((userId) => ({ taskId: id, userId })),
    ];
    syncChecklistItems(id, input.checklistItems);

    const newlyAssignedIds = assigneeIds.filter((uid) => !previousAssigneeIds.includes(uid));
    notifyOfAssignment(updated, newlyAssignedIds, viewer);
    if (statusChanged) notifyOfStatusChange(updated, updated.status, viewer, assigneeIds);

    return toTaskWithRelations(updated);
  },

  async updateTaskStatus(viewer, id, status: TaskStatus) {
    const existing = db.tasks.find((t) => t.id === id);
    if (!existing) throw new Error("Task not found.");
    requireAccess(viewer, existing);
    if (!canProgressTask(viewer, { assigneeIds: taskAssigneeIds(id) })) {
      throw new Error("You don't have permission to update this task's status.");
    }

    const statusChanged = status !== existing.status;
    const updated: Task = {
      ...existing,
      status,
      statusChangedById: statusChanged ? viewer.id : existing.statusChangedById,
      statusChangedAt: statusChanged ? new Date().toISOString() : existing.statusChangedAt,
      updatedAt: new Date().toISOString(),
    };
    db.tasks = db.tasks.map((t) => (t.id === id ? updated : t));
    if (statusChanged) notifyOfStatusChange(updated, status, viewer, taskAssigneeIds(id));
    return toTaskWithRelations(updated);
  },

  async toggleChecklistItem(viewer, taskId, itemId, isDone) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found.");
    requireAccess(viewer, task);
    if (!canProgressTask(viewer, { assigneeIds: taskAssigneeIds(taskId) })) {
      throw new Error("You don't have permission to update this task's checklist.");
    }

    db.checklistItems = db.checklistItems.map((ci) =>
      ci.id === itemId
        ? {
            ...ci,
            isDone,
            completedById: isDone ? viewer.id : null,
            completedAt: isDone ? new Date().toISOString() : null,
          }
        : ci
    );

    // Auto-progress status off the checklist's own completion, the same permission already checked
    // above (this is a consequence of the toggle, not a separate user-initiated status change).
    // Ticking the last remaining item marks the task Done; unticking any item on an already-Done
    // task reverts it to In progress — "someone reopened this, it's being worked again," not back
    // to To do, which would misrepresent work already done on it.
    const items = db.checklistItems.filter((ci) => ci.taskId === taskId);
    let updatedTask = task;
    if (items.length > 0) {
      const allDone = items.every((ci) => ci.isDone);
      if (allDone && task.status !== "done") {
        updatedTask = {
          ...task,
          status: "done",
          statusChangedById: viewer.id,
          statusChangedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else if (!allDone && task.status === "done") {
        updatedTask = {
          ...task,
          status: "in-progress",
          statusChangedById: viewer.id,
          statusChangedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    }
    if (updatedTask !== task) {
      db.tasks = db.tasks.map((t) => (t.id === taskId ? updatedTask : t));
      // One call site, gated by the same "did it actually change" check as the two branches above —
      // this is the only place a checklist toggle can trigger a status change, so there's no second
      // code path that could double-fire this for the same toggle.
      notifyOfStatusChange(updatedTask, updatedTask.status, viewer, taskAssigneeIds(taskId));
    }
    return toTaskWithRelations(updatedTask);
  },

  async listPastTasksForActivity(viewer, activityId, excludeTaskId) {
    const candidates = db.tasks.filter(
      (t) =>
        t.activityId === activityId &&
        t.status === "done" &&
        t.id !== excludeTaskId &&
        canAccessTask(viewer, { assigneeIds: taskAssigneeIds(t.id), companyId: t.companyId }, db.users)
    );
    const sorted = [...candidates].sort((a, b) =>
      (b.statusChangedAt ?? b.updatedAt).localeCompare(a.statusChangedAt ?? a.updatedAt)
    );
    return sorted.slice(0, 5).map((t) => {
      const company = db.companies.find((c) => c.id === t.companyId);
      const checklistItemDescriptions = db.checklistItems
        .filter((ci) => ci.taskId === t.id)
        .sort((a, b) => a.position - b.position)
        .map((ci) => ci.description);
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        companyName: company?.name ?? "Unknown client",
        completedAt: t.statusChangedAt ?? t.updatedAt,
        checklistItemDescriptions,
      };
    });
  },
};
