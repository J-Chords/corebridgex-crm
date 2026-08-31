"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { User } from "@/lib/data/types";
import type { TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { canProgressTask } from "@/lib/data/permissions";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { tasksProvider } from "@/lib/data/providers";
import { subtaskSummary } from "@/lib/data/task-display";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { STATUS_COLOR_VAR, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: TASK_STATUS_SELECT_ITEMS.todo },
  { key: "in-progress", label: TASK_STATUS_SELECT_ITEMS["in-progress"] },
  { key: "blocked", label: TASK_STATUS_SELECT_ITEMS.blocked },
  { key: "waiting-on-client", label: TASK_STATUS_SELECT_ITEMS["waiting-on-client"] },
  { key: "done", label: TASK_STATUS_SELECT_ITEMS.done },
];

interface BoardCardProps {
  task: TaskWithRelations;
  canDrag: boolean;
  isRunning: boolean;
  subtaskCount?: { total: number; done: number };
  onNavigate: () => void;
  onEdit: (task: TaskWithRelations) => void;
  onDeleted: (taskId: string) => void;
}

function BoardCard({ task, canDrag, isRunning, subtaskCount, onNavigate, onEdit, onDeleted }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate();
        }
      }}
      title={canDrag ? undefined : "You don't have permission to change this task's status"}
      className={cn(
        "touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "opacity-50"
      )}
    >
      <TaskCard task={task} isRunning={isRunning} subtaskCount={subtaskCount} onEdit={onEdit} onDeleted={onDeleted} />
    </div>
  );
}

interface BoardColumnProps {
  status: TaskStatus;
  label: string;
  tasks: TaskWithRelations[];
  allTasks: TaskWithRelations[];
  user: User;
  assignableStaff: User[];
  runningTaskId: string | null;
  canAdd: boolean;
  onNavigate: (taskId: string) => void;
  onAddTask: (status: TaskStatus) => void;
  onEdit: (task: TaskWithRelations) => void;
  onDeleted: (taskId: string) => void;
}

/** Phase 12B — compact column header (dot + title + count) matching Reference 2's density, and a
 * bottom "+ Add task" affordance instead of the old boxed column chrome. */
function BoardColumn({ status, label, tasks, allTasks, user, assignableStaff, runningTaskId, canAdd, onNavigate, onAddTask, onEdit, onDeleted }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const color = STATUS_COLOR_VAR[status];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/20 p-2 transition-colors",
        isOver && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-1.5 px-1 py-0.5">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{tasks.length}</span>
        {canAdd && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto size-6"
            aria-label={`Add task to ${label}`}
            onClick={() => onAddTask(status)}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="flex min-h-16 flex-col gap-1.5">
        {tasks.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No tasks.</p>
        ) : (
          tasks.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              canDrag={canProgressTask(user, { assigneeIds: task.assignees.map((a) => a.id), companyId: task.companyId }, assignableStaff)}
              isRunning={task.id === runningTaskId}
              subtaskCount={task.parentTaskId ? undefined : subtaskSummary(task.id, allTasks)}
              onNavigate={() => onNavigate(task.id)}
              onEdit={onEdit}
              onDeleted={onDeleted}
            />
          ))
        )}
      </div>
      {canAdd && (
        <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => onAddTask(status)}>
          <Plus /> Add task
        </Button>
      )}
    </div>
  );
}

interface TaskBoardProps {
  user: User;
  tasks: TaskWithRelations[];
  onChanged: () => void;
  /** The task (if any) carrying the current viewer's own active running timer — drives each card's "Running" cue. */
  runningTaskId?: string | null;
  /** Phase 11B — when provided, a card click calls this instead of navigating to the full Task
   * route (Dashboard/Home's Quick View Drawer). The dedicated Tasks module (Board view) omits this
   * and keeps the default `router.push` navigate-to-full-page behavior per the locked navigation
   * rule. */
  onOpenTask?: (taskId: string) => void;
}

/** Kanban view of the same task list a screen already fetched — columns are fixed by status, cards drag between them to change status (permission-gated per card via canProgressTask). */
export function TaskBoard({ user, tasks, onChanged, runningTaskId = null, onOpenTask }: TaskBoardProps) {
  const router = useRouter();
  // Phase 13 security hardening — see task-actions-menu.tsx's own comment on why `assignableStaff`
  // is the right "allUsers" convenience list for this UI-only gate.
  const { assignableStaff } = useCompanyLookups();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  // Section 22 — dragging a parent Task with open Subtasks into Done needs the same confirmation the
  // drawer's status Select shows. Derived from the already-fetched `tasks` list (no extra fetch —
  // Section 49's N+1 avoidance), never stored.
  const [pendingDoneTaskId, setPendingDoneTaskId] = useState<string | null>(null);
  const [addStatus, setAddStatus] = useState<TaskStatus | null>(null);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);

  const grouped = new Map<TaskStatus, TaskWithRelations[]>(COLUMNS.map((c) => [c.key, []]));
  for (const task of tasks) grouped.get(task.status)?.push(task);

  async function applyStatusChange(taskId: string, newStatus: TaskStatus) {
    await tasksProvider.updateTaskStatus(user, taskId, newStatus);
    onChanged();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    if (!canProgressTask(user, { assigneeIds: task.assignees.map((a) => a.id), companyId: task.companyId }, assignableStaff)) return;
    if (newStatus === "done" && !task.parentTaskId && tasks.some((t) => t.parentTaskId === taskId && t.status !== "done")) {
      setPendingDoneTaskId(taskId);
      return;
    }
    await applyStatusChange(taskId, newStatus);
  }

  const pendingDoneTask = pendingDoneTaskId ? tasks.find((t) => t.id === pendingDoneTaskId) : undefined;
  const pendingOpenSubtaskCount = pendingDoneTaskId ? tasks.filter((t) => t.parentTaskId === pendingDoneTaskId && t.status !== "done").length : 0;

  const navigate = onOpenTask ?? ((taskId: string) => router.push(`/dashboard/tasks/${taskId}`));

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map(({ key, label }) => (
          <BoardColumn
            key={key}
            status={key}
            label={label}
            tasks={grouped.get(key) ?? []}
            allTasks={tasks}
            user={user}
            assignableStaff={assignableStaff}
            runningTaskId={runningTaskId}
            canAdd
            onNavigate={navigate}
            onAddTask={setAddStatus}
            onEdit={setEditingTask}
            onDeleted={onChanged}
          />
        ))}
      </div>
      <ConfirmDialog
        open={pendingDoneTaskId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDoneTaskId(null);
        }}
        title="Subtasks are still open"
        description={`${pendingOpenSubtaskCount} Subtask${pendingOpenSubtaskCount === 1 ? " is" : "s are"} still open. Mark "${pendingDoneTask?.title ?? "this Task"}" Done anyway?`}
        confirmLabel="Mark Done"
        onConfirm={() => {
          if (pendingDoneTaskId) void applyStatusChange(pendingDoneTaskId, "done");
        }}
      />
      <TaskFormDialog
        open={addStatus !== null}
        onOpenChange={(open) => !open && setAddStatus(null)}
        mode="create"
        defaultStatus={addStatus ?? undefined}
        onSaved={() => {
          setAddStatus(null);
          onChanged();
        }}
      />
      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={onChanged}
        />
      )}
    </DndContext>
  );
}
