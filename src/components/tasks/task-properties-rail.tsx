"use client";

import { Calendar } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskStatusRail } from "@/components/tasks/task-status-rail";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { isTaskOverdue, formatDueDateShort } from "@/lib/data/task-display";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

interface TaskPropertiesRailProps {
  task: TaskWithRelations;
  canProgress: boolean;
  onStatusChange: (status: string | null) => void;
  statusPending: boolean;
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
export function TaskPropertiesRail({ task, canProgress, onStatusChange, statusPending }: TaskPropertiesRailProps) {
  const overdue = isTaskOverdue(task);

  return (
    <div className="flex flex-col divide-y">
      <PropertyRow label="Status">
        <div className="w-36">
          <TaskStatusRail
            status={task.status}
            onChange={canProgress ? (s) => onStatusChange(s) : undefined}
            disabled={statusPending}
          />
        </div>
      </PropertyRow>
      <PropertyRow label="Priority">
        <TaskPriorityBadge priority={task.priority} />
      </PropertyRow>
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
    </div>
  );
}
