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

  // Phase 3 (CD-208) — found during QA: navigating from one Project straight to another (SPA
  // navigation, no full reload) previously left the PREVIOUS Project's data in `project` state for
  // the brief window between the route's `id` changing and this hook's own fetch resolving, because
  // only `isLoading`/`notFound` reset synchronously — `project` itself didn't clear until the new
  // `getProject` call finished. Any UI keyed off `project` (e.g. a role/ownership-gated button) could
  // briefly render using the OLD Project's data even though the URL/breadcrumb already reflected the
  // NEW one. The actual mutation RPCs/mock methods (`apply_project_templates`, `update_project_record`,
  // etc.) independently re-validate ownership server-side regardless of this, so this was never an
  // actual authorization bypass — but a stale-keyed value is never safe to render from, so `project`
  // now resets to `null` immediately whenever `id` changes, same synchronous instant as `isLoading`
  // flips to `true` — no cross-Project flash is possible even in principle.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProject(null);
    setNotFound(false);
  }, [id]);

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
