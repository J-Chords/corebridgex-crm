"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { accomplishmentsReportProvider } from "@/lib/data/providers";
import type { AccomplishmentsReport } from "@/lib/data/types";

export function useAccomplishmentsReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<AccomplishmentsReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await accomplishmentsReportProvider.listReports(user);
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

export function useAccomplishmentsReport(id: string) {
  const { user } = useAuth();
  const [report, setReport] = useState<AccomplishmentsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await accomplishmentsReportProvider.getReport(user, id);
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

export function useTrashedAccomplishmentsReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<AccomplishmentsReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await accomplishmentsReportProvider.listTrashedReports(user);
    setReports(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { reports, isLoading, refresh };
}
