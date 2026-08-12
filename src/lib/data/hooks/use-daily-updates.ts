"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { dailyUpdatesProvider } from "@/lib/data/providers";
import type { DailyUpdate } from "@/lib/data/types";

export function useMyTodayUpdate() {
  const { user } = useAuth();
  const [update, setUpdate] = useState<DailyUpdate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await dailyUpdatesProvider.getMyTodayUpdate(user);
    setUpdate(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { update, isLoading, refresh };
}

/** Every daily update `viewer` can see for one date — Team Updates' data source. Re-fetches whenever `date` changes; scoping (own + reports, per canViewDailyUpdate) is already enforced by the provider. */
export function useDailyUpdatesForDate(date: string) {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await dailyUpdatesProvider.listUpdatesForDate(user, date);
    setUpdates(result);
    setIsLoading(false);
  }, [user, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { updates, isLoading, refresh };
}
