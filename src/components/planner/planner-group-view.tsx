"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskGroupBy } from "@/lib/data/types";
import { groupTasksBy } from "@/lib/data/hooks/use-task-filters";
import { TaskGroupBySelect } from "@/components/tasks/task-group-by-select";
import { TaskSummaryItem, TaskSummaryEmptyState } from "@/components/tasks/task-summary-item";
import { cn } from "@/lib/utils";

/** Planner's own grouped workload perspective — deliberately narrower than the Task Center's Group
 * By (no "None"/"Client"/"Status" dimensions): this is about how planned work is distributed across
 * Project/Service/Activity/Assignee, not a general list-organizing tool. */
const PLANNER_GROUP_OPTIONS: TaskGroupBy[] = ["project", "workstream", "activity", "assignee"];

interface PlannerGroupViewProps {
  groupBy: TaskGroupBy;
  onGroupByChange: (value: TaskGroupBy) => void;
  tasks: TaskWithRelations[];
  onOpen: (taskId: string) => void;
  runningTaskId: string | null;
  showAssignee: boolean;
  allowAssigneeGrouping: boolean;
  /** Task Action correction — both passed together or neither. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

export function PlannerGroupView({
  groupBy,
  onGroupByChange,
  tasks,
  onOpen,
  runningTaskId,
  showAssignee,
  allowAssigneeGrouping,
  onEdit,
  onDeleted,
}: PlannerGroupViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const options = allowAssigneeGrouping ? PLANNER_GROUP_OPTIONS : PLANNER_GROUP_OPTIONS.filter((o) => o !== "assignee");
  const groups = groupTasksBy(tasks, groupBy);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <TaskGroupBySelect value={groupBy} onChange={onGroupByChange} options={options} />

      {groups.length === 0 ? (
        <TaskSummaryEmptyState message="No Tasks in this group." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  aria-expanded={!isCollapsed}
                  className="-mx-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                >
                  <ChevronDown
                    className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", isCollapsed && "-rotate-90")}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{group.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{group.tasks.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.tasks.map((task) => (
                      <TaskSummaryItem
                        key={task.id}
                        task={task}
                        onOpen={onOpen}
                        isRunning={task.id === runningTaskId}
                        showAssignee={showAssignee}
                        onEdit={onEdit}
                        onDeleted={onDeleted}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
