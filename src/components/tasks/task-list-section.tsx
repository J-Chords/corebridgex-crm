"use client";

import { ChevronDown, Plus } from "lucide-react";
import type { TaskGroup } from "@/lib/data/hooks/use-task-filters";
import type { TaskGroupBy, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { TaskListRow, TaskListHeader, type TaskListContext } from "@/components/tasks/task-list-row";
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
  /** Which Task list surface this is — controls how much Project/Service/Activity context the
   * column header and each row show (see `TaskListContext`). Defaults to "global", today's exact
   * behavior. */
  context?: TaskListContext;
  projectIsInternal?: boolean;
  /** Whether the Assignee column exists at all this render — page-level callers compute this via
   * `isAssigneeColumnRedundantForViewer` (Employee only; Supervisor/Superadmin always pass true).
   * Defaults to true (today's exact behavior). */
  showAssignee?: boolean;
  /** Task Action correction — both passed together or neither, forwarded straight through to every
   * `TaskListRow` this section renders. See `TaskListRow`'s own doc comment. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

/**
 * Phase 12B — one List-view section: a compact, quietly-tinted header (icon/dot + title + count +
 * collapse chevron + "+" only when grouped by Status, since that's the only grouping with an
 * obvious status to preselect) followed by a column header row (Part B, Phase 13B final polish —
 * hidden while the group is collapsed, shown immediately above its rows once expanded) and dense
 * `TaskListRow`s. Reference 1's own group headers use a stronger color wash than this — deliberately
 * toned down per the locked "subtle tint, never a saturated banner" rule (Part 53).
 */
export function TaskListSection({
  group,
  groupBy,
  allTasks,
  runningTaskId,
  isCollapsed,
  onToggleCollapse,
  onAddTask,
  context = "global",
  projectIsInternal,
  showAssignee = true,
  onEdit,
  onDeleted,
}: TaskListSectionProps) {
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
          <TaskListHeader context={context} showAssignee={showAssignee} showActions={Boolean(onEdit && onDeleted)} />
          {group.tasks.map((task, i) => (
            <TaskListRow
              key={task.id}
              task={task}
              index={i}
              isRunning={task.id === runningTaskId}
              subtaskCount={task.parentTaskId ? undefined : subtaskSummary(task.id, allTasks)}
              context={context}
              projectIsInternal={projectIsInternal}
              showAssignee={showAssignee}
              onEdit={onEdit}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Plain, ungrouped fallback — Group by "None": a flat dense list, a column header, then rows. */
export function FlatTaskList({
  tasks,
  allTasks,
  runningTaskId,
  context = "global",
  projectIsInternal,
  showAssignee = true,
  onEdit,
  onDeleted,
}: {
  tasks: TaskWithRelations[];
  allTasks: TaskWithRelations[];
  runningTaskId: string | null;
  context?: TaskListContext;
  projectIsInternal?: boolean;
  showAssignee?: boolean;
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <TaskListHeader context={context} showAssignee={showAssignee} showActions={Boolean(onEdit && onDeleted)} />
      {tasks.map((task, i) => (
        <TaskListRow
          key={task.id}
          task={task}
          index={i}
          isRunning={task.id === runningTaskId}
          subtaskCount={task.parentTaskId ? undefined : subtaskSummary(task.id, allTasks)}
          context={context}
          projectIsInternal={projectIsInternal}
          showAssignee={showAssignee}
          onEdit={onEdit}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
