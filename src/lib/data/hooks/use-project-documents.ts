"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { documentsProvider } from "@/lib/data/providers";
import type { Document } from "@/lib/data/types";

/**
 * Project Level Part 14 — active and Trashed Documents for one Project, fetched independently
 * (never one list re-sliced client-side, matching `documents_select_trash`'s own separate RLS
 * scope: Trash is visible only to whoever could restore it, active is visible to any legitimate
 * Project/Task viewer).
 */
export function useProjectDocuments(projectId: string) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [trashedDocuments, setTrashedDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const [active, trashed] = await Promise.all([
      documentsProvider.listProjectDocuments(user, projectId),
      documentsProvider.listProjectDocuments(user, projectId, { trashed: true }),
    ]);
    setDocuments(active);
    setTrashedDocuments(trashed);
    setIsLoading(false);
  }, [user, projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { documents, trashedDocuments, isLoading, refresh };
}
