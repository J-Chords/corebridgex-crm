import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { ChecklistProgress } from "@/components/ui/checklist-progress";

import { getInitials as initials } from "@/lib/initials";

/** Kanban card content — draggability/click handling is layered on by whatever renders it (see TaskBoard). The colored left accent mirrors TaskGridCard's own convention, so a status stays visibly identifiable even scrolled away from its column header. */
export function TaskCard({ task }: { task: TaskWithRelations }) {
  return (
    <div
      className="flex flex-col gap-2.5 rounded-lg border border-l-4 bg-card p-3 text-left shadow-sm"
      style={{ borderLeftColor: STATUS_COLOR_VAR[task.status] }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{task.title}</span>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      <span className="text-xs text-muted-foreground">
        {task.company.name} <span className="text-muted-foreground/60">·</span> {task.workstream.name}
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
      </div>
      <ChecklistProgress
        done={task.checklistItems.filter((c) => c.isDone).length}
        total={task.checklistItems.length}
      />
    </div>
  );
}
