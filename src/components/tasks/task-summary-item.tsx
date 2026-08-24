"use client";

import { Play } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskStatusBadge, STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { Badge } from "@/components/ui/badge";
import { formatExpectedTime } from "@/lib/data/expected-time";
import { cn } from "@/lib/utils";
import { getInitials as initials } from "@/lib/initials";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function formatDueDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface TaskSummaryItemProps {
  task: TaskWithRelations;
  onOpen: (taskId: string) => void;
  isRunning?: boolean;
  /** "chip" is the ultra-compact form used inside a Planner Week/Month calendar cell (title + one
   * status dot); "row" is the fuller form (title, Project → Service → Activity, status, priority,
   * assignee, expected time, running cue) used by Planner Day/Group and Dashboard KPI/list-widget
   * detail drawers. */
  variant?: "row" | "chip";
  showAssignee?: boolean;
  /** Shows the Task's due date on its own line (right-aligned, overdue-styled when applicable) — the
   * Dashboard's Task-based KPI detail drawers (Due Today/Overdue/etc.) need this; Planner's own
   * views already show the date via their calendar position, so they omit it. */
  showDueDate?: boolean;
}

/**
 * Shared, real Task presentation — reused by Planner (Day/Week/Month/Group) and the Dashboard's
 * Task-based KPI/list-widget detail drawers, so hierarchy/status/priority never drift between
 * surfaces. Never a fake/duplicate Task detail surface: clicking always opens the real Task drawer
 * via `onOpen`, never a second Task-detail implementation.
 */
export function TaskSummaryItem({ task, onOpen, isRunning, variant = "row", showAssignee, showDueDate }: TaskSummaryItemProps) {
  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        style={{ borderLeftColor: STATUS_COLOR_VAR[task.status] }}
        className="flex w-full items-center gap-1 rounded-md border border-l-2 bg-card px-1.5 py-1 text-left text-xs hover:bg-muted/60"
      >
        {isRunning && <Play className="size-2.5 shrink-0" style={{ color: "var(--info)" }} aria-hidden="true" />}
        <span className="truncate">{task.title}</span>
      </button>
    );
  }

  const isOverdue = showDueDate && task.status !== "done" && task.dueDate != null && task.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      style={{ borderLeftColor: STATUS_COLOR_VAR[task.status] }}
      className="flex w-full flex-col gap-1.5 rounded-lg border border-l-4 bg-card p-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {isRunning && <Play className="size-3 shrink-0" style={{ color: "var(--info)" }} aria-hidden="true" />}
          <span className="truncate">{task.title}</span>
          {task.parentTaskId && (
            <Badge variant="neutral" className="shrink-0 text-[10px]">
              SUBTASK
            </Badge>
          )}
        </span>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {task.parentTask ? (
          `Subtask of ${task.parentTask.title}`
        ) : (
          <>
            {task.workstream.projectName && <>{task.workstream.projectName} · </>}
            {task.workstream.name}
            {task.activity && <> · {task.activity.name}</>}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusBadge status={task.status} />
        {task.expectedMinutes != null && (
          <span className="text-xs text-muted-foreground">{formatExpectedTime(task.expectedMinutes)}</span>
        )}
        {showDueDate && task.dueDate && (
          <span className={cn("text-xs font-medium", isOverdue ? "text-warning" : "text-muted-foreground")}>
            Due {formatDueDate(task.dueDate)}
          </span>
        )}
        {showAssignee && task.assignees.length > 0 && (
          <div className="ml-auto flex -space-x-2">
            {task.assignees.map((a) => (
              <Avatar key={a.id} size="sm" className="ring-2 ring-card">
                <AvatarFallback className="text-[0.65rem]">{initials(a.fullName)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export function TaskSummaryEmptyState({ message }: { message: string }) {
  return <p className={cn("py-6 text-center text-sm text-muted-foreground")}>{message}</p>;
}
