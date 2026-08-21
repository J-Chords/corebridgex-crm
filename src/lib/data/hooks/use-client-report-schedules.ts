"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { clientReportSchedulesProvider } from "@/lib/data/providers";
import type { ReportableProjectRef } from "@/lib/data/providers/client-report-schedules-provider";
import type { ClientReportSchedule } from "@/lib/data/types";

/** Every schedule the viewer may manage — org-wide for a reporting reviewer/Superadmin, empty otherwise. */
export function useClientReportSchedules() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<ClientReportSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await clientReportSchedulesProvider.listSchedules(user);
    setSchedules(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { schedules, isLoading, refresh };
}

/**
 * The narrow, capability-gated Project directory for the Schedules UI's picker (Phase 9 final
 * integrity hotfix, Section J) — every non-internal Client Project organization-wide, regardless of
 * the viewer's own operational assignment. Deliberately NOT `useProjects()`, which is scoped to
 * ordinary operational access.
 */
export function useSchedulableProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ReportableProjectRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    clientReportSchedulesProvider.listSchedulableProjects(user).then((result) => {
      setProjects(result);
      setIsLoading(false);
    });
  }, [user]);

  return { projects, isLoading };
}
