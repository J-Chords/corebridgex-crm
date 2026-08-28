"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { CheckCircle2, Flag, Play } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { STATUS_COLOR_VAR, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { Checkbox } from "@/components/ui/checkbox";
import { isTaskOverdue, formatDueDateShort } from "@/lib/data/task-display";
import { cn } from "@/lib/utils";

/** How long the checkbox's own "gentle check" pop plays before the card starts easing out — long enough to register as a distinct beat, short enough to still feel quick. */
const MARK_DONE_POP_MS = 220;

import { getInitials as initials } from "@/lib/initials";

interface TaskGridCardProps {
  task: TaskWithRelations;
  className?: string;
  style?: CSSProperties;
  /** Quiet "start here" cue for the single most urgent open task on My Day — a small mono caption, not a badge that competes with priority. Omit elsewhere (Tasks list grid). */
  isFocusTask?: boolean;
  /** Quick-complete affordance — only rendered when provided (My Day's bucket grid) and the task isn't already done. Fires after the checkbox's own brief "check" pop plays. */
  onMarkDone?: () => void;
  /** True while this card is playing its exit animation after being marked done — becomes non-interactive and fades/slides out. Caller (`BucketTaskGrid`) owns this state. */
  isExiting?: boolean;
  /** Fires once the exit animation's CSS animation ends, so the caller can drop it from local state. */
  onExitEnd?: () => void;
  /** True when this task has the current viewer's own active running timer — shows a small "Running" cue alongside the status dot. */
  isRunning?: boolean;
  /** Phase 11B — when provided, the card opens this handler (Dashboard/Home's Quick View Drawer)
   * instead of navigating to the full Task route. Every dedicated work surface (Tasks module, My
   * Day) omits this and keeps its Link-navigate-to-full-page default per the locked navigation
   * rule. */
  onOpen?: (taskId: string) => void;
}

/**
 * Card rendering for the tasks list's grouped view — deliberately a separate component from the
 * Kanban `TaskCard` (which stays exactly as-is, per "Board view stays as-is"): this one is a
 * self-contained clickable link rather than a draggable surface, and needs its own status cue +
 * due date since a grouped-by-anything grid can't rely on column/status position to imply status
 * the way a Kanban column does.
 */
export function TaskGridCard({ task, className, style, isFocusTask, onMarkDone, isExiting, onExitEnd, isRunning, onOpen }: TaskGridCardProps) {
  const [justChecked, setJustChecked] = useState(false);
  const isOverdue = isTaskOverdue(task);

  function handleCheckedChange(checked: boolean) {
    if (!checked || !onMarkDone || justChecked) return;
    setJustChecked(true);
    window.setTimeout(onMarkDone, MARK_DONE_POP_MS);
  }

  const cardClassName = cn(
    "group/card flex w-full flex-col gap-3 rounded-xl border border-l-4 bg-card p-4 text-left shadow-sm transition-all duration-300 ease-spring hover:-translate-y-1 hover:border-primary/40 hover:shadow-md",
    isExiting &&
      "pointer-events-none animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-2 fill-mode-forwards duration-300 ease-out",
    className
  );
  const cardStyle = { ...style, borderLeftColor: STATUS_COLOR_VAR[task.status] };

  const content = (
    <>
      {(isFocusTask || isRunning) && (
        <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider uppercase" style={isRunning ? { color: "var(--info)" } : undefined}>
          {isRunning ? <Play className="size-3" aria-hidden="true" /> : <Flag className="size-3 text-primary" aria-hidden="true" />}
          <span className={isFocusTask && !isRunning ? "text-primary" : undefined}>{isRunning ? "Running" : "Start here"}</span>
        </span>
      )}

      <div className="flex items-start gap-2">
        {onMarkDone && task.status !== "done" && (
          <span
            className="mt-0.5 shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {justChecked ? (
              <CheckCircle2
                className="size-4 animate-in zoom-in-50 duration-200 ease-spring text-success"
                aria-hidden="true"
              />
            ) : (
              <Checkbox checked={false} onCheckedChange={handleCheckedChange} aria-label="Mark task done" />
            )}
          </span>
        )}
        <TaskStatusAvatar title={task.title} status={task.status} size="sm" className="mt-0.5" />
        <span className="sr-only">{TASK_STATUS_SELECT_ITEMS[task.status]}</span>
        <span className="min-w-0 flex-1 text-sm font-medium break-words group-hover/card:underline">
          {task.title}
          {task.parentTaskId && (
            <Badge variant="neutral" className="ml-1.5 align-middle text-[10px] no-underline">
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
            {task.company.name} · {task.workstream.name}
            {task.activity && <> · {task.activity.name}</>}
          </>
        )}
      </p>

      <ChecklistProgress
        done={task.checklistItems.filter((c) => c.isDone).length}
        total={task.checklistItems.length}
      />

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
          <span className={cn("text-xs font-medium", isOverdue ? "text-warning" : "text-muted-foreground")}>
            {formatDueDateShort(task.dueDate)}
          </span>
        )}
      </div>
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        style={cardStyle}
        aria-disabled={isExiting}
        onAnimationEnd={isExiting ? onExitEnd : undefined}
        className={cardClassName}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={`/dashboard/tasks/${task.id}`}
      style={cardStyle}
      aria-disabled={isExiting}
      onAnimationEnd={isExiting ? onExitEnd : undefined}
      className={cardClassName}
    >
      {content}
    </Link>
  );
}
