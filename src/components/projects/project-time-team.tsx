"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { timeEntriesProvider } from "@/lib/data/providers";
import type { TimeEntryWithUserAndTask } from "@/lib/data/providers/time-entries-provider";
import { isEmployee, isSuperadmin, isSupervisor } from "@/lib/data/permissions";
import { formatMinutes } from "@/lib/format-minutes";
import { todayDateOnly, dateKeyFromTimestamp, formatDateOnly, addDays, startOfMonth } from "@/lib/planner-dates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { getInitials as initials } from "@/lib/initials";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type RangeKey = "this-month" | "last-30" | "custom";

interface ProjectTimeTeamProps {
  user: User;
  /** This Project's own already-fetched Tasks (top-level + Subtasks) — used both to derive which
   * Task ids to fetch TimeEntries for, and to attach Service/Activity context to each entry (the
   * TimeEntry read shape itself only carries a light Task context, no workstream/activity). */
  tasks: TaskWithRelations[];
}

/**
 * Phase 13D — Project effort/team context, never a productivity dashboard. Every TimeEntry this
 * component ever sees was already filtered server/mock-side by the exact same `canViewTimeForUser`
 * boundary every other Time surface uses (`listTimeEntriesForTasks`) — an Employee's own result set
 * IS their own time, a Supervisor's IS their own + direct reports', a Superadmin's IS everyone's —
 * so the label on the total is chosen from the viewer's role, never computed by trying to detect
 * "did we get everything" after the fact.
 */
export function ProjectTimeTeam({ user, tasks }: ProjectTimeTeamProps) {
  const [range, setRange] = useState<RangeKey>("this-month");
  const [customStart, setCustomStart] = useState(formatDateOnly(startOfMonth(new Date())));
  const [customEnd, setCustomEnd] = useState(todayDateOnly());
  const [entries, setEntries] = useState<TimeEntryWithUserAndTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const result = await timeEntriesProvider.listTimeEntriesForTasks(user, tasks.map((t) => t.id));
    setEntries(result);
    setIsLoading(false);
  }, [user, tasks]);

  useEffect(() => {
    // Standard fetch-on-mount/tasks-change — same pattern every other provider-backed hook here uses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const today = todayDateOnly();
  // "Last 30 Days" = exactly 30 local calendar dates INCLUDING today: today + the previous 29 days,
  // never today + 30 (that would be 31 dates).
  const last30Start = formatDateOnly(addDays(new Date(), -29));
  const thisMonthStart = formatDateOnly(startOfMonth(new Date()));
  const [rangeStart, rangeEnd] =
    range === "this-month" ? [thisMonthStart, today] : range === "last-30" ? [last30Start, today] : [customStart, customEnd];
  const customRangeInvalid = range === "custom" && customStart > customEnd;

  const inRange = useMemo(
    () =>
      customRangeInvalid
        ? []
        : entries.filter((e) => {
            if (e.durationMinutes == null) return false;
            // Local calendar date the entry falls on — never `startTime.slice(0, 10)`, which reads
            // the UTC date embedded in the timestamp and can misclassify an entry logged near
            // midnight in a non-UTC timezone. This is a local staff calendar view.
            const localDate = dateKeyFromTimestamp(e.startTime);
            return localDate >= rangeStart && localDate <= rangeEnd;
          }),
    [entries, rangeStart, rangeEnd, customRangeInvalid]
  );

  const totalMinutes = inRange.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const totalLabel = isSuperadmin(user) ? "Total Project Time" : isSupervisor(user) ? "Visible Team Time" : "Your Time";

  const byService = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of inRange) {
      const task = taskMap.get(e.taskId);
      const label = task?.workstream.name ?? "Unknown service";
      totals.set(label, (totals.get(label) ?? 0) + (e.durationMinutes ?? 0));
    }
    return Array.from(totals, ([label, minutes]) => ({ label, minutes })).sort((a, b) => b.minutes - a.minutes);
  }, [inRange, taskMap]);

  const byActivity = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of inRange) {
      const task = taskMap.get(e.taskId);
      const label = task?.activity?.name ?? "No activity";
      totals.set(label, (totals.get(label) ?? 0) + (e.durationMinutes ?? 0));
    }
    return Array.from(totals, ([label, minutes]) => ({ label, minutes })).sort((a, b) => b.minutes - a.minutes);
  }, [inRange, taskMap]);

  // Team snapshot — operational context only (open/completed-in-range counts per visible assignee),
  // never a ranking. Derived from Task assignee visibility (already correctly scoped by the
  // Project's own Task fetch), a separate axis from TimeEntry visibility above. Employee never sees
  // this at all — no coworker surveillance.
  const teamSnapshot = useMemo(() => {
    if (isEmployee(user)) return [];
    const byUser = new Map<string, { name: string; open: number; completed: number }>();
    for (const task of tasks) {
      if (task.parentTaskId) continue;
      for (const assignee of task.assignees) {
        const row = byUser.get(assignee.id) ?? { name: assignee.fullName, open: 0, completed: 0 };
        if (task.status === "done") {
          // Only a genuine `statusChangedAt` counts as a trustworthy completion date — a legacy
          // Task without one is never silently counted into a specific period via `updatedAt`.
          if (task.statusChangedAt) {
            const completedLocalDate = dateKeyFromTimestamp(task.statusChangedAt);
            if (completedLocalDate >= rangeStart && completedLocalDate <= rangeEnd) row.completed += 1;
          }
        } else {
          row.open += 1;
        }
        byUser.set(assignee.id, row);
      }
    }
    return Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, user, rangeStart, rangeEnd]);

  const maxMinutes = Math.max(1, ...byService.map((s) => s.minutes));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select items={{ "this-month": "This Month", "last-30": "Last 30 Days", custom: "Custom" }} value={range} onValueChange={(v) => setRange((v ?? "this-month") as RangeKey)}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-30">Last 30 Days</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-36" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-36" />
          </div>
        )}
      </div>

      {customRangeInvalid && (
        <Alert variant="destructive">
          <AlertTitle>Start date must be on or before end date.</AlertTitle>
        </Alert>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading time…</p>
      ) : (
        <>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{totalLabel}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatMinutes(totalMinutes)}</CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card size="sm">
              <CardHeader><CardTitle className="text-sm">By Service</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {byService.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No time logged in this period.</p>
                ) : (
                  byService.map((row) => (
                    <div key={row.label} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{row.label}</span>
                        <span className="shrink-0 text-muted-foreground">{formatMinutes(row.minutes)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(row.minutes / maxMinutes) * 100}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader><CardTitle className="text-sm">By Activity</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {byActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No time logged in this period.</p>
                ) : (
                  byActivity.map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="truncate">{row.label}</span>
                      <span className="shrink-0 text-muted-foreground">{formatMinutes(row.minutes)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {teamSnapshot.length > 0 && (
            <Card size="sm">
              <CardHeader><CardTitle className="text-sm">Team snapshot</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {teamSnapshot.map((row) => (
                  <div key={row.name} className="flex items-center gap-2.5 text-sm">
                    <Avatar size="sm"><AvatarFallback className="text-[0.65rem]">{initials(row.name)}</AvatarFallback></Avatar>
                    <span className="flex-1 truncate">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{row.open} open</span>
                    <span className="text-xs text-muted-foreground">{row.completed} completed this period</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
