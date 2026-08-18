import { Play } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

function formatDueDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface TaskCardProps {
  task: TaskWithRelations;
  /** True when this task has the current viewer's own active running timer. */
  isRunning?: boolean;
}

/** Kanban card content — draggability/click handling is layered on by whatever renders it (see TaskBoard). The colored left accent mirrors TaskGridCard's own convention, so a status stays visibly identifiable even scrolled away from its column header. */
export function TaskCard({ task, isRunning }: TaskCardProps) {
  const isOverdue = task.status !== "done" && task.dueDate != null && task.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <div
      className="flex flex-col gap-2.5 rounded-lg border border-l-4 bg-card p-3 text-left shadow-sm"
      style={{ borderLeftColor: STATUS_COLOR_VAR[task.status] }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{task.title}</span>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {task.workstream.projectName ?? task.company.name} <span className="text-muted-foreground/60">·</span>{" "}
        {task.workstream.name}
        {task.activity && (
          <>
            {" "}
            <span className="text-muted-foreground/60">·</span> {task.activity.name}
          </>
        )}
      </span>
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
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--info)" }}>
              <Play className="size-3" aria-hidden="true" /> Running
            </span>
          )}
          {task.dueDate && (
            <span className={cn("text-xs font-medium", isOverdue ? "text-warning" : "text-muted-foreground")}>
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>
      <ChecklistProgress
        done={task.checklistItems.filter((c) => c.isDone).length}
        total={task.checklistItems.length}
      />
    </div>
  );
}
