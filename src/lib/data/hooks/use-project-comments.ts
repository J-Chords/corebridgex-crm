"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { projectCommentsProvider } from "@/lib/data/providers";
import type { ProjectCommentTarget } from "@/lib/data/providers/projects-provider";
import type { ProjectComment } from "@/lib/data/types";

/** Project Level Part 9 — backs the one reusable Comments panel shared by the Project tab, the
 * full Task page, and the Project Documents surface. `target` is a stable-shaped object; callers
 * should memoize it (or pass primitive-derived literals) so this hook doesn't re-fetch on every
 * render. */
export function useProjectComments(target: ProjectCommentTarget | null) {
  const { user } = useAuth();
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !target) return;
    setIsLoading(true);
    try {
      const result = await projectCommentsProvider.listComments(user, target);
      setComments(result);
    } finally {
      setIsLoading(false);
    }
  }, [user, target?.projectId, target?.taskId, target?.documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { comments, isLoading, refresh };
}
