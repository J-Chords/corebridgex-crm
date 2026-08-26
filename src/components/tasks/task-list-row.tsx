import { useRouter } from "next/navigation";
import { Layers, ListChecks, Play } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { isTaskOverdue, formatDueDateShort } from "@/lib/data/task-display";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

interface TaskListRowProps {
  task: TaskWithRelations;
  isRunning?: boolean;
  subtaskCount?: { total: number; done: number };
  index?: number;
  /** Dashboard/Home's Quick View — every dedicated work surface (Tasks Home included) omits this
   * and keeps the default full-page navigate, per the locked navigation rule. */
  onOpen?: (taskId: string) => void;
}

function TitleCell({ task, isRunning, subtaskCount }: Pick<TaskListRowProps, "task" | "isRunning" | "subtaskCount">) {
  const checklistTotal = task.checklistItems.length;
  const checklistDone = task.checklistItems.filter((c) => c.isDone).length;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5 font-medium">
        {isRunning && <Play className="size-3 shrink-0" style={{ color: "var(--info)" }} aria-hidden="true" />}
        <span className="truncate">{task.title}</span>
        {task.parentTaskId && (
          <Badge variant="neutral" className="shrink-0 text-[10px]">
            SUBTASK
          </Badge>
        )}
        {checklistTotal > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-normal text-muted-foreground" title="Checklist">
            <ListChecks className="size-3" aria-hidden="true" />
            {checklistDone}/{checklistTotal}
          </span>
        )}
        {subtaskCount && subtaskCount.total > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-normal text-muted-foreground" title="Subtasks">
            <Layers className="size-3" aria-hidden="true" />
            {subtaskCount.done}/{subtaskCount.total}
          </span>
        )}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {task.parentTask ? `Subtask of ${task.parentTask.title}` : task.company.name}
      </span>
    </div>
  );
}

function AssigneeAvatars({ task }: { task: TaskWithRelations }) {
  if (task.assignees.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex -space-x-2">
      {task.assignees.slice(0, 3).map((a) => (
        <Avatar key={a.id} size="sm" className="ring-2 ring-card">
          <AvatarFallback className="text-[0.65rem]">{initials(a.fullName)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

/**
 * Phase 12B — the dense List row (Reference 1): Task / Priority / Service / Due date / Assignee,
 * ~48px tall, no card chrome, a light hover background and a thin bottom divider instead of a
 * boxed row. No Status column — the section header (grouped by status by default) already carries
 * that. Desktop renders a true aligned grid row; mobile (Part 20) swaps to a compact stacked block
 * instead of forcing the same five columns into a narrow viewport. Used only by the Tasks Home
 * List view; Subtasks keep their own separate compact row (`TaskRow`), which still needs to show
 * status explicitly since Subtasks aren't status-grouped.
 */
export function TaskListRow({ task, isRunning, subtaskCount, index = 0, onOpen }: TaskListRowProps) {
  const router = useRouter();
  const overdue = isTaskOverdue(task);

  function navigate() {
    if (onOpen) onOpen(task.id);
    else router.push(`/dashboard/tasks/${task.id}`);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate();
        }
      }}
      className={cn("w-full cursor-pointer border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/50", STAGGER_ITEM_CLASS)}
      style={staggerDelay(index)}
    >
      {/* Mobile — compact stacked block */}
      <div className="flex flex-col gap-1.5 sm:hidden">
        <TitleCell task={task} isRunning={isRunning} subtaskCount={subtaskCount} />
        <div className="flex flex-wrap items-center gap-2">
          <TaskPriorityBadge priority={task.priority} />
          <span className="truncate text-xs text-muted-foreground">{task.workstream.name}</span>
          <span className={cn("ml-auto text-xs", overdue ? "font-medium text-warning" : "text-muted-foreground")}>
            {task.dueDate ? formatDueDateShort(task.dueDate) : "—"}
          </span>
          <AssigneeAvatars task={task} />
        </div>
      </div>
      {/* Desktop — true aligned grid row */}
      <div className="hidden min-h-7 grid-cols-[1fr_88px_140px_96px_88px] items-center gap-3 sm:grid">
        <TitleCell task={task} isRunning={isRunning} subtaskCount={subtaskCount} />
        <div>
          <TaskPriorityBadge priority={task.priority} />
        </div>
        <div className="min-w-0 text-xs text-muted-foreground">
          <span className="block truncate">{task.workstream.name}</span>
          {task.activity && <span className="block truncate text-muted-foreground/70">{task.activity.name}</span>}
        </div>
        <div className={cn("text-xs", overdue ? "font-medium text-warning" : "text-muted-foreground")}>
          {task.dueDate ? formatDueDateShort(task.dueDate) : "—"}
        </div>
        <AssigneeAvatars task={task} />
      </div>
    </div>
  );
}
