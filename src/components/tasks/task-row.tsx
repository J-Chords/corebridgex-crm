import Link from "next/link";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "@/components/tasks/task-status-badge";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { isTaskOverdue, formatDueDateShort } from "@/lib/data/task-display";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

interface TaskRowProps {
  task: TaskWithRelations;
  /** Defaults to the assignee names joined — pass e.g. the company name when that's more useful for the list's context. */
  subtitle?: string;
  /** Phase 11B — when provided, the row opens this handler (Dashboard/Home's Quick View Drawer)
   * instead of navigating to the full Task route. Every dedicated work surface (Tasks module,
   * Subtasks section, Company/Project/Workstream pages) omits this and keeps its Link-navigate
   * default per the locked navigation rule. */
  onOpen?: (taskId: string) => void;
}

/**
 * Phase 12B — a dense row (Part 36's own "○ Title · Status · Assignee · Due date" concept): a
 * small status dot, title, status label, assignee name(s), and due date. Used only by the parent
 * Task's Subtasks section — Subtasks aren't status-grouped the way the Tasks Home List view is, so
 * this row shows status explicitly (the List view's own `TaskListRow` deliberately omits it,
 * relying on its section header instead). Desktop renders one true aligned row; mobile (Part 10)
 * drops the fixed-width columns for a compact stacked block instead of overflowing.
 */
export function TaskRow({ task, subtitle, onOpen }: TaskRowProps) {
  const overdue = isTaskOverdue(task);
  const statusMeta = STATUS_META[task.status];
  const assigneeText = subtitle ?? (task.assignees.map((a) => a.fullName).join(", ") || "Unassigned");
  const className = "group/row flex w-full flex-col gap-1.5 px-1 py-2 text-left transition-colors hover:bg-muted/50 hover:no-underline";
  const dueClass = cn("text-xs", overdue ? "font-medium text-warning" : "text-muted-foreground");

  const titleLine = (
    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium group-hover/row:underline">
      <TaskStatusAvatar title={task.title} status={task.status} size="sm" />
      <span className="truncate">{task.title}</span>
      {task.parentTaskId && (
        <Badge variant="neutral" className="shrink-0 text-[10px] no-underline">
          SUBTASK
        </Badge>
      )}
    </span>
  );

  const content = (
    <>
      {/* Mobile — stacked */}
      <div className="flex flex-col gap-1 sm:hidden">
        {titleLine}
        <div className="flex flex-wrap items-center gap-2 pl-3.5 text-xs text-muted-foreground">
          <span>{statusMeta.label}</span>
          <span>·</span>
          <span className={dueClass}>{task.dueDate ? formatDueDateShort(task.dueDate) : "—"}</span>
        </div>
      </div>
      {/* Desktop — true aligned row */}
      <div className="hidden items-center gap-3 sm:flex">
        <div className="min-w-0 flex-1">{titleLine}</div>
        <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{statusMeta.label}</span>
        <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{assigneeText}</span>
        <span className={cn("w-20 shrink-0 text-right", dueClass)}>{task.dueDate ? formatDueDateShort(task.dueDate) : "—"}</span>
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

/** A dense vertical list of TaskRows — the shared shape the Subtasks section uses. */
export function TaskRowList({ tasks, emptyMessage, isLoading, subtitleFor, onOpen }: TaskRowListProps) {
  if (!isLoading && tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-col divide-y">
      {tasks.map((task, i) => (
        <div key={task.id} className={STAGGER_ITEM_CLASS} style={staggerDelay(i)}>
          <TaskRow task={task} subtitle={subtitleFor?.(task)} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}
