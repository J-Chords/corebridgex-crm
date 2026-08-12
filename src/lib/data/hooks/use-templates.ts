"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { templatesProvider } from "@/lib/data/providers";
import type { TemplateWithTasks } from "@/lib/data/providers/templates-provider";

export function useTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateWithTasks[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await templatesProvider.listTemplates(user);
    setTemplates(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { templates, isLoading, refresh };
}
