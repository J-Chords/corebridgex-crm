"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { visitEntriesProvider } from "@/lib/data/providers";
import type { VisitEntry } from "@/lib/data/types";

/** The viewer's own Visit Entries, across every Project — callers filter by date (e.g. "today") client-side, same convention as `useMyTimeEntries`. */
export function useMyVisitEntries() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<VisitEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await visitEntriesProvider.listMyVisitEntries(user);
    setEntries(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { entries, isLoading, refresh };
}
