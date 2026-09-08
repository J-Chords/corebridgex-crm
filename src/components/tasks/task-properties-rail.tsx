"use client";

import { Calendar } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskTimerState } from "@/lib/data/hooks/use-task-timer";
import { TaskStatusRail } from "@/components/tasks/task-status-rail";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { isTaskOverdue, formatDueDateShort } from "@/lib/data/task-display";
import { formatMinutes } from "@/lib/format-minutes";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

interface TaskPropertiesRailProps {
  task: TaskWithRelations;
  canProgress: boolean;
  onStatusChange: (status: string | null, statusReason?: string) => void;
  statusPending: boolean;
  /** Section 8/9 — Tracked is now this one Properties row, the single compact summary; the separate
   * Time Tracking control block below no longer repeats it (see `TaskTimerControl`'s own rail
   * variant), so the two never show the same "no time yet" message side by side. */
  timer: TaskTimerState;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Phase 12B — the right property rail's "Properties" block (Part 28): Status/Priority/Due date/
 * Assignees as compact label→value rows, not a stack of separate cards. Status is the only
 * interactive control here (via the compact `TaskStatusRail`, gated by the same `canProgressTask`
 * the page already computes); everything else is read-only display — Edit remains the one place
 * priority/due date/assignees actually change, per the locked "Edit is page-level" rule.
 */
export function TaskPropertiesRail({ task, canProgress, onStatusChange, statusPending, timer }: TaskPropertiesRailProps) {
  const overdue = isTaskOverdue(task);
  const requiresReason = task.status === "waiting" || task.status === "blocked";

  return (
    <div className="flex flex-col divide-y">
      <PropertyRow label="Status">
        <div className="w-36">
          <TaskStatusRail
            status={task.status}
            onChange={canProgress ? (s, reason) => onStatusChange(s, reason) : undefined}
            disabled={statusPending}
          />
        </div>
      </PropertyRow>
      {/* Only while Waiting/Blocked — the current workflow reason, never a substitute for Comments. */}
      {requiresReason && task.statusReason && (
        <PropertyRow label="Reason">
          <span className="text-right text-sm text-foreground">{task.statusReason}</span>
        </PropertyRow>
      )}
      <PropertyRow label="Priority">
        <TaskPriorityBadge priority={task.priority} />
      </PropertyRow>
      <PropertyRow label="Assignees">
        {task.assignees.length === 0 ? (
          <span className="text-sm text-muted-foreground">Unassigned</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {task.assignees.map((a) => (
                <Avatar key={a.id} size="sm" className="ring-2 ring-card">
                  <AvatarFallback className="text-[0.65rem]">{initials(a.fullName)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
            {task.assignees.length === 1 && <span className="truncate text-sm">{task.assignees[0].fullName}</span>}
          </div>
        )}
      </PropertyRow>
      {/* Shown only when set — unlike Due date, an absent Start Date doesn't waste rail space with
          a "Not set" placeholder; most Tasks won't have one. */}
      {task.startDate && (
        <PropertyRow label="Start date">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
            {formatDueDateShort(task.startDate)}
          </span>
        </PropertyRow>
      )}
      <PropertyRow label="Due date">
        {task.dueDate ? (
          <span className={cn("flex items-center gap-1.5 text-sm", overdue ? "font-medium text-warning" : "text-foreground")}>
            <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
            {formatDueDateShort(task.dueDate)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not set</span>
        )}
      </PropertyRow>
      <PropertyRow label="Estimated">
        <span className="text-sm text-foreground">
          {task.expectedMinutes != null ? formatMinutes(task.expectedMinutes) : <span className="text-muted-foreground">Not set</span>}
        </span>
      </PropertyRow>
      <PropertyRow label="Tracked">
        <span className="text-sm text-foreground">{timer.totalMinutes > 0 ? formatMinutes(timer.totalMinutes) : "0h"}</span>
      </PropertyRow>
      <PropertyRow label="Created by">
        <span
          className="truncate text-sm text-foreground"
          title={task.statusChangedBy ? `Status last changed by ${task.statusChangedBy.fullName}` : undefined}
        >
          {task.createdBy.fullName}
          {task.selfAdded && <span className="text-muted-foreground"> (self-added)</span>}
        </span>
      </PropertyRow>
    </div>
  );
}
