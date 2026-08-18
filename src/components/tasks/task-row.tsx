import Link from "next/link";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Separator } from "@/components/ui/separator";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";

interface TaskRowProps {
  task: TaskWithRelations;
  /** Defaults to the assignee names joined — pass e.g. the company name when that's more useful for the list's context. */
  subtitle?: string;
  /** When provided, the row opens this handler (e.g. the Task Center's drawer) instead of navigating to the full Task route — every other embedding (dashboards, Company/Project/Workstream pages) omits this and keeps its original Link-navigate behavior unchanged. */
  onOpen?: (taskId: string) => void;
}

export function TaskRow({ task, subtitle, onOpen }: TaskRowProps) {
  const className =
    "group/row -mx-2 flex w-full flex-col gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60 hover:no-underline sm:flex-row sm:items-center sm:justify-between sm:gap-4";
  const content = (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium group-hover/row:underline">{task.title}</span>
        <span className="text-xs text-muted-foreground">
          {subtitle ?? (task.assignees.map((a) => a.fullName).join(", ") || "Unassigned")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <TaskPriorityBadge priority={task.priority} />
        <TaskStatusBadge status={task.status} />
      </div>
      <div className="w-full sm:w-40">
        <ChecklistProgress
          done={task.checklistItems.filter((c) => c.isDone).length}
          total={task.checklistItems.length}
        />
      </div>
    </>
  );

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(task.id)} className={className}>
        {content}
      </button>
    );
  }

  return (
    <Link href={`/dashboard/tasks/${task.id}`} className={className}>
      {content}
    </Link>
  );
}

interface TaskRowListProps {
  tasks: TaskWithRelations[];
  emptyMessage: string;
  isLoading?: boolean;
  subtitleFor?: (task: TaskWithRelations) => string;
  /** Passed straight through to every TaskRow — see TaskRowProps.onOpen. */
  onOpen?: (taskId: string) => void;
}

/** A vertical list of TaskRows, separated — the shared shape used by every "list of tasks" surface in the app. */
export function TaskRowList({ tasks, emptyMessage, isLoading, subtitleFor, onOpen }: TaskRowListProps) {
  if (!isLoading && tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {tasks.map((task, i) => (
        <div key={task.id} className={STAGGER_ITEM_CLASS} style={staggerDelay(i)}>
          {i > 0 && <Separator className="my-3" />}
          <TaskRow task={task} subtitle={subtitleFor?.(task)} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}
