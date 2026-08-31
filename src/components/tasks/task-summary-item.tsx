"use client";

import { Play } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskStatusBadge, STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getInitials as initials } from "@/lib/initials";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { isTaskOverdue, formatDueDateShort } from "@/lib/data/task-display";
import { isLikelyInternalTask } from "@/lib/data/identity-color";
import { TaskActionsMenu } from "@/components/tasks/task-actions-menu";

interface TaskSummaryItemProps {
  task: TaskWithRelations;
  onOpen: (taskId: string) => void;
  isRunning?: boolean;
  /** "chip" is the ultra-compact form used inside a Planner Week/Month calendar cell (title + one
   * status dot); "row" is the fuller form (title, Project → Service → Activity, status, priority,
   * assignee, running cue) used by Planner Day/Group and Dashboard KPI/list-widget
   * detail drawers. */
  variant?: "row" | "chip";
  showAssignee?: boolean;
  /** Shows the Task's due date on its own line (right-aligned, overdue-styled when applicable) — the
   * Dashboard's Task-based KPI detail drawers (Due Today/Overdue/etc.) need this; Planner's own
   * views already show the date via their calendar position, so they omit it. */
  showDueDate?: boolean;
  /** Task Action correction — both passed together or neither: renders a `TaskActionsMenu` kebab as
   * an absolute overlay. Only offered on the "row" variant — the "chip" variant is too small a
   * target for a reliable kebab and stays read/navigate-only. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

/**
 * Shared, real Task presentation — reused by Planner (Day/Week/Month/Group) and the Dashboard's
 * Task-based KPI/list-widget detail drawers, so hierarchy/status/priority never drift between
 * surfaces. Never a fake/duplicate Task detail surface: clicking always opens the real Task drawer
 * via `onOpen`, never a second Task-detail implementation.
 */
export function TaskSummaryItem({ task, onOpen, isRunning, variant = "row", showAssignee, showDueDate, onEdit, onDeleted }: TaskSummaryItemProps) {
  // Phase 13 Planner consistency fix — the chip stays exactly as compact as before; the kebab
  // (when authorized) is an always-visible sibling, never a hover-only reveal. Hover has no
  // touch-device equivalent at all, and this component has no reliable way to know whether it's
  // rendering for a mouse or a touch user, so an always-visible (never squeezed below the
  // standard, already-accessible `TaskActionsMenu` size used everywhere else in the app) trigger
  // is the only option that is deterministically reachable on both input types — never an
  // inaccessible shrunken icon. The chip itself is unchanged; the kebab is a flex sibling, not
  // nested inside the chip's own `<button>` (a `<button>` cannot legally nest in another).
  const showChipActions = Boolean(onEdit && onDeleted);
  if (variant === "chip") {
    return (
      <div className="flex w-full items-center gap-0.5">
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          style={{ borderLeftColor: STATUS_COLOR_VAR[task.status] }}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-l-2 bg-card px-1.5 py-1 text-left text-xs hover:bg-muted/60"
        >
          {isRunning && <Play className="size-2.5 shrink-0" style={{ color: "var(--info)" }} aria-hidden="true" />}
          <span className="truncate" title={task.title}>{task.title}</span>
        </button>
        {showChipActions && (
          <TaskActionsMenu task={task} onEdit={() => onEdit?.(task)} onDeleted={() => onDeleted?.(task.id)} className="shrink-0" />
        )}
      </div>
    );
  }

  const isOverdue = showDueDate && isTaskOverdue(task);
  const showActions = Boolean(onEdit && onDeleted);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        style={{ borderLeftColor: STATUS_COLOR_VAR[task.status] }}
        className="flex w-full flex-col gap-1.5 rounded-lg border border-l-4 bg-card p-3 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <TaskStatusAvatar title={task.title} status={task.status} size="sm" />
            {isRunning && <Play className="size-3 shrink-0" style={{ color: "var(--info)" }} aria-hidden="true" />}
            <span className="truncate" title={task.title}>{task.title}</span>
            {task.parentTaskId && (
              <Badge variant="neutral" className="shrink-0 text-[10px]">
                SUBTASK
              </Badge>
            )}
          </span>
          <TaskPriorityBadge priority={task.priority} />
          {showActions && <span className="size-7 shrink-0" aria-hidden="true" />}
        </div>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
          {!task.parentTask && (
            <CompanyProjectAvatar companyId={task.company.id} companyName={task.company.name} size="sm" isInternal={isLikelyInternalTask(task)} />
          )}
          <span
            className="truncate"
            title={
              task.parentTask
                ? `Subtask of ${task.parentTask.title}`
                : `${task.company.name} · ${task.workstream.name}${task.activity ? ` · ${task.activity.name}` : ""}`
            }
          >
            {task.parentTask ? (
              `Subtask of ${task.parentTask.title}`
            ) : (
              <>
                {task.company.name} · {task.workstream.name}
                {task.activity && <> · {task.activity.name}</>}
              </>
            )}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          {showDueDate && task.dueDate && (
            <span className={cn("text-xs font-medium", isOverdue ? "text-warning" : "text-muted-foreground")}>
              Due {formatDueDateShort(task.dueDate)}
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
      {showActions && (
        <TaskActionsMenu
          task={task}
          onEdit={() => onEdit?.(task)}
          onDeleted={() => onDeleted?.(task.id)}
          className="absolute top-3 right-3"
        />
      )}
    </div>
  );
}

export function TaskSummaryEmptyState({ message }: { message: string }) {
  return <p className={cn("py-6 text-center text-sm text-muted-foreground")}>{message}</p>;
}
