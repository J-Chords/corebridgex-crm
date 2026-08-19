"use client";

import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskStatus } from "@/lib/data/types";
import { TaskStatusDonut } from "@/components/tasks/task-status-donut";
import { STATUS_META, STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { TaskSummaryItem } from "@/components/tasks/task-summary-item";

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];
const MAX_PER_STATUS = 10;

interface TaskStatusFocusContentProps {
  tasks: TaskWithRelations[];
  onOpenTask: (taskId: string) => void;
}

/** The "Task(s) by Status" widget's own Focus View content — the same donut plus, for each status
 * that actually has tasks, a bounded list of the real underlying Tasks (no invented analytics, just
 * grouping already-loaded data by its existing `status` field). */
export function TaskStatusFocusContent({ tasks, onOpenTask }: TaskStatusFocusContentProps) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>;
  }

  return (
    <>
      <TaskStatusDonut tasks={tasks} />
      {STATUS_ORDER.map((status) => {
        const statusTasks = tasks.filter((t) => t.status === status);
        if (statusTasks.length === 0) return null;
        return (
          <div key={status} className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLOR_VAR[status] }}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{STATUS_META[status].label}</span>
              <span className="font-mono text-xs text-muted-foreground">{statusTasks.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {statusTasks.slice(0, MAX_PER_STATUS).map((task) => (
                <TaskSummaryItem key={task.id} task={task} onOpen={onOpenTask} showAssignee />
              ))}
              {statusTasks.length > MAX_PER_STATUS && (
                <p className="text-xs text-muted-foreground">
                  Showing the first {MAX_PER_STATUS} of {statusTasks.length}.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
