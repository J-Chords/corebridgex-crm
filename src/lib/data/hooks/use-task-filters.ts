"use client";

import { useMemo, useState } from "react";
import type { TaskGroupBy, TaskPriority, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";

export interface TaskFilters {
  search: string;
  companyId: string;
  workstreamId: string;
  status: TaskStatus | "all";
  priority: TaskPriority | "all";
  assigneeId: string;
  /** Orthogonal to the fields above — organizes the already-filtered list, never narrows it. */
  groupBy: TaskGroupBy;
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  search: "",
  companyId: "all",
  workstreamId: "all",
  status: "all",
  priority: "all",
  assigneeId: "all",
  groupBy: "none",
};

export function filterTasks(tasks: TaskWithRelations[], filters: TaskFilters): TaskWithRelations[] {
  const query = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (query && !task.title.toLowerCase().includes(query)) return false;
    if (filters.companyId !== "all" && task.companyId !== filters.companyId) return false;
    if (filters.workstreamId !== "all" && task.workstreamId !== filters.workstreamId) return false;
    if (filters.status !== "all" && task.status !== filters.status) return false;
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (filters.assigneeId !== "all" && !task.assignees.some((a) => a.id === filters.assigneeId)) return false;
    return true;
  });
}

/** Shared filter state for any "list of tasks" screen — pair with `filterTasks` and `<TaskFilterBar>`. */
export function useTaskFilters() {
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);
  const patch = (next: Partial<TaskFilters>) => setFilters((f) => ({ ...f, ...next }));
  return { filters, patch };
}

/** Unique companies present in a task list, sorted by name — handy for scoping the company filter to only what's actually in view. */
export function useCompanyOptionsFromTasks(tasks: TaskWithRelations[]) {
  return useMemo(() => {
    const byId = new Map<string, string>();
    for (const task of tasks) byId.set(task.company.id, task.company.name);
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);
}

/** Unique workstreams present in a task list, sorted by name — same idea as useCompanyOptionsFromTasks. */
export function useWorkstreamOptionsFromTasks(tasks: TaskWithRelations[]) {
  return useMemo(() => {
    const byId = new Map<string, string>();
    for (const task of tasks) byId.set(task.workstream.id, task.workstream.name);
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: TaskWithRelations[];
}

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

/** Groups that represent "nothing" for their dimension — sorted last rather than wherever they'd alphabetically fall. */
function isFallbackGroup(key: string) {
  return key === "none" || key === "unassigned";
}

/**
 * Clusters an already-filtered task list for the tasks list view's "Group by" control — purely
 * organizational, never narrows which tasks are present (that's `filterTasks`'s job). A task with
 * multiple assignees appears once per assignee group, matching how multi-assignee grouping reads
 * elsewhere ("all of Priya's tasks together" should include a task she co-owns).
 */
export function groupTasksBy(tasks: TaskWithRelations[], groupBy: TaskGroupBy): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();

  function addTo(key: string, label: string, task: TaskWithRelations) {
    const existing = groups.get(key);
    if (existing) existing.tasks.push(task);
    else groups.set(key, { key, label, tasks: [task] });
  }

  for (const task of tasks) {
    switch (groupBy) {
      case "company":
        addTo(task.company.id, task.company.name, task);
        break;
      case "workstream":
        addTo(task.workstream.id, task.workstream.name, task);
        break;
      case "activity":
        if (task.activity) addTo(task.activity.id, `${task.activity.departmentName}: ${task.activity.name}`, task);
        else addTo("none", "No activity tag", task);
        break;
      case "status":
        addTo(task.status, TASK_STATUS_SELECT_ITEMS[task.status], task);
        break;
      case "assignee":
        if (task.assignees.length === 0) addTo("unassigned", "Unassigned", task);
        else for (const assignee of task.assignees) addTo(assignee.id, assignee.fullName, task);
        break;
      case "none":
        break;
    }
  }

  const result = Array.from(groups.values());
  if (groupBy === "status") {
    return result.sort((a, b) => STATUS_ORDER.indexOf(a.key as TaskStatus) - STATUS_ORDER.indexOf(b.key as TaskStatus));
  }
  return result.sort((a, b) => {
    if (isFallbackGroup(a.key) && !isFallbackGroup(b.key)) return 1;
    if (!isFallbackGroup(a.key) && isFallbackGroup(b.key)) return -1;
    return a.label.localeCompare(b.label);
  });
}
