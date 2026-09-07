import type {
  ChecklistItem,
  Company,
  Task,
  TaskPriority,
  TaskStatus,
  User,
} from "../types";

/** Task joined with the read-shape screens actually need — not a raw schema row. */
export interface TaskWithRelations extends Task {
  company: Company;
  /**
   * Light reference, not the full WorkstreamWithRelations — avoids a heavy nested join on every task
   * fetch. `projectName` is null only for the rare not-yet-backfilled legacy workstream.
   * `serviceLineName` (Task Level Phase 1) is the global Service name (e.g. "Accounting") — every
   * Task surface should show THIS as the primary Service identity, with `name` (the Workstream's own
   * instance qualifier, e.g. "Accounting 2026") only as secondary context, matching
   * `workstreamDisplayHeading`'s existing convention. Null only for a Workstream with no Service Line
   * set (a legitimate legacy case, same as `projectName`).
   */
  workstream: { id: string; name: string; projectId: string | null; projectName: string | null; serviceLineName: string | null };
  /**
   * Light reference, not the full Activity — includes departmentName because activity names
   * repeat across departments (every department ends in its own "Other"), so the bare name
   * alone wouldn't be legible on its own.
   */
  activity: { id: string; name: string; departmentName: string } | null;
  assignees: User[];
  checklistItems: ChecklistItem[];
  createdBy: User;
  statusChangedBy: User | null;
  /** Rounded 0-100, derived from checklistItems. 0 when there are no checklist items. */
  progressPercent: number;
}

export interface TaskChecklistItemInput {
  /** Present = an existing item being kept/edited. Absent = a new item. */
  id?: string;
  description: string;
}

/** A completed past task tagged to the same activity — enough to recognize it and reuse its checklist. */
export interface TaskReuseCandidate {
  id: string;
  title: string;
  description: string;
  companyName: string;
  /** When it was marked done — statusChangedAt if that's what set it done, else updatedAt as a fallback. */
  completedAt: string;
  /** Fresh, unchecked copies of these become the new task's starting checklist if this candidate is chosen. */
  checklistItemDescriptions: string[];
}

export interface TaskInput {
  title: string;
  description: string;
  /** companyId is derived from the workstream by the provider — not part of the input. */
  workstreamId: string;
  assigneeIds: string[];
  status: TaskStatus;
  /** Required exactly when `status` is `"waiting"`/`"blocked"`, ignored (server-cleared) otherwise —
   * see `Task.statusReason`. Omit or pass null for every other status. */
  statusReason?: string | null;
  priority: TaskPriority;
  /** Optional planned/scheduled start date — never auto-populated or derived. */
  startDate: string | null;
  dueDate: string | null;
  /** Optional time budget for this task, normalized to minutes — omit or pass null when not estimated. */
  expectedMinutes?: number | null;
  checklistItems: TaskChecklistItemInput[];
  /** Which TemplateTask this was instantiated from, if created via "Apply template". */
  templateId?: string;
  /** Optional tag into the brand's Activity Catalog — omit or pass null for no tag. */
  activityId?: string | null;
  /**
   * When true and `assigneeIds` is empty, the task is created genuinely unassigned instead of
   * falling back to the creator — used by "Apply template" so a supervisor/superadmin can assign
   * real owners afterward rather than every generated task silently landing on themselves.
   */
  allowUnassigned?: boolean;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Every method takes the requesting `viewer` and enforces the task
 * visibility gate (src/lib/data/permissions.ts) itself, so screens never
 * need to re-derive who's allowed to see or act on what.
 */
export interface TasksProvider {
  /** Every Task the viewer can see — Task Center/My Day/Planner/Project workspace all derive their
   * own grouping client-side from this one flat list. */
  listTasks(viewer: User): Promise<TaskWithRelations[]>;
  getTask(viewer: User, id: string): Promise<TaskWithRelations | null>;
  createTask(viewer: User, input: TaskInput): Promise<TaskWithRelations>;
  updateTask(viewer: User, id: string, input: TaskInput): Promise<TaskWithRelations>;
  /**
   * Phase 13 Task Action correction — a genuinely new capability (no authenticated role could
   * delete a Task at all before this). Authorized by `canDeleteTask` (identical to `canEditTask`).
   * Rejects with a specific, truthful message when the Task has logged time or attached history —
   * never silently destroys it. See `20260828100000_delete_task.sql` and its later extensions.
   */
  deleteTask(viewer: User, id: string): Promise<void>;
  /** `statusReason` is required when `status` is `"waiting"`/`"blocked"`, and is server-cleared the
   * moment `status` moves to anything else — never pass a stale reason expecting it to persist. */
  updateTaskStatus(viewer: User, id: string, status: TaskStatus, statusReason?: string | null): Promise<TaskWithRelations>;
  toggleChecklistItem(
    viewer: User,
    taskId: string,
    itemId: string,
    isDone: boolean
  ): Promise<TaskWithRelations>;
  /**
   * Phase 12B final polish — ADD one checklist item, authorized by `canAddTaskChecklistItem`
   * (any direct assignee, or anyone who already has `canEditTask`) — deliberately narrower than
   * the full checklist add/remove/rename path inside `updateTask` (`canEditTask`-gated). Never
   * touches any other Task field. Trims/rejects an empty description the same way the RPC does.
   */
  addChecklistItem(viewer: User, taskId: string, description: string): Promise<TaskWithRelations>;
  /**
   * "Reuse from past" — recently completed tasks tagged to the same activity, newest first,
   * capped to a short list. Respects the same task visibility gate as listTasks/getTask, so a
   * viewer never sees a candidate they couldn't otherwise access. Pass excludeTaskId when editing
   * so a task never lists itself.
   */
  listPastTasksForActivity(viewer: User, activityId: string, excludeTaskId?: string): Promise<TaskReuseCandidate[]>;
}
