"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { workstreamsProvider } from "@/lib/data/providers";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";

export function useWorkstreams(filters?: { companyId?: string; projectId?: string }) {
  const { user } = useAuth();
  const [workstreams, setWorkstreams] = useState<WorkstreamWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await workstreamsProvider.listWorkstreams(user);
    setWorkstreams(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const filtered = workstreams.filter((e) => {
    if (filters?.companyId && e.companyId !== filters.companyId) return false;
    if (filters?.projectId && e.projectId !== filters.projectId) return false;
    return true;
  });

  return { workstreams: filtered, isLoading, refresh };
}

export function useWorkstream(id: string) {
  const { user } = useAuth();
  const [workstream, setWorkstream] = useState<WorkstreamWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await workstreamsProvider.getWorkstream(user, id);
    setWorkstream(result);
    setNotFound(!result);
    setIsLoading(false);
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { workstream, isLoading, notFound, refresh };
}
