"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { clientReportProvider } from "@/lib/data/providers";
import type { ClientReport } from "@/lib/data/types";

export function useClientReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await clientReportProvider.listReports(user);
    setReports(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { reports, isLoading, refresh };
}

export function useClientReport(id: string) {
  const { user } = useAuth();
  const [report, setReport] = useState<ClientReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await clientReportProvider.getReport(user, id);
    setReport(result);
    setNotFound(!result);
    setIsLoading(false);
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { report, isLoading, notFound, refresh };
}

export function useTrashedClientReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await clientReportProvider.listTrashedReports(user);
    setReports(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { reports, isLoading, refresh };
}
