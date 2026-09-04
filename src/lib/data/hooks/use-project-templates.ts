"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { projectTemplatesProvider } from "@/lib/data/providers";
import type { ProjectTemplate } from "@/lib/data/types";

/** Project Level Part 4/5 — Admin-only Project Template catalog (optional Template picker on
 * Create Project, and the Admin Template management surface both read this same hook). */
export function useProjectTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await projectTemplatesProvider.listTemplates(user);
      setTemplates(result);
    } catch {
      // Non-Admin viewers simply see no templates (the picker/management surface is Admin-only
      // either way) — fail closed rather than surface a scary error on an optional feature.
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { templates, isLoading, refresh };
}
