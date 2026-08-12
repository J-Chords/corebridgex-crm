"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { savedViewsProvider } from "@/lib/data/providers";
import type { SavedView } from "@/lib/data/types";

/** A viewer's own saved task-filter combinations — personal, never shared. */
export function useSavedViews() {
  const { user } = useAuth();
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await savedViewsProvider.listSavedViews(user);
    setSavedViews(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { savedViews, isLoading, refresh };
}
