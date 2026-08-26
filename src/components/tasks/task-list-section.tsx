"use client";

import { ChevronDown, Plus } from "lucide-react";
import type { TaskGroup } from "@/lib/data/hooks/use-task-filters";
import type { TaskGroupBy, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { TaskListRow } from "@/components/tasks/task-list-row";
import { subtaskSummary } from "@/lib/data/task-display";
import { cn } from "@/lib/utils";

interface TaskListSectionProps {
  group: TaskGroup;
  groupBy: TaskGroupBy;
  allTasks: TaskWithRelations[];
  runningTaskId: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onAddTask?: (status: TaskStatus) => void;
}

/**
 * Phase 12B — one List-view section: a compact, quietly-tinted header (icon/dot + title + count +
 * collapse chevron + "+" only when grouped by Status, since that's the only grouping with an
 * obvious status to preselect) followed by dense `TaskListRow`s. Reference 1's own group headers
 * use a stronger color wash than this — deliberately toned down per the locked "subtle tint, never
 * a saturated banner" rule (Part 53).
 */
export function TaskListSection({ group, groupBy, allTasks, runningTaskId, isCollapsed, onToggleCollapse, onAddTask }: TaskListSectionProps) {
  const statusColor = groupBy === "status" ? STATUS_COLOR_VAR[group.key as TaskStatus] : null;

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!isCollapsed}
        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left transition-colors", !statusColor && "bg-muted/40 hover:bg-muted/60")}
        style={statusColor ? { backgroundColor: `color-mix(in oklch, ${statusColor} 8%, var(--card))` } : undefined}
      >
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", isCollapsed && "-rotate-90")}
          aria-hidden="true"
        />
        {statusColor && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} aria-hidden="true" />}
        <span className="text-sm font-medium">{group.label}</span>
        <span className="font-mono text-xs text-muted-foreground">{group.tasks.length}</span>
        {onAddTask && groupBy === "status" && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(group.key as TaskStatus);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                onAddTask(group.key as TaskStatus);
              }
            }}
            aria-label={`Add task to ${group.label}`}
            className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </button>
      {!isCollapsed && (
        <div>
          {group.tasks.map((task, i) => (
            <TaskListRow
              key={task.id}
              task={task}
              index={i}
              isRunning={task.id === runningTaskId}
              subtaskCount={task.parentTaskId ? undefined : subtaskSummary(task.id, allTasks)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Plain, ungrouped fallback — Group by "None": a flat dense list, no section headers at all. */
export function FlatTaskList({ tasks, allTasks, runningTaskId }: { tasks: TaskWithRelations[]; allTasks: TaskWithRelations[]; runningTaskId: string | null }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {tasks.map((task, i) => (
        <TaskListRow
          key={task.id}
          task={task}
          index={i}
          isRunning={task.id === runningTaskId}
          subtaskCount={task.parentTaskId ? undefined : subtaskSummary(task.id, allTasks)}
        />
      ))}
    </div>
  );
}
