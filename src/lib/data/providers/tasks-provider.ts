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
  /** Light reference, not the full WorkstreamWithRelations — avoids a heavy nested join on every task fetch. */
  workstream: { id: string; name: string };
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
  priority: TaskPriority;
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
  listTasks(viewer: User): Promise<TaskWithRelations[]>;
  getTask(viewer: User, id: string): Promise<TaskWithRelations | null>;
  createTask(viewer: User, input: TaskInput): Promise<TaskWithRelations>;
  updateTask(viewer: User, id: string, input: TaskInput): Promise<TaskWithRelations>;
  updateTaskStatus(viewer: User, id: string, status: TaskStatus): Promise<TaskWithRelations>;
  toggleChecklistItem(
    viewer: User,
    taskId: string,
    itemId: string,
    isDone: boolean
  ): Promise<TaskWithRelations>;
  /**
   * "Reuse from past" — recently completed tasks tagged to the same activity, newest first,
   * capped to a short list. Respects the same task visibility gate as listTasks/getTask, so a
   * viewer never sees a candidate they couldn't otherwise access. Pass excludeTaskId when editing
   * so a task never lists itself.
   */
  listPastTasksForActivity(viewer: User, activityId: string, excludeTaskId?: string): Promise<TaskReuseCandidate[]>;
}
