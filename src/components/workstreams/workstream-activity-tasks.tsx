"use client";

import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin, isSupervisor, managesUser } from "@/lib/data/permissions";
import type { DepartmentWithActivities } from "@/lib/data/providers/activity-catalog-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { Activity, TaskStatus } from "@/lib/data/types";
import { TaskRowList } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkstreamActivityTasksProps {
  /** Pre-fetched at the page level (shared with the header's Add-task/Quick-Add gating) — this component never fetches its own copy. */
  departments: DepartmentWithActivities[];
  catalogLoading: boolean;
  tasks: TaskWithRelations[];
  isLoading: boolean;
  /** Opens the (shared, page-level) Task form pre-filled with this workstream — and this activity, if given. */
  onAddTask: (activityId?: string) => void;
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
  isLoading,
  onAddTask,
}: {
  activity: Activity;
  tasks: TaskWithRelations[];
  isLoading: boolean;
  onAddTask: (activityId?: string) => void;
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
      {!isEmpty && (
        <TaskRowList tasks={tasks} isLoading={isLoading} emptyMessage="No tasks yet under this activity." />
      )}
    </div>
  );
}

function Section({ label, groups, isLoading, onAddTask }: { label: string | null; groups: ActivityGroup[]; isLoading: boolean; onAddTask: (activityId?: string) => void }) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>}
      <div className="flex flex-col gap-3">
        {groups.map(({ activity, tasks }) => (
          <ActivityCard key={activity.id} activity={activity} tasks={tasks} isLoading={isLoading} onAddTask={onAddTask} />
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
export function WorkstreamActivityTasks({ departments, catalogLoading, tasks, isLoading, onAddTask }: WorkstreamActivityTasksProps) {
  const { user } = useAuth();
  const activities = departments.flatMap((d) => d.activities);

  if (!catalogLoading && activities.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">No activities are configured for this workstream.</p>
        <TaskRowList tasks={tasks} isLoading={isLoading} emptyMessage="No tasks on this workstream yet." />
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
        <Section key={section.label} label={section.label} groups={section.groups} isLoading={isLoading} onAddTask={onAddTask} />
      ))}

      {(untaggedTasks.length > 0 || (!isLoading && tasks.length === 0)) && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">No activity tag</span>
            <Button type="button" size="sm" variant="ghost" className="h-auto py-1 text-xs" onClick={() => onAddTask()}>
              <Plus className="size-3" /> Add Task
            </Button>
          </div>
          <TaskRowList tasks={untaggedTasks} isLoading={isLoading} emptyMessage="No untagged tasks." />
        </div>
      )}
    </div>
  );
}
