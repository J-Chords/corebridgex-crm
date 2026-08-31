"use client";

import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskSummaryItem, TaskSummaryEmptyState } from "@/components/tasks/task-summary-item";

const MAX_ROWS = 30;

interface TaskKpiDetailProps {
  tasks: TaskWithRelations[];
  emptyMessage: string;
  runningTaskId?: string | null;
  onOpenTask: (taskId: string) => void;
  /** Task Action correction — both passed together or neither, forwarded straight to every
   * `TaskSummaryItem` row's own `TaskActionsMenu`. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

/**
 * The real Task rows behind a Task-based KPI's expanded detail (My Open Tasks/Due Today/Overdue/
 * etc.) — reuses the exact same `TaskSummaryItem` Planner already established, never a second Task
 * summary implementation. `onOpenTask` is expected to close the KPI's own StatCard drawer first,
 * then open the real Task Drawer (see each dashboard's own wiring) — clean sequencing rather than
 * stacking two overlays.
 */
export function TaskKpiDetail({ tasks, emptyMessage, runningTaskId = null, onOpenTask, onEdit, onDeleted }: TaskKpiDetailProps) {
  if (tasks.length === 0) {
    return <TaskSummaryEmptyState message={emptyMessage} />;
  }
  return (
    <>
      {tasks.slice(0, MAX_ROWS).map((task) => (
        <TaskSummaryItem
          key={task.id}
          task={task}
          onOpen={onOpenTask}
          isRunning={task.id === runningTaskId}
          showDueDate
          showAssignee
          onEdit={onEdit}
          onDeleted={onDeleted}
        />
      ))}
      {tasks.length > MAX_ROWS && (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          Showing the first {MAX_ROWS} of {tasks.length} — use &ldquo;View all&rdquo; below for the complete list.
        </p>
      )}
    </>
  );
}
