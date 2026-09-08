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

function taskAccessArgs(task: Task) {
  return { assigneeIds: taskAssigneeIds(task.id), companyId: task.companyId };
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
 * Product Owner Final Lifecycle Integrity correction — authoritative enforcement (not just hidden
 * UI) that new operational work can never be created in an Archived client workspace. A Workstream
 * with no Project link at all (legacy data) has no status to check, so it's never blocked here.
 */
function requireProjectNotArchivedForWorkstream(workstream: Workstream) {
  if (!workstream.projectId) return;
  const project = db.projects.find((p) => p.id === workstream.projectId);
  if (project?.status === "archived") {
    throw new Error("This client is archived. Reactivate the client to add new work.");
  }
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
  const serviceLine = workstreamRecord.serviceLineId
    ? db.serviceLines.find((sl) => sl.id === workstreamRecord.serviceLineId)
    : undefined;
  const workstream = {
    id: workstreamRecord.id,
    name: workstreamRecord.name,
    projectId: workstreamRecord.projectId,
    projectName: project?.name ?? null,
    serviceLineName: serviceLine?.name ?? null,
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

  return { ...task, company, workstream, activity, assignees, checklistItems, createdBy, statusChangedBy, progressPercent };
}

function requireAccess(viewer: User, task: Task) {
  if (!canAccessTask(viewer, taskAccessArgs(task), db.users)) {
    throw new Error("You don't have access to this task.");
  }
}

/** For MUTATION/side-effect paths (adding a checklist item) — being visible to a viewer only
 * through hierarchy read must never satisfy this. */
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
  "not-started": "Not Started",
  "in-progress": "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Completed",
  canceled: "Canceled",
};

/**
 * Task Level Phase 1 — mirrors `enforce_task_invariants`'s status_reason lifecycle exactly (the
 * hosted trigger applies this on every write path; the mock has no shared trigger, so every mock
 * write path below calls this instead): required (non-empty) exactly when Waiting/Blocked, force-
 * cleared to null for every other status regardless of what the caller passed.
 */
function resolveStatusReason(status: TaskStatus, statusReason: string | null | undefined): string | null {
  if (status === "waiting" || status === "blocked") {
    const trimmed = (statusReason ?? "").trim();
    if (!trimmed) {
      throw new Error(`A reason is required while this Task is ${TASK_STATUS_LABELS[status]} — describe what it's waiting on or blocked by.`);
    }
    return trimmed;
  }
  return null;
}

/**
 * Task Level Phase 1 — mirrors `enforce_task_invariants`'s new inactive-Activity gate: an inactive
 * Activity may never be NEWLY selected (activityId differs from whatever this Task already had — a
 * brand-new Task always counts as "newly selected"), but an already-selected inactive Activity on an
 * existing Task stays fully valid until the caller deliberately picks a different one.
 */
function requireActiveActivityIfNewlySelected(activityId: string | null | undefined, previousActivityId: string | null) {
  if (!activityId || activityId === previousActivityId) return;
  const activity = db.activities.find((a) => a.id === activityId);
  if (activity && !activity.isActive) {
    throw new Error("That activity is inactive and cannot be newly selected for a Task.");
  }
}

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
    requireProjectNotArchivedForWorkstream(workstream);
    resolveActivityForTaskCreation(viewer, workstream, input.activityId);
    requireActiveActivityIfNewlySelected(input.activityId, null);
    const statusReason = resolveStatusReason(input.status, input.statusReason);

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
      statusReason,
      priority: input.priority,
      startDate: input.startDate,
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

    return toTaskWithRelations(task, viewer);
  },

  async updateTask(viewer, id, input) {
    const existing = db.tasks.find((t) => t.id === id);
    if (!existing) throw new Error("Task not found.");
    if (!canEditTask(viewer, { ...existing, assigneeIds: taskAssigneeIds(id) }, db.users)) {
      throw new Error("You don't have permission to edit this task.");
    }
    const nextActivityId = input.activityId ?? null;

    const workstream = db.workstreams.find((e) => e.id === input.workstreamId);
    if (!workstream) throw new Error("Service not found.");
    requireWorkstreamAccess(viewer, workstream);
    requireActivityEnabledOnWorkstream(workstream.id, input.activityId);
    requireActiveActivityIfNewlySelected(nextActivityId, existing.activityId);
    const statusReason = resolveStatusReason(input.status, input.statusReason);

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
      statusReason,
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
    // Mirrors delete_task's own SECURITY DEFINER RPC exactly: never silently destroy logged time or
    // attached Notes — block with a truthful reason instead of a raw cascade.
    if (db.timeEntries.some((e) => e.taskId === id)) {
      throw new Error("This task has logged time against it and can't be deleted. Close it out instead of removing it.");
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
    // Task Level Phase 1, Section 16 — Comments is the canonical Task conversation surface; never
    // silently destroy it. Mirrors `20260908100000_task_delete_history_blockers.sql` exactly.
    if (db.projectComments.some((c) => c.taskId === id)) {
      throw new Error("This task has comments and can't be deleted.");
    }
    if (db.taskHandoffs.some((h) => h.taskId === id)) {
      throw new Error("This task has handoff history and can't be deleted.");
    }
    if (db.projectIssues.some((pi) => pi.taskId === id)) {
      throw new Error("This task is linked to a Project Issue and can't be deleted. Unlink it from the Issue first.");
    }
    db.tasks = db.tasks.filter((t) => t.id !== id);
    db.taskAssignees = db.taskAssignees.filter((ta) => ta.taskId !== id);
    db.checklistItems = db.checklistItems.filter((c) => c.taskId !== id);
  },

  async updateTaskStatus(viewer, id, status: TaskStatus, statusReasonInput) {
    const existing = db.tasks.find((t) => t.id === id);
    if (!existing) throw new Error("Task not found.");
    requireAccess(viewer, existing);
    if (!canProgressTask(viewer, { assigneeIds: taskAssigneeIds(id), companyId: existing.companyId }, db.users)) {
      throw new Error("You don't have permission to update this task's status.");
    }
    const statusReason = resolveStatusReason(status, statusReasonInput);

    const statusChanged = status !== existing.status;
    const updated: Task = {
      ...existing,
      status,
      statusReason,
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
    let updatedTask = task;
    if (items.length > 0) {
      const allDone = items.every((ci) => ci.isDone);
      if (allDone && task.status !== "completed") {
        updatedTask = {
          ...task,
          status: "completed",
          statusReason: null,
          statusChangedById: viewer.id,
          statusChangedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else if (!allDone && task.status === "completed") {
        updatedTask = {
          ...task,
          status: "in-progress",
          statusReason: null,
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

  async listPastTasksForActivity(viewer, activityId, excludeTaskId) {
    const candidates = db.tasks.filter(
      (t) =>
        t.activityId === activityId &&
        t.status === "completed" &&
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
