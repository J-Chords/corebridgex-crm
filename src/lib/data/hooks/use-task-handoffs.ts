"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { taskHandoffsProvider } from "@/lib/data/providers";
import type { TaskHandoffWithUsers, TeamHandoffActivity } from "@/lib/data/providers/task-handoffs-provider";

/** The viewer's most recent visible handoffs (their team's, for a supervisor) — feeds a dashboard activity panel. */
export function useRecentHandoffs(limit?: number) {
  const { user } = useAuth();
  const [handoffs, setHandoffs] = useState<TeamHandoffActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await taskHandoffsProvider.listRecentHandoffs(user, limit);
    setHandoffs(result);
    setIsLoading(false);
  }, [user, limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { handoffs, isLoading, refresh };
}

export function useTaskHandoffs(taskId: string) {
  const { user } = useAuth();
  const [handoffs, setHandoffs] = useState<TaskHandoffWithUsers[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await taskHandoffsProvider.listHandoffsForTask(user, taskId);
    setHandoffs(result);
    setIsLoading(false);
  }, [user, taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { handoffs, isLoading, refresh };
}
