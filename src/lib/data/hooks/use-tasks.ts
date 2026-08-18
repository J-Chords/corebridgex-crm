"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { tasksProvider } from "@/lib/data/providers";
import type { TaskReuseCandidate, TaskWithRelations } from "@/lib/data/providers/tasks-provider";

export function useTasks(filters?: { companyId?: string; workstreamId?: string; workstreamIds?: string[] }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await tasksProvider.listTasks(user);
    setTasks(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const filtered = tasks.filter((t) => {
    if (filters?.companyId && t.companyId !== filters.companyId) return false;
    if (filters?.workstreamId && t.workstreamId !== filters.workstreamId) return false;
    if (filters?.workstreamIds && !filters.workstreamIds.includes(t.workstreamId)) return false;
    return true;
  });

  return { tasks: filtered, isLoading, refresh };
}

export function useTask(id: string) {
  const { user } = useAuth();
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await tasksProvider.getTask(user, id);
    setTask(result);
    setNotFound(!result);
    setIsLoading(false);
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { task, isLoading, notFound, refresh };
}

/**
 * "My" tasks — those the viewer is personally an assignee on. For an employee
 * this is a no-op filter (listTasks already returns only their own), but for
 * supervisor/superadmin it narrows a team-wide/org-wide list down to just
 * theirs. Single source of truth for "my tasks" — reused by the employee
 * dashboard, the supervisor dashboard's personal-work card, and My Day.
 */
export function useMyTasks() {
  const { user } = useAuth();
  const { tasks, isLoading, refresh } = useTasks();
  const myTasks = user ? tasks.filter((t) => t.assignees.some((a) => a.id === user.id)) : [];
  return { tasks: myTasks, isLoading, refresh };
}

/** "Reuse from past" candidates for the given activity — pass null to skip the fetch (no activity tagged yet). */
export function useTaskReuseCandidates(activityId: string | null, excludeTaskId?: string) {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<TaskReuseCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !activityId) {
      setCandidates([]);
      return;
    }
    setIsLoading(true);
    const result = await tasksProvider.listPastTasksForActivity(user, activityId, excludeTaskId);
    setCandidates(result);
    setIsLoading(false);
  }, [user, activityId, excludeTaskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { candidates, isLoading, refresh };
}
