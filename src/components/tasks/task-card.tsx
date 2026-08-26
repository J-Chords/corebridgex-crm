import { Layers, ListChecks } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { isTaskOverdue, formatDueDateShort, taskServiceLabel } from "@/lib/data/task-display";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

interface TaskCardProps {
  task: TaskWithRelations;
  /** True when this task has the current viewer's own active running timer. */
  isRunning?: boolean;
  /** Derived client-side from the already-fetched task list (see `subtaskSummary`) — never a
   * per-card fetch. Omitted entirely (not "0/0") for a Subtask, which can't have children. */
  subtaskCount?: { total: number; done: number };
}

/**
 * Phase 12B — Board card, redesigned to Reference 2's compact density: title, a small Client/
 * Service line, priority + compact metadata icons (checklist, Subtasks) on one row, then assignee
 * avatars + due date on the bottom row. No description, no progress bar, no full breadcrumb, no
 * large status badge (status is already the column) — status stays legible via the thin left
 * accent only, matching `TaskGridCard`'s own existing convention.
 */
export function TaskCard({ task, isRunning, subtaskCount }: TaskCardProps) {
  const overdue = isTaskOverdue(task);
  const checklistTotal = task.checklistItems.length;
  const checklistDone = task.checklistItems.filter((c) => c.isDone).length;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-2.5 text-left">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {isRunning && (
            <span className="relative flex size-1.5 shrink-0" aria-hidden="true" title="Running">
              <span className="absolute inline-flex size-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "var(--info)" }} />
              <span className="relative inline-flex size-1.5 rounded-full" style={{ backgroundColor: "var(--info)" }} />
            </span>
          )}
          <span className="truncate">{task.title}</span>
          {task.parentTaskId && (
            <Badge variant="neutral" className="shrink-0 text-[10px]">
              SUBTASK
            </Badge>
          )}
        </span>
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {task.parentTask ? `Parent: ${task.parentTask.title}` : `${task.company.name} · ${taskServiceLabel(task)}`}
      </span>
      <div className="flex items-center gap-2">
        <TaskPriorityBadge priority={task.priority} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {checklistTotal > 0 && (
            <span className="flex items-center gap-0.5" title="Checklist">
              <ListChecks className="size-3" aria-hidden="true" />
              {checklistDone}/{checklistTotal}
            </span>
          )}
          {subtaskCount && subtaskCount.total > 0 && (
            <span className="flex items-center gap-0.5" title="Subtasks">
              <Layers className="size-3" aria-hidden="true" />
              {subtaskCount.done}/{subtaskCount.total}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {task.assignees.length === 0 ? (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        ) : (
          <div className="flex -space-x-2">
            {task.assignees.map((a) => (
              <Avatar key={a.id} size="sm" className="ring-2 ring-card">
                <AvatarFallback className="text-[0.65rem]">{initials(a.fullName)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
        {task.dueDate && (
          <span className={cn("text-xs font-medium", overdue ? "text-warning" : "text-muted-foreground")}>
            {formatDueDateShort(task.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}
