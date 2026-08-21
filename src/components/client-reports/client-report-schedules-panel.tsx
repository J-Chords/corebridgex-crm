"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pause, Play, Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useClientReportSchedules, useSchedulableProjects } from "@/lib/data/hooks/use-client-report-schedules";
import { clientReportSchedulesProvider } from "@/lib/data/providers";
import type { ClientReportSchedule } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToastManager } from "@/components/ui/toast";
import { ScheduleFormDialog } from "./schedule-form-dialog";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface ClientReportSchedulesPanelProps {
  /**
   * Called after Run Now successfully generates a Draft — lets the parent page's own
   * `useClientReports()` (a separate hook instance the Review Queue tab reads from) refetch, so the
   * new Draft is visible immediately on switching tabs instead of only after a full page reload.
   * Manual acceptance hotfix: Run Now was already creating the correct DB row (status=draft,
   * schedule_id set, Project-scoped) — this component just never told the reports list to refresh.
   */
  onReportGenerated?: () => void;
}

/**
 * Reporting-reviewer/Superadmin-only Schedules tab (Section 40) — Project, weekly weekday/time/
 * timezone, Active/Paused, Next run, Last run, Run now/Edit/Pause-Resume/Delete. Deliberately
 * compact: no frequency picker (V1 is weekly-only), no ADP-style setup wizard.
 */
export function ClientReportSchedulesPanel({ onReportGenerated }: ClientReportSchedulesPanelProps) {
  const { user } = useAuth();
  const { schedules, isLoading, refresh } = useClientReportSchedules();
  // Narrow, capability-gated directory (Section J) — a reviewer managing a schedule for a Project
  // they have no operational access to must still see its real name here, not "Unknown Project".
  const { projects } = useSchedulableProjects();
  const toastManager = useToastManager();
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ClientReportSchedule | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.projectId, `${p.companyName} — ${p.projectName}`])), [projects]);

  function openCreate() {
    setEditingSchedule(undefined);
    setFormOpen(true);
  }

  function openEdit(schedule: ClientReportSchedule) {
    setEditingSchedule(schedule);
    setFormOpen(true);
  }

  async function handleTogglePause(schedule: ClientReportSchedule) {
    if (!user) return;
    setBusyId(schedule.id);
    try {
      await clientReportSchedulesProvider.updateSchedule(user, schedule.id, {
        projectId: schedule.projectId,
        weekday: schedule.weekday,
        localTime: schedule.localTime,
        timezone: schedule.timezone,
        active: !schedule.active,
      });
      await refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update this schedule." });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRunNow(schedule: ClientReportSchedule) {
    if (!user) return;
    setBusyId(schedule.id);
    try {
      await clientReportSchedulesProvider.runScheduleNow(user, schedule.id);
      // Two independent lists need refreshing: this panel's own schedules (Last run/Next run), and
      // the page-level Client Reports list the Review Queue tab reads from — a separate hook
      // instance that otherwise has no reason to know a new Draft now exists.
      await Promise.all([refresh(), onReportGenerated?.()]);
      toastManager.add({ description: "Draft generated — see it in the Review Queue." });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't run this schedule." });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(schedule: ClientReportSchedule) {
    if (!user) return;
    setBusyId(schedule.id);
    try {
      await clientReportSchedulesProvider.deleteSchedule(user, schedule.id);
      await refresh();
      toastManager.add({ description: "Schedule deleted — its past Drafts are kept." });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't delete this schedule." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Recurring Client Report Drafts — reviewed and finalized manually, never auto-finalized.
        </p>
        <Button onClick={openCreate}>
          <Plus /> New Schedule
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client / Project</TableHead>
                <TableHead>Weekly</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : schedules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    No recurring schedules yet.
                  </TableCell>
                </TableRow>
              ) : (
                schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{projectNameById.get(s.projectId) ?? "Unknown Project"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {WEEKDAY_LABELS[s.weekday]} {s.localTime} ({s.timezone})
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Paused"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.active ? formatDateTime(s.nextRunAt) : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.lastReportId ? (
                        <Link href={`/dashboard/reports/client/${s.lastReportId}`} className="hover:underline">
                          {formatDateTime(s.lastRunAt)}
                        </Link>
                      ) : (
                        formatDateTime(s.lastRunAt)
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-xs" aria-label="Run now" disabled={busyId === s.id} onClick={() => handleRunNow(s)}>
                          <RotateCw />
                        </Button>
                        <Button variant="ghost" size="icon-xs" aria-label="Edit" disabled={busyId === s.id} onClick={() => openEdit(s)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={s.active ? "Pause" : "Resume"}
                          disabled={busyId === s.id}
                          onClick={() => handleTogglePause(s)}
                        >
                          {s.active ? <Pause /> : <Play />}
                        </Button>
                        <Button variant="ghost" size="icon-xs" aria-label="Delete" disabled={busyId === s.id} onClick={() => handleDelete(s)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ScheduleFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={refresh} schedule={editingSchedule} />
    </div>
  );
}
