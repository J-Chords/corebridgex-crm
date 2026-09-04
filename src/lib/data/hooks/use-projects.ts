"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { projectsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import type { ProjectGroup } from "@/lib/data/types";

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await projectsProvider.listProjects(user);
    setProjects(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { projects, isLoading, refresh };
}

export function useProject(id: string) {
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await projectsProvider.getProject(user, id);
    setProject(result);
    setNotFound(!result);
    setIsLoading(false);
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { project, isLoading, notFound, refresh };
}

/** Project Level Stage C — the optional Project Group catalog (visible to any authenticated user;
 * Admin-only to create, enforced by the provider/RLS, not this hook). */
export function useProjectGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await projectsProvider.listProjectGroups();
    setGroups(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { groups, isLoading, refresh };
}
