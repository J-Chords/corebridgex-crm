"use client";

import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { isEmployee, isSuperadmin, isSupervisor, managesUser } from "@/lib/data/permissions";
import type { DepartmentWithActivities } from "@/lib/data/providers/activity-catalog-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { Activity, TaskStatus } from "@/lib/data/types";
import { TaskListRow, TaskListHeader } from "@/components/tasks/task-list-row";
import { isAssigneeColumnRedundantForViewer, subtaskSummary } from "@/lib/data/task-display";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkstreamActivityTasksProps {
  /** Pre-fetched at the page level (shared with the header's Add-task/Quick-Add gating) — this component never fetches its own copy. */
  departments: DepartmentWithActivities[];
  catalogLoading: boolean;
  tasks: TaskWithRelations[];
  isLoading: boolean;
  /** For the shared `TaskListRow`'s running-timer indicator — same prop every other List-view surface (Tasks Home, the Project workspace's Tasks tab) already threads through. */
  runningTaskId: string | null;
  /** Opens the (shared, page-level) Task form pre-filled with this workstream — and this activity, if given. */
  onAddTask: (activityId?: string) => void;
  /** Task Action correction — both passed together or neither, forwarded through every section down
   * to the shared `TaskListRow`. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

/** Row-level rendering shared with every other List-view surface (Tasks Home, the Project
 * workspace's Tasks tab) — Phase 13B final correction pass replaced this file's own
 * `TaskRowList`/`TaskRow` rendering with the literal same `TaskListRow` component, per the locked
 * "no third Task visual system" rule. Only this file's Activity-grouping/role-aware sectioning
 * (My Work/Team Work/Other Activities) is unique to the Service workspace — the row itself is not. */
function ActivityTaskRows({
  tasks,
  allTasks,
  runningTaskId,
  showAssignee,
  onEdit,
  onDeleted,
}: {
  tasks: TaskWithRelations[];
  allTasks: TaskWithRelations[];
  runningTaskId: string | null;
  showAssignee: boolean;
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <TaskListHeader context="service" showAssignee={showAssignee} showActions={Boolean(onEdit && onDeleted)} />
      <div className="flex flex-col divide-y">
        {tasks.map((task, i) => (
          <TaskListRow
            key={task.id}
            task={task}
            index={i}
            isRunning={task.id === runningTaskId}
            subtaskCount={task.parentTaskId ? undefined : subtaskSummary(task.id, allTasks)}
            context="service"
            showAssignee={showAssignee}
            onEdit={onEdit}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </div>
  );
}

/** In-progress/blocked/waiting-on-client work first — the actionable statuses — then todo, then done last so completed work never crowds out what still needs attention. Ties broken by due date (soonest first, undated last), matching what the row itself already implies. */
const STATUS_PRIORITY: Record<TaskStatus, number> = {
  "in-progress": 0,
  blocked: 1,
  "waiting-on-client": 2,
  todo: 3,
  done: 4,
};

function sortActivityTasks(tasks: TaskWithRelations[]): TaskWithRelations[] {
  return [...tasks].sort((a, b) => {
    const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDiff !== 0) return statusDiff;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

interface ActivityGroup {
  activity: Activity;
  tasks: TaskWithRelations[];
}

/** One Activity's card — full weight when it has tasks, visually compact/muted when it doesn't, so a long tail of unused activities never dominates the page. */
function ActivityCard({
  activity,
  tasks,
  allTasks,
  isLoading,
  runningTaskId,
  onAddTask,
  showAssignee,
  onEdit,
  onDeleted,
}: {
  activity: Activity;
  tasks: TaskWithRelations[];
  allTasks: TaskWithRelations[];
  isLoading: boolean;
  runningTaskId: string | null;
  onAddTask: (activityId?: string) => void;
  showAssignee: boolean;
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}) {
  const isEmpty = !isLoading && tasks.length === 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        isEmpty && "border-dashed bg-muted/10 py-2"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-sm font-medium", isEmpty && "text-muted-foreground")}>{activity.name}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto py-1 text-xs"
          onClick={() => onAddTask(activity.id)}
        >
          <Plus className="size-3" /> Add Task
        </Button>
      </div>
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">No tasks yet under this activity.</p>
      ) : (
        <ActivityTaskRows
          tasks={tasks}
          allTasks={allTasks}
          runningTaskId={runningTaskId}
          showAssignee={showAssignee}
          onEdit={onEdit}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function Section({
  label,
  groups,
  allTasks,
  isLoading,
  runningTaskId,
  onAddTask,
  showAssignee,
  onEdit,
  onDeleted,
}: {
  label: string | null;
  groups: ActivityGroup[];
  allTasks: TaskWithRelations[];
  isLoading: boolean;
  runningTaskId: string | null;
  onAddTask: (activityId?: string) => void;
  showAssignee: boolean;
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>}
      <div className="flex flex-col gap-3">
        {groups.map(({ activity, tasks }) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            tasks={tasks}
            allTasks={allTasks}
            isLoading={isLoading}
            runningTaskId={runningTaskId}
            onAddTask={onAddTask}
            showAssignee={showAssignee}
            onEdit={onEdit}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The workstream detail page's Activities card — Workstream → Activity → Task made visible, with
 * role-aware ordering so a person's actual work appears before activities that don't currently
 * concern them, rather than a long uniform wall of cards:
 *
 * - Employee: "My Work" (activities with an open task assigned to them) first, then "Other Activities".
 * - Supervisor: "My Work" (their own open tasks), then "Team Work" (their direct reports' open
 *   tasks), then "Other Activities" — an activity with both is shown once, in "My Work" (the
 *   higher-priority bucket), never duplicated across sections.
 * - Superadmin: no personal-work concept — "Active Activities" (has any tasks) then "Other Activities".
 *
 * Inside every activity, tasks are ordered by actionable status first (in-progress/blocked/waiting,
 * then todo, then done last).
 */
export function WorkstreamActivityTasks({ departments, catalogLoading, tasks, isLoading, runningTaskId, onAddTask, onEdit, onDeleted }: WorkstreamActivityTasksProps) {
  const { user } = useAuth();
  const activities = departments.flatMap((d) => d.activities);
  // Phase 13B final polish (Part B) — same audited rule as every other Task List surface:
  // Supervisor/Superadmin always keep Assignee; an Employee only loses it when every Task on this
  // Service is genuinely just "assigned to me."
  const showAssignee = user && isEmployee(user) ? !isAssigneeColumnRedundantForViewer(tasks, user.id) : true;

  if (!catalogLoading && activities.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">No activities are configured for this workstream.</p>
        {tasks.length === 0 ? (
          !isLoading && <p className="text-sm text-muted-foreground">No tasks on this workstream yet.</p>
        ) : (
          <ActivityTaskRows
            tasks={tasks}
            allTasks={tasks}
            runningTaskId={runningTaskId}
            showAssignee={showAssignee}
            onEdit={onEdit}
            onDeleted={onDeleted}
          />
        )}
      </div>
    );
  }

  if (!user) return null;

  const untaggedTasks = tasks.filter((t) => !t.activityId || !activities.some((a) => a.id === t.activityId));
  const groups: ActivityGroup[] = activities.map((activity) => ({
    activity,
    tasks: sortActivityTasks(tasks.filter((t) => t.activityId === activity.id)),
  }));

  const isOpen = (t: TaskWithRelations) => t.status !== "done";
  const isMine = (t: TaskWithRelations) => t.assignees.some((a) => a.id === user.id);
  const isTeam = (t: TaskWithRelations) => t.assignees.some((a) => a.id !== user.id && managesUser(user, a));

  let sections: { label: string | null; groups: ActivityGroup[] }[];

  if (isSuperadmin(user)) {
    sections = [
      { label: "Active Activities", groups: groups.filter((g) => g.tasks.length > 0) },
      { label: "Other Activities", groups: groups.filter((g) => g.tasks.length === 0) },
    ];
  } else if (isSupervisor(user)) {
    const myWork: ActivityGroup[] = [];
    const teamWork: ActivityGroup[] = [];
    const other: ActivityGroup[] = [];
    for (const g of groups) {
      if (g.tasks.some((t) => isOpen(t) && isMine(t))) myWork.push(g);
      else if (g.tasks.some((t) => isOpen(t) && isTeam(t))) teamWork.push(g);
      else other.push(g);
    }
    sections = [
      { label: "My Work", groups: myWork },
      { label: "Team Work", groups: teamWork },
      { label: "Other Activities", groups: other },
    ];
  } else {
    const myWork: ActivityGroup[] = [];
    const other: ActivityGroup[] = [];
    for (const g of groups) {
      if (g.tasks.some((t) => isOpen(t) && isMine(t))) myWork.push(g);
      else other.push(g);
    }
    sections = [
      { label: "My Work", groups: myWork },
      { label: "Other Activities", groups: other },
    ];
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <Section
          key={section.label}
          label={section.label}
          groups={section.groups}
          allTasks={tasks}
          isLoading={isLoading}
          runningTaskId={runningTaskId}
          onAddTask={onAddTask}
          showAssignee={showAssignee}
          onEdit={onEdit}
          onDeleted={onDeleted}
        />
      ))}

      {(untaggedTasks.length > 0 || (!isLoading && tasks.length === 0)) && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">No activity tag</span>
            <Button type="button" size="sm" variant="ghost" className="h-auto py-1 text-xs" onClick={() => onAddTask()}>
              <Plus className="size-3" /> Add Task
            </Button>
          </div>
          {untaggedTasks.length === 0 ? (
            !isLoading && <p className="text-sm text-muted-foreground">No untagged tasks.</p>
          ) : (
            <ActivityTaskRows
              tasks={untaggedTasks}
              allTasks={tasks}
              runningTaskId={runningTaskId}
              showAssignee={showAssignee}
              onEdit={onEdit}
              onDeleted={onDeleted}
            />
          )}
        </div>
      )}
    </div>
  );
}
