"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { CheckCircle2, Flag } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { STATUS_COLOR_VAR, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** How long the checkbox's own "gentle check" pop plays before the card starts easing out — long enough to register as a distinct beat, short enough to still feel quick. */
const MARK_DONE_POP_MS = 220;

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDueDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
}

/**
 * Card rendering for the tasks list's grouped view — deliberately a separate component from the
 * Kanban `TaskCard` (which stays exactly as-is, per "Board view stays as-is"): this one is a
 * self-contained clickable link rather than a draggable surface, and needs its own status cue +
 * due date since a grouped-by-anything grid can't rely on column/status position to imply status
 * the way a Kanban column does.
 */
export function TaskGridCard({ task, className, style, isFocusTask, onMarkDone, isExiting, onExitEnd }: TaskGridCardProps) {
  const [justChecked, setJustChecked] = useState(false);
  const isOverdue = task.status !== "done" && task.dueDate != null && task.dueDate < new Date().toISOString().slice(0, 10);

  function handleCheckedChange(checked: boolean) {
    if (!checked || !onMarkDone || justChecked) return;
    setJustChecked(true);
    window.setTimeout(onMarkDone, MARK_DONE_POP_MS);
  }

  return (
    <Link
      href={`/dashboard/tasks/${task.id}`}
      style={{ ...style, borderLeftColor: STATUS_COLOR_VAR[task.status] }}
      aria-disabled={isExiting}
      onAnimationEnd={isExiting ? onExitEnd : undefined}
      className={cn(
        "group/card flex flex-col gap-3 rounded-xl border border-l-4 bg-card p-4 text-left shadow-sm transition-all duration-300 ease-spring hover:-translate-y-1 hover:border-primary/40 hover:shadow-md",
        isExiting &&
          "pointer-events-none animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-2 fill-mode-forwards duration-300 ease-out",
        className
      )}
    >
      {isFocusTask && (
        <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-primary uppercase">
          <Flag className="size-3" aria-hidden="true" />
          Start here
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
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_COLOR_VAR[task.status] }}
          aria-hidden="true"
        />
        <span className="sr-only">{TASK_STATUS_SELECT_ITEMS[task.status]}</span>
        <span className="min-w-0 flex-1 text-sm font-medium break-words group-hover/card:underline">
          {task.title}
        </span>
        <TaskPriorityBadge priority={task.priority} />
      </div>

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
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>
    </Link>
  );
}
