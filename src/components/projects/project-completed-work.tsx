"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { subtaskSummary } from "@/lib/data/task-display";
import { monthKeyFromTimestamp, parseDateOnly } from "@/lib/planner-dates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const ALL = "all";
const UNKNOWN_MONTH = "unknown";

/**
 * The one trustworthy completion timestamp in the data model — `statusChangedAt` only ever updates
 * on a genuine status transition (never on an unrelated field edit, confirmed against
 * `update_task_status`'s own guarded early-return for a same-status no-op), so for a Task currently
 * `status === "done"` it IS "when this most recently became done," not a stale value from an
 * earlier, different transition.
 *
 * `updatedAt` is deliberately NOT used as a silent fallback here (unlike the `TaskReuseCandidate`/
 * `client-report-weekly.ts` call sites, which only need a rough recency signal, never a labeled
 * date) — `updatedAt` bumps on ANY field edit, so presenting it as "Completed {date}" for a legacy
 * Task whose `statusChangedAt` predates that column would be an outright fabricated timestamp.
 * Returns `null` for that legacy case; callers must render an honest "unknown" state, never invent
 * a date.
 */
function completedAt(task: TaskWithRelations): string | null {
  return task.statusChangedAt;
}

/** Local-calendar month key (`YYYY-MM`) for a task with a trustworthy completion timestamp, or the
 * `UNKNOWN_MONTH` sentinel for a legacy task with none — never mixed into a real, dated month
 * bucket. */
function monthKeyOf(task: TaskWithRelations): string {
  const at = completedAt(task);
  return at ? monthKeyFromTimestamp(at) : UNKNOWN_MONTH;
}

function monthLabel(key: string): string {
  if (key === UNKNOWN_MONTH) return "Completion date unavailable";
  return parseDateOnly(`${key}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

interface ProjectCompletedWorkProps {
  /** Every Task this Project's workspace already fetched (top-level AND Subtasks, same flattened
   * shape every other Task surface uses) — this component derives its own completed/top-level slice,
   * never a second fetch. */
  tasks: TaskWithRelations[];
}

/**
 * Phase 13C — completed NORMAL Tasks for this Project, grouped by the real month they were
 * completed. Subtasks are excluded from this top-level list entirely (never double-counted as
 * their own row) — a parent with completed Subtasks shows a small "X/Y subtasks" caption instead,
 * reusing the same `subtaskSummary` every other Task surface already computes; no historical
 * Subtask record is deleted or hidden, it simply isn't its own top-level row here.
 */
export function ProjectCompletedWork({ tasks }: ProjectCompletedWorkProps) {
  const [serviceFilter, setServiceFilter] = useState(ALL);
  const [activityFilter, setActivityFilter] = useState(ALL);
  const [periodFilter, setPeriodFilter] = useState(ALL);

  const completedTopLevel = useMemo(
    () => tasks.filter((t) => t.status === "done" && !t.parentTaskId),
    [tasks]
  );

  const serviceOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of completedTopLevel) byId.set(t.workstream.id, t.workstream.name);
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [completedTopLevel]);

  const activityOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of completedTopLevel) if (t.activity) byId.set(t.activity.id, t.activity.name);
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [completedTopLevel]);

  const periodOptions = useMemo(() => {
    const keys = new Set(completedTopLevel.map(monthKeyOf));
    // Known months newest-first; the "unknown" bucket (if present) always sorts last — it has no
    // real date to compare, so it's never mixed into chronological order.
    return Array.from(keys).sort((a, b) => (a === UNKNOWN_MONTH ? 1 : b === UNKNOWN_MONTH ? -1 : b.localeCompare(a)));
  }, [completedTopLevel]);

  const filtered = completedTopLevel.filter(
    (t) =>
      (serviceFilter === ALL || t.workstream.id === serviceFilter) &&
      (activityFilter === ALL || t.activity?.id === activityFilter) &&
      (periodFilter === ALL || monthKeyOf(t) === periodFilter)
  );

  const groups = useMemo(() => {
    const byMonth = new Map<string, TaskWithRelations[]>();
    for (const t of filtered) {
      const key = monthKeyOf(t);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(t);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => (a === UNKNOWN_MONTH ? 1 : b === UNKNOWN_MONTH ? -1 : b.localeCompare(a)))
      .map(([key, group]) => ({
        key,
        label: monthLabel(key),
        // Real completion dates sort newest-first within their (real) month. Inside the "unknown"
        // bucket there is no trustworthy date to sort by at all — `updatedAt` is used ONLY as an
        // internal, never-displayed tiebreaker for a deterministic order, per the locked rule.
        tasks: group.sort((a, b) => {
          const atA = completedAt(a);
          const atB = completedAt(b);
          if (atA && atB) return atB.localeCompare(atA);
          return b.updatedAt.localeCompare(a.updatedAt);
        }),
      }));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      {(serviceOptions.length > 1 || activityOptions.length > 1 || periodOptions.length > 1) && (
        <div className="flex flex-wrap items-center gap-2">
          {serviceOptions.length > 1 && (
            <Select items={{ [ALL]: "All services", ...Object.fromEntries(serviceOptions.map((o) => [o.id, o.name])) }} value={serviceFilter} onValueChange={(v) => setServiceFilter(v ?? ALL)}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All services</SelectItem>
                {serviceOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {activityOptions.length > 1 && (
            <Select items={{ [ALL]: "All activities", ...Object.fromEntries(activityOptions.map((o) => [o.id, o.name])) }} value={activityFilter} onValueChange={(v) => setActivityFilter(v ?? ALL)}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All activities</SelectItem>
                {activityOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {periodOptions.length > 1 && (
            <Select items={{ [ALL]: "All time", ...Object.fromEntries(periodOptions.map((k) => [k, monthLabel(k)])) }} value={periodFilter} onValueChange={(v) => setPeriodFilter(v ?? ALL)}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All time</SelectItem>
                {periodOptions.map((k) => <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No completed work yet.</Card>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{group.label}</span>
            <div className="overflow-hidden rounded-lg border divide-y">
              {group.tasks.map((task) => {
                const subtasks = subtaskSummary(task.id, tasks);
                return (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <TaskStatusAvatar title={task.title} status={task.status} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 truncate font-medium">
                        {task.title}
                        {subtasks.total > 0 && (
                          <span className="flex shrink-0 items-center gap-0.5 text-xs font-normal text-muted-foreground" title="Subtasks">
                            <Layers className="size-3" aria-hidden="true" />
                            {subtasks.done}/{subtasks.total}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {task.workstream.name}
                        {task.activity && ` · ${task.activity.name}`}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {task.assignees.length === 1 ? task.assignees[0].fullName : task.assignees.length > 1 ? `${task.assignees.length} assignees` : "Unassigned"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(() => {
                        const at = completedAt(task);
                        return at ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                      })()}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
