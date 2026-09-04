import type { TasksProvider, TaskWithRelations } from "../tasks-provider";
import type { ChecklistItem, Workstream, Task, TaskStatus, User } from "../../types";
import {
  assignableStaffFor,
  canAccessProject,
  canAccessWorkstream,
  canAccessTask,
  canAccessTaskDirectly,
  canAddTaskChecklistItem,
  canDeleteTask,
  canEditTask,
  canProgressTask,
  isEmployee,
  isSuperadmin,
  isSupervisor,
  managesUser,
} from "../../permissions";
import { db } from "./mock-db";

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

/** Phase 10 — one-hop hierarchy assignee ids for `canAccessTask`'s `hierarchyAssigneeIds` param:
 * the parent's assignees (when `task` is a Subtask) plus every direct child's assignees (when
 * `task` is a parent). Never recurses further — one-level nesting means there's nothing deeper. */
function hierarchyAssigneeIds(task: Task): string[] {
  const ids: string[] = [];
  if (task.parentTaskId) ids.push(...taskAssigneeIds(task.parentTaskId));
  for (const child of db.tasks.filter((t) => t.parentTaskId === task.id)) {
    ids.push(...taskAssigneeIds(child.id));
  }
  return ids;
}

function taskAccessArgs(task: Task) {
  return { assigneeIds: taskAssigneeIds(task.id), companyId: task.companyId, hierarchyAssigneeIds: hierarchyAssigneeIds(task) };
}

function workstreamTeamIds(workstreamId: string): string[] {
  return db.workstreamMembers.filter((m) => m.workstreamId === workstreamId).map((m) => m.userId);
}

function projectMemberIds(projectId: string): string[] {
  return db.projectMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
}

function requireWorkstreamAccess(viewer: User, workstream: Workstream) {
  const accessible = canAccessWorkstream(
    viewer,
    { leadUserId: workstream.leadUserId, teamUserIds: workstreamTeamIds(workstream.id), companyId: workstream.companyId },
    db.users
  );
  if (!accessible) throw new Error("You don't have access to that service.");
}

/**
 * A tagged activity must be one the workstream actually enabled — never silently attached outside
 * that set. A workstream with NO persisted associations yet (legacy data, or a service/brand with no
 * catalog) has nothing to check against, so anything goes there — same permissive behavior every
 * task already had before per-workstream Activity selection existed. Used by updateTask, which never
 * offers the contextual "add another Activity" flow — see `resolveActivityForTaskCreation` below for
 * the create-only atomic-extension variant Phase 8C adds.
 */
function requireActivityEnabledOnWorkstream(workstreamId: string, activityId: string | null | undefined) {
  if (!activityId) return;
  const enabledIds = db.workstreamActivities
    .filter((wa) => wa.workstreamId === workstreamId)
    .map((wa) => wa.activityId);
  if (enabledIds.length === 0) return;
  if (!enabledIds.includes(activityId)) {
    throw new Error("That activity isn't enabled for this service.");
  }
}

/** Mirrors workstream_activities_write's hardened scope exactly (Phase 8C): Employee may extend
 * only a Service they themselves lead; Supervisor may extend one led by self or a legitimate direct
 * report, within their own Project scope; Superadmin is organization-wide. */
function canExtendWorkstreamActivities(viewer: User, workstream: Workstream): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isEmployee(viewer)) return workstream.leadUserId === viewer.id;
  if (isSupervisor(viewer)) {
    const lead = db.users.find((u) => u.id === workstream.leadUserId);
    if (!lead || !managesUser(viewer, lead)) return false;
    if (!workstream.projectId) return false;
    const project = db.projects.find((p) => p.id === workstream.projectId);
    if (!project) return false;
    return canAccessProject(viewer, { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: projectMemberIds(project.id) }, db.users);
  }
  return false;
}

/**
 * Phase 8C — mirrors the real create_task RPC's contextual "+ Add another Activity to this
 * Service" extension exactly: if the chosen Activity isn't yet enabled for this Workstream and the
 * viewer is authorized to extend it (`canExtendWorkstreamActivities`), it's enabled as part of this
 * same synchronous call — otherwise the existing strict `requireActivityEnabledOnWorkstream`
 * behavior applies (reject). The mock has no real transaction to roll back, but mirrors the same
 * "validate everything, mutate nothing, until the very end" discipline `createTask` below already
 * follows for its own db.tasks/db.taskAssignees writes, so a thrown error here never leaves a
 * dangling enabled Activity with no Task behind it.
 */
function resolveActivityForTaskCreation(viewer: User, workstream: Workstream, activityId: string | null | undefined): void {
  if (!activityId) return;
  const alreadyEnabled = db.workstreamActivities.some(
    (wa) => wa.workstreamId === workstream.id && wa.activityId === activityId
  );
  if (alreadyEnabled) return;

  if (!canExtendWorkstreamActivities(viewer, workstream)) {
    throw new Error("That activity is not yet enabled for this service, and you don't have permission to add it.");
  }
  const activity = db.activities.find((a) => a.id === activityId);
  const department = activity ? db.departments.find((d) => d.id === activity.departmentId) : undefined;
  if (!department || department.serviceLineId !== workstream.serviceLineId) {
    throw new Error("That activity doesn't belong to this service.");
  }
  db.workstreamActivities = [...db.workstreamActivities, { workstreamId: workstream.id, activityId }];
}

/**
 * Resolves a stored actor reference (createdById/statusChangedById) to a real User. In
 * `supabase-auth` transitional mode, the CURRENT authenticated viewer may be a real Supabase
 * identity that was never seeded into mock `db.users` — if the id being resolved is the current
 * viewer's own id, the already-known real viewer object is returned directly rather than searched
 * for in the mock roster (which would never find it); any other id resolves from `db.users`
 * exactly as before. This is narrow, temporary compatibility for this transitional mode only — it
 * does not add the real viewer to any mock roster or assignable-staff list, and it never changes
 * who a Task can be assigned to; it only lets audit-trail fields on a Task the current viewer
 * actually created or last changed the status of resolve back to them correctly, instead of
 * throwing (createdBy) or silently going blank (statusChangedBy).
 */
function resolveTaskActor(id: string, viewer: User): User | null {
  if (id === viewer.id) return viewer;
  return db.users.find((u) => u.id === id) ?? null;
}

function toTaskWithRelations(task: Task, viewer: User): TaskWithRelations {
  const company = db.companies.find((c) => c.id === task.companyId);
  if (!company) {
    throw new Error(`Task ${task.id} references unknown company ${task.companyId}`);
  }
  const workstreamRecord = db.workstreams.find((e) => e.id === task.workstreamId);
  if (!workstreamRecord) {
    throw new Error(`Task ${task.id} references unknown workstream ${task.workstreamId}`);
  }
  const project = workstreamRecord.projectId ? db.projects.find((p) => p.id === workstreamRecord.projectId) : undefined;
  const workstream = {
    id: workstreamRecord.id,
    name: workstreamRecord.name,
    projectId: workstreamRecord.projectId,
    projectName: project?.name ?? null,
  };
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
  const createdBy = resolveTaskActor(task.createdById, viewer);
  if (!createdBy) {
    throw new Error(`Task ${task.id} references unknown creator ${task.createdById}`);
  }
  const statusChangedBy = task.statusChangedById ? resolveTaskActor(task.statusChangedById, viewer) : null;

  const total = checklistItems.length;
  const done = checklistItems.filter((ci) => ci.isDone).length;
  const progressPercent = total === 0 ? 0 : Math.round((done / total) * 100);

  const parentTask = task.parentTaskId
    ? (() => {
        const p = db.tasks.find((t) => t.id === task.parentTaskId);
        return p ? { id: p.id, title: p.title } : null;
      })()
    : null;

  return { ...task, company, workstream, activity, assignees, checklistItems, createdBy, statusChangedBy, progressPercent, parentTask };
}

function requireAccess(viewer: User, task: Task) {
  if (!canAccessTask(viewer, taskAccessArgs(task), db.users)) {
    throw new Error("You don't have access to this task.");
  }
}

/** Phase 10 hierarchy-authorization hardening — for MUTATION/side-effect paths only (creating a
 * Subtask, the parent time roll-up): being visible to a viewer only through hierarchy read must
 * never satisfy this. */
function requireDirectAccess(viewer: User, task: Task) {
  if (!canAccessTaskDirectly(viewer, { assigneeIds: taskAssigneeIds(task.id), companyId: task.companyId }, db.users)) {
    throw new Error("You do not have access to that Task.");
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
    const tasks = db.tasks.filter((t) => canAccessTask(viewer, taskAccessArgs(t), db.users));
    return tasks.map((t) => toTaskWithRelations(t, viewer));
  },

  async getTask(viewer, id) {
    const task = db.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (!canAccessTask(viewer, taskAccessArgs(task), db.users)) {
      return null;
    }
    return toTaskWithRelations(task, viewer);
  },

  async createTask(viewer, input) {
    const workstream = db.workstreams.find((e) => e.id === input.workstreamId);
    if (!workstream) throw new Error("Service not found.");
    requireWorkstreamAccess(viewer, workstream);
    resolveActivityForTaskCreation(viewer, workstream, input.activityId);

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
      startDate: input.startDate,
      dueDate: input.dueDate,
      expectedMinutes: input.expectedMinutes ?? null,
      createdById: viewer.id,
      selfAdded,
      templateId: input.templateId ?? null,
      activityId: input.activityId ?? null,
      parentTaskId: null,
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

    return toTaskWithRelations(task, viewer);
  },

  async updateTask(viewer, id, input) {
    const existing = db.tasks.find((t) => t.id === id);
    if (!existing) throw new Error("Task not found.");
    if (!canEditTask(viewer, { ...existing, assigneeIds: taskAssigneeIds(id) }, db.users)) {
      throw new Error("You don't have permission to edit this task.");
    }
    const nextActivityId = input.activityId ?? null;

    // Phase 10 — a Subtask's context is inherited and read-only: it can never independently change
    // Workstream/Activity away from its parent's own.
    if (existing.parentTaskId) {
      if (input.workstreamId !== existing.workstreamId || nextActivityId !== existing.activityId) {
        throw new Error("A Subtask's Service/Activity is inherited from its parent Task and cannot be changed independently.");
      }
    }
    // Phase 10 — a top-level Task with existing Subtasks can't change context out from under them
    // (Section 8's safe V1 rule: block, never silently leave children in a stale context).
    if (db.tasks.some((t) => t.parentTaskId === id)) {
      if (input.workstreamId !== existing.workstreamId) {
        throw new Error("This Task has Subtasks — its Service cannot be changed. Remove or reassign the Subtasks first.");
      }
      if (nextActivityId !== existing.activityId) {
        throw new Error("This Task has Subtasks — its Activity cannot be changed. Remove or reassign the Subtasks first.");
      }
    }

    const workstream = db.workstreams.find((e) => e.id === input.workstreamId);
    if (!workstream) throw new Error("Service not found.");
    requireWorkstreamAccess(viewer, workstream);
    requireActivityEnabledOnWorkstream(workstream.id, input.activityId);

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
      startDate: input.startDate,
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

    return toTaskWithRelations(updated, viewer);
  },

  async deleteTask(viewer, id) {
    const existing = db.tasks.find((t) => t.id === id);
    if (!existing) throw new Error("Task not found.");
    if (!canDeleteTask(viewer, { ...existing, assigneeIds: taskAssigneeIds(id) }, db.users)) {
      throw new Error("You don't have permission to delete this task.");
    }
    // Mirrors delete_task's own SECURITY DEFINER RPC exactly: never silently destroy logged time,
    // Subtasks, or attached Notes — block with a truthful reason instead of a raw cascade.
    if (db.timeEntries.some((e) => e.taskId === id)) {
      throw new Error("This task has logged time against it and can't be deleted. Close it out instead of removing it.");
    }
    if (db.tasks.some((t) => t.parentTaskId === id)) {
      throw new Error("This task has subtasks and can't be deleted. Remove or reassign its subtasks first.");
    }
    if (db.notes.some((n) => n.taskId === id)) {
      throw new Error("This task has notes attached and can't be deleted.");
    }
    // Phase 14B (Part B9) — blocks on ANY Document row referencing this Task, INCLUDING
    // soft-deleted/Trash ones (no automatic purge exists yet, so a Trash row is still physically
    // present and restorable — mirrors the hosted delete_task's own Correction 5 exactly).
    if (db.documents.some((d) => d.taskId === id)) {
      throw new Error("This task has attached files and can't be deleted. Remove or permanently purge its attachments first.");
    }
    db.tasks = db.tasks.filter((t) => t.id !== id);
    db.taskAssignees = db.taskAssignees.filter((ta) => ta.taskId !== id);
    db.checklistItems = db.checklistItems.filter((c) => c.taskId !== id);
    db.taskHandoffs = db.taskHandoffs.filter((h) => h.taskId !== id);
  },

  async updateTaskStatus(viewer, id, status: TaskStatus) {
    const existing = db.tasks.find((t) => t.id === id);
    if (!existing) throw new Error("Task not found.");
    requireAccess(viewer, existing);
    if (!canProgressTask(viewer, { assigneeIds: taskAssigneeIds(id), companyId: existing.companyId }, db.users)) {
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
    return toTaskWithRelations(updated, viewer);
  },

  async toggleChecklistItem(viewer, taskId, itemId, isDone) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found.");
    requireAccess(viewer, task);
    if (!canProgressTask(viewer, { assigneeIds: taskAssigneeIds(taskId), companyId: task.companyId }, db.users)) {
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
    // Phase 10 — a Task with open Subtasks must never be silently auto-completed by its own
    // checklist while children remain open. The reverse (unticking an item on an already-done
    // Task) is unaffected — that direction was never restricted by this rule.
    const hasOpenSubtasks = db.tasks.some((t) => t.parentTaskId === taskId && t.status !== "done");
    let updatedTask = task;
    if (items.length > 0) {
      const allDone = items.every((ci) => ci.isDone);
      if (allDone && task.status !== "done" && !hasOpenSubtasks) {
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
    return toTaskWithRelations(updatedTask, viewer);
  },

  async addChecklistItem(viewer, taskId, description) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found.");
    // Phase 10 hierarchy-authorization hardening — this is a mutation, so direct access only;
    // being visible through a parent/child relationship must never grant this.
    requireDirectAccess(viewer, task);
    if (!canAddTaskChecklistItem(viewer, { ...task, assigneeIds: taskAssigneeIds(taskId) }, db.users)) {
      throw new Error("You don't have permission to add a checklist item to this task.");
    }
    const trimmed = description.trim();
    if (!trimmed) throw new Error("Checklist item description cannot be empty.");

    const nextPosition = db.checklistItems.filter((ci) => ci.taskId === taskId).reduce((max, ci) => Math.max(max, ci.position), -1) + 1;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      taskId,
      description: trimmed,
      isDone: false,
      position: nextPosition,
      completedById: null,
      completedAt: null,
    };
    db.checklistItems = [...db.checklistItems, newItem];

    return toTaskWithRelations(task, viewer);
  },

  async listSubtasks(viewer, parentTaskId) {
    const subtasks = db.tasks.filter((t) => t.parentTaskId === parentTaskId && canAccessTask(viewer, taskAccessArgs(t), db.users));
    return subtasks.map((t) => toTaskWithRelations(t, viewer));
  },

  async createSubtask(viewer, parentTaskId, input) {
    const parent = db.tasks.find((t) => t.id === parentTaskId);
    if (!parent) throw new Error("Parent Task not found.");
    requireDirectAccess(viewer, parent);
    if (parent.parentTaskId) {
      throw new Error("Cannot create a Subtask under another Subtask — one level of nesting only.");
    }

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
      companyId: parent.companyId,
      workstreamId: parent.workstreamId,
      status: input.status,
      priority: input.priority,
      startDate: input.startDate,
      dueDate: input.dueDate,
      expectedMinutes: input.expectedMinutes ?? null,
      createdById: viewer.id,
      selfAdded,
      templateId: null,
      activityId: parent.activityId,
      parentTaskId,
      relatedContactId: null,
      recurrenceRule: null,
      statusChangedById: null,
      statusChangedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.tasks = [...db.tasks, task];
    db.taskAssignees = [...db.taskAssignees, ...assigneeIds.map((userId) => ({ taskId: id, userId }))];
    syncChecklistItems(id, input.checklistItems);

    notifyOfAssignment(task, assigneeIds, viewer);
    if (selfAdded) notifyOfSelfAddedTask(task, viewer);

    return toTaskWithRelations(task, viewer);
  },

  async getTaskTimeRollup(viewer, taskId) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found.");
    requireDirectAccess(viewer, task);

    const ownMinutes = db.timeEntries
      .filter((te) => te.taskId === taskId && te.durationMinutes != null)
      .reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
    const childIds = db.tasks.filter((t) => t.parentTaskId === taskId).map((t) => t.id);
    const subtasksMinutes = db.timeEntries
      .filter((te) => childIds.includes(te.taskId) && te.durationMinutes != null)
      .reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);

    return { ownMinutes, subtasksMinutes };
  },

  async listPastTasksForActivity(viewer, activityId, excludeTaskId) {
    const candidates = db.tasks.filter(
      (t) =>
        t.activityId === activityId &&
        t.status === "done" &&
        t.id !== excludeTaskId &&
        canAccessTask(viewer, taskAccessArgs(t), db.users)
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
