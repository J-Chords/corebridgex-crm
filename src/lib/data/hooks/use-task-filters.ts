"use client";

import { useMemo, useState } from "react";
import type { TaskGroupBy, TaskPriority, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";

export interface TaskFilters {
  search: string;
  projectId: string;
  companyId: string;
  workstreamId: string;
  activityId: string;
  status: TaskStatus | "all";
  priority: TaskPriority | "all";
  assigneeId: string;
  /** Orthogonal to the fields above — organizes the already-filtered list, never narrows it. */
  groupBy: TaskGroupBy;
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  search: "",
  projectId: "all",
  companyId: "all",
  workstreamId: "all",
  activityId: "all",
  status: "all",
  priority: "all",
  assigneeId: "all",
  groupBy: "none",
};

export function filterTasks(tasks: TaskWithRelations[], filters: TaskFilters): TaskWithRelations[] {
  const query = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (
      query &&
      !task.title.toLowerCase().includes(query) &&
      !task.company.name.toLowerCase().includes(query) &&
      !task.workstream.name.toLowerCase().includes(query) &&
      !(task.workstream.serviceLineName && task.workstream.serviceLineName.toLowerCase().includes(query)) &&
      !(task.activity && task.activity.name.toLowerCase().includes(query))
    ) {
      return false;
    }
    if (filters.projectId && filters.projectId !== "all" && task.workstream.projectId !== filters.projectId) return false;
    if (filters.companyId !== "all" && task.companyId !== filters.companyId) return false;
    if (filters.workstreamId !== "all" && task.workstreamId !== filters.workstreamId) return false;
    if (filters.activityId && filters.activityId !== "all" && task.activity?.id !== filters.activityId) return false;
    if (filters.status !== "all" && task.status !== filters.status) return false;
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (filters.assigneeId !== "all" && !task.assignees.some((a) => a.id === filters.assigneeId)) return false;
    return true;
  });
}

function readPersistedFilters(storageKey: string): TaskFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return { ...DEFAULT_TASK_FILTERS, ...(JSON.parse(raw) as Partial<TaskFilters>) };
  } catch {
    return null;
  }
}

/**
 * Shared filter state for any "list of tasks" screen — pair with `filterTasks` and
 * `<TaskFilterBar>`. MVP Simplification Pass (boss feedback) — filtering a list, opening a Task,
 * then coming back must not silently reset to defaults. Passing a stable `storageKey` (unique per
 * page) persists filters to `sessionStorage` so they survive the unmount/remount a full Task-detail
 * navigation causes, for the lifetime of the browser tab; omitting it keeps the original
 * in-memory-only behavior (still the right choice for a screen that shouldn't remember state, e.g.
 * an ephemeral dialog). Each page needs its own key so unrelated screens never leak filters into
 * each other.
 */
export function useTaskFilters(storageKey?: string) {
  const [filters, setFilters] = useState<TaskFilters>(() =>
    storageKey ? (readPersistedFilters(storageKey) ?? DEFAULT_TASK_FILTERS) : DEFAULT_TASK_FILTERS
  );
  const patch = (next: Partial<TaskFilters>) =>
    setFilters((f) => {
      const merged = { ...f, ...next };
      if (storageKey && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(merged));
        } catch {
          // Storage can legitimately fail (private browsing, quota) — filtering still works for
          // the current mount, it just won't survive a navigate-away in that case.
        }
      }
      return merged;
    });
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
    for (const task of tasks) byId.set(task.workstream.id, workstreamDisplayHeading(task.workstream.name, task.workstream.serviceLineName));
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);
}

/** Unique Projects present in a task list, sorted by label — same idea as useCompanyOptionsFromTasks, scoped through each task's own workstream.projectId (a legacy not-yet-backfilled workstream with no Project is simply absent from this list, never a broken "unknown" entry). Labeled by the Task's own Company name (the normal daily identity, per `project-display.ts`) rather than the redundant date-ranged Project name — every Company has exactly one Project in the current data model, so this can never yet produce two identically-labeled options. */
export function useProjectOptionsFromTasks(tasks: TaskWithRelations[]) {
  return useMemo(() => {
    const byId = new Map<string, string>();
    for (const task of tasks) {
      if (task.workstream.projectId) byId.set(task.workstream.projectId, task.company.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);
}

/** Unique tagged Activities present in a task list, sorted by name — same idea as useCompanyOptionsFromTasks. Untagged tasks contribute nothing here (there's no "no activity" filter option; use the existing per-field filters for that). */
export function useActivityOptionsFromTasks(tasks: TaskWithRelations[]) {
  return useMemo(() => {
    const byId = new Map<string, string>();
    for (const task of tasks) {
      if (task.activity) byId.set(task.activity.id, `${task.activity.departmentName}: ${task.activity.name}`);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: TaskWithRelations[];
}

const STATUS_ORDER: TaskStatus[] = ["not-started", "in-progress", "waiting", "blocked", "completed", "canceled"];

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
      case "project":
        if (task.workstream.projectId) addTo(task.workstream.projectId, task.company.name, task);
        else addTo("none", "No project", task);
        break;
      case "company":
        addTo(task.company.id, task.company.name, task);
        break;
      case "workstream":
        addTo(task.workstream.id, workstreamDisplayHeading(task.workstream.name, task.workstream.serviceLineName), task);
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
