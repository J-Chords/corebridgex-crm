import { useRouter } from "next/navigation";
import { Layers, ListChecks, Play } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { isTaskOverdue, formatDueDateShort } from "@/lib/data/task-display";
import { isLikelyInternalTask } from "@/lib/data/identity-color";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

/**
 * Which Task list surface a row/header is rendering in — controls how much Project/Service/
 * Activity context is shown, since a Project-scoped or Service-scoped list already establishes
 * part of that context on the page itself and shouldn't repeat it on every row:
 * - "global" (`/dashboard/tasks`): nothing is known ahead of time — full context cell (Project
 *   identity avatar + Project name, then Service · Activity).
 * - "project" (a Project's own Tasks tab): Project is already known — context cell drops the
 *   avatar/Project name, keeps Service · Activity only.
 * - "service" (a Service/Activity's own Task list): Service AND Activity are both already known —
 *   no context column at all.
 */
export type TaskListContext = "global" | "project" | "service";

/** One shared source for both `TaskListHeader` and `TaskListRow`'s desktop grid — guarantees the
 * header's columns can never drift out of alignment with the row's actual columns. `showAssignee`
 * (Phase 13B final polish, Part B) is a second, independent axis: when false the Assignee column is
 * dropped from the template entirely (not just visually hidden), for the audited case where it's
 * genuinely redundant for the current viewer/dataset — see
 * `isAssigneeColumnRedundantForViewer` (`task-display.ts`). */
export function taskListGridCols(context: TaskListContext, showAssignee = true): string {
  if (context === "service") return showAssignee ? "grid-cols-[1fr_88px_96px_88px]" : "grid-cols-[1fr_88px_96px]";
  return showAssignee ? "grid-cols-[1fr_88px_140px_96px_88px]" : "grid-cols-[1fr_88px_140px_96px]";
}

export function taskListHeaderLabels(context: TaskListContext, showAssignee = true): string[] {
  const labels: string[] =
    context === "service" ? ["Task", "Priority", "Due"] : ["Task", "Priority", context === "global" ? "Project / Service" : "Service", "Due"];
  return showAssignee ? [...labels, "Assignee"] : labels;
}

/**
 * The shared column header row for any `TaskListRow`-based list — rendered once per expanded
 * status group (never on a collapsed group), aligned exactly to the row grid below it via the same
 * `taskListGridCols` template. Desktop-only, matching the row's own `hidden sm:grid` split — the
 * mobile stacked-card layout never shows column headers, since its content isn't columnar.
 */
export function TaskListHeader({ context = "global", showAssignee = true }: { context?: TaskListContext; showAssignee?: boolean }) {
  return (
    <div
      className={cn(
        "hidden h-8 items-center gap-3 border-b bg-muted/20 px-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase sm:grid",
        taskListGridCols(context, showAssignee)
      )}
    >
      {taskListHeaderLabels(context, showAssignee).map((label) => (
        <span key={label} className="truncate">
          {label}
        </span>
      ))}
    </div>
  );
}

interface TaskListRowProps {
  task: TaskWithRelations;
  isRunning?: boolean;
  subtaskCount?: { total: number; done: number };
  index?: number;
  /** Dashboard/Home's Quick View — every dedicated work surface (Tasks Home included) omits this
   * and keeps the default full-page navigate, per the locked navigation rule. */
  onOpen?: (taskId: string) => void;
  /** Defaults to "global" (today's exact behavior: Company/Service/Activity all shown). */
  context?: TaskListContext;
  /** Project-scoped lists (context="project") already have a reliable, already-fetched
   * `ProjectWithRelations.isInternal` in scope — pass it through so the Internal Project's own
   * Tasks get the correct neutral avatar treatment there. Global/service contexts fall back to an
   * id-based heuristic (reliable in mock data; the real hosted Company/Project ids aren't the fixed
   * `INTERNAL_COMPANY_ID`/`INTERNAL_PROJECT_ID` strings, so this is a best-effort, not a guarantee,
   * there — documented, not silently assumed correct). */
  projectIsInternal?: boolean;
  /** Defaults to true (today's behavior). The caller (page-level) decides this per the audited
   * "is it actually redundant for this viewer/dataset" rule — never a blanket per-role toggle here. */
  showAssignee?: boolean;
}

function isLikelyInternal(task: TaskWithRelations, projectIsInternal?: boolean): boolean {
  return projectIsInternal !== undefined ? projectIsInternal : isLikelyInternalTask(task);
}

function TitleCell({ task, isRunning, subtaskCount }: Pick<TaskListRowProps, "task" | "isRunning" | "subtaskCount">) {
  const checklistTotal = task.checklistItems.length;
  const checklistDone = task.checklistItems.filter((c) => c.isDone).length;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* Task's own status-colored identity (Part C/D) — distinct in shape (rounded-md) and
          meaning (workflow state, not client identity or a person) from the Project/Company and
          Assignee avatars elsewhere in the same row. */}
      <TaskStatusAvatar title={task.title} status={task.status} size="sm" />
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
        {/* "Subtask of X" still needs to be said somewhere — everything else (Company/Project) now
            lives in the dedicated context cell instead of repeating here. */}
        {task.parentTask && (
          <span className="truncate text-xs text-muted-foreground">Subtask of {task.parentTask.title}</span>
        )}
      </div>
    </div>
  );
}

/** The unified Project-identity + Service/Activity cell (Part C) — replaces the old split of a
 * Company name under the title plus a separate Service column. Only ever shows what this list's
 * `context` doesn't already establish on the page around it. */
function ContextCell({ task, context, projectIsInternal }: { task: TaskWithRelations; context: TaskListContext; projectIsInternal?: boolean }) {
  if (context === "service") return null;
  const showProjectIdentity = context === "global";
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      {showProjectIdentity && (
        <CompanyProjectAvatar
          companyId={task.company.id}
          companyName={task.company.name}
          size="sm"
          isInternal={isLikelyInternal(task, projectIsInternal)}
        />
      )}
      <div className="min-w-0">
        {showProjectIdentity && (
          <span className="block truncate font-medium text-foreground">{task.company.name}</span>
        )}
        <span className="block truncate">
          {task.workstream.name}
          {task.activity && ` · ${task.activity.name}`}
        </span>
      </div>
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
 * Phase 12B — the dense List row (Reference 1): Task / Priority / Context / Due date / Assignee,
 * ~48px tall, no card chrome, a light hover background and a thin bottom divider instead of a
 * boxed row. No Status column — the section header (grouped by status by default) already carries
 * that. Desktop renders a true aligned grid row (via `TASK_LIST_GRID_COLS`, shared with
 * `TaskListHeader` so the two can never drift apart); mobile (Part 20) swaps to a compact stacked
 * block instead of forcing the same columns into a narrow viewport. Used only by the Tasks Home
 * List view (and, since Phase 13B's final polish pass, the Project Tasks tab and Service Activity
 * Task lists too, via the `context` prop); Subtasks keep their own separate compact row (`TaskRow`),
 * which still needs to show status explicitly since Subtasks aren't status-grouped.
 */
export function TaskListRow({
  task,
  isRunning,
  subtaskCount,
  index = 0,
  onOpen,
  context = "global",
  projectIsInternal,
  showAssignee = true,
}: TaskListRowProps) {
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
          {context !== "service" && (
            <span className="truncate text-xs text-muted-foreground">
              {context === "global" ? task.company.name : task.workstream.name}
            </span>
          )}
          <span className={cn("ml-auto text-xs", overdue ? "font-medium text-warning" : "text-muted-foreground")}>
            {task.dueDate ? formatDueDateShort(task.dueDate) : "—"}
          </span>
          {showAssignee && <AssigneeAvatars task={task} />}
        </div>
      </div>
      {/* Desktop — true aligned grid row, template shared with TaskListHeader */}
      <div className={cn("hidden min-h-7 items-center gap-3 sm:grid", taskListGridCols(context, showAssignee))}>
        <TitleCell task={task} isRunning={isRunning} subtaskCount={subtaskCount} />
        <div>
          <TaskPriorityBadge priority={task.priority} />
        </div>
        {context !== "service" && <ContextCell task={task} context={context} projectIsInternal={projectIsInternal} />}
        <div className={cn("text-xs", overdue ? "font-medium text-warning" : "text-muted-foreground")}>
          {task.dueDate ? formatDueDateShort(task.dueDate) : "—"}
        </div>
        {showAssignee && <AssigneeAvatars task={task} />}
      </div>
    </div>
  );
}
