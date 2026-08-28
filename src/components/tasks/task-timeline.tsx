"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";
import { addDays, formatDateOnly, formatMonthLabel, startOfMonth } from "@/lib/planner-dates";
import { cn } from "@/lib/utils";
import { getInitials as initials } from "@/lib/initials";

const DAY_WIDTH = 34;

type TaskBarState =
  | { kind: "duration"; startIndex: number; span: number }
  | { kind: "deadline"; index: number }
  | { kind: "start-marker"; index: number }
  | { kind: "no-schedule" }
  | { kind: "out-of-range" };

/**
 * Phase 13B structural correction — the Project Tasks tab's Timeline mode. Uses only real Task
 * scheduling fields (`startDate`/`dueDate`, both plain `YYYY-MM-DD` strings end to end — string
 * comparison, never `Date`/ISO-timestamp math, avoiding DST/timezone edge cases): a real duration
 * bar only when BOTH exist, a compact one-day deadline block for due-only (same visual language as
 * the duration bar — never implies an earlier start), a start marker for start-only, "No schedule"
 * only when genuinely neither exists, and nothing at all (never "No schedule") when a Task has
 * real dates that simply don't fall in the selected month.
 */
function computeTaskBarState(task: TaskWithRelations, days: Date[]): TaskBarState {
  const monthStartStr = formatDateOnly(days[0]);
  const monthEndStr = formatDateOnly(days[days.length - 1]);
  const hasStart = !!task.startDate;
  const hasDue = !!task.dueDate;

  if (!hasStart && !hasDue) return { kind: "no-schedule" };

  if (hasStart && hasDue && task.startDate! && task.dueDate!) {
    if (task.dueDate < monthStartStr || task.startDate > monthEndStr) return { kind: "out-of-range" };
    const clippedStartStr = task.startDate < monthStartStr ? monthStartStr : task.startDate;
    const clippedEndStr = task.dueDate > monthEndStr ? monthEndStr : task.dueDate;
    const startIndex = days.findIndex((d) => formatDateOnly(d) === clippedStartStr);
    const endIndex = days.findIndex((d) => formatDateOnly(d) === clippedEndStr);
    if (startIndex === -1 || endIndex === -1) return { kind: "out-of-range" };
    return { kind: "duration", startIndex, span: endIndex - startIndex + 1 };
  }

  if (hasDue) {
    const due = task.dueDate!;
    if (due < monthStartStr || due > monthEndStr) return { kind: "out-of-range" };
    const index = days.findIndex((d) => formatDateOnly(d) === due);
    return index === -1 ? { kind: "out-of-range" } : { kind: "deadline", index };
  }

  const start = task.startDate!;
  if (start < monthStartStr || start > monthEndStr) return { kind: "out-of-range" };
  const index = days.findIndex((d) => formatDateOnly(d) === start);
  return index === -1 ? { kind: "out-of-range" } : { kind: "start-marker", index };
}

function TaskAssigneeStack({ task }: { task: TaskWithRelations }) {
  if (task.assignees.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex -space-x-2">
      {task.assignees.slice(0, 3).map((a) => (
        <Avatar key={a.id} size="sm" className="ring-2 ring-card">
          <AvatarFallback className="text-[0.65rem]">{initials(a.fullName)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

export function TaskTimeline({ tasks }: { tasks: TaskWithRelations[] }) {
  const router = useRouter();
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => addDays(monthCursor, i));
  }, [monthCursor]);

  function stepMonth(delta: number) {
    setMonthCursor((prev) => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() + delta, 1)));
  }

  function openTask(id: string) {
    router.push(`/dashboard/tasks/${id}`);
  }

  if (tasks.length === 0) {
    return <p className="p-10 text-center text-sm text-muted-foreground">No tasks match this view.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-col sm:flex-row">
        {/* Left — compact Task identity columns, no Client/Company/Project column (Project is
            already known from context). */}
        <div className="min-w-0 flex-1 divide-y sm:border-r">
          <div className="grid h-11 grid-cols-[1fr_100px_72px] items-center gap-2 border-b px-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            <span>Task</span>
            <span>Priority</span>
            <span>Assignee</span>
          </div>
          {tasks.map((task) => (
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              onClick={() => openTask(task.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openTask(task.id);
                }
              }}
              className="grid h-10 cursor-pointer grid-cols-[1fr_100px_72px] items-center gap-2 px-3 text-sm transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <TaskStatusAvatar title={task.title} status={task.status} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{task.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {task.workstream.name}
                    {task.activity && ` · ${task.activity.name}`}
                  </span>
                </div>
              </div>
              <TaskPriorityBadge priority={task.priority} />
              <TaskAssigneeStack task={task} />
            </div>
          ))}
        </div>

        {/* Right — real, read-only Task Gantt: duration bars only when both dates exist, a
            deadline marker for due-only, a start marker for start-only, own month header attached
            to the timeline. */}
        <div className="flex shrink-0 flex-col sm:w-[420px]">
          <div className="flex h-11 items-center justify-between gap-1 border-b px-2">
            <Button size="icon-sm" variant="ghost" onClick={() => stepMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-xs font-medium">{formatMonthLabel(monthCursor)}</span>
            <Button size="icon-sm" variant="ghost" onClick={() => stepMonth(1)} aria-label="Next month">
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <div style={{ width: days.length * DAY_WIDTH }}>
              <div className="flex h-10 items-center border-b">
                {days.map((d) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={formatDateOnly(d)}
                      className={cn("flex h-full flex-col items-center justify-center border-r", weekend && "bg-muted/30")}
                      style={{ width: DAY_WIDTH }}
                    >
                      <span className="text-[9px] text-muted-foreground/70">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                      <span className="text-[10px] font-medium">{String(d.getDate()).padStart(2, "0")}</span>
                    </div>
                  );
                })}
              </div>
              {tasks.map((task) => {
                const bar = computeTaskBarState(task, days);
                const color = STATUS_COLOR_VAR[task.status];
                return (
                  <div key={task.id} className="relative flex h-10 border-t">
                    {days.map((d) => {
                      const weekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div
                          key={formatDateOnly(d)}
                          className={cn("h-full border-r border-border/50", weekend && "bg-muted/20")}
                          style={{ width: DAY_WIDTH }}
                        />
                      );
                    })}
                    {bar.kind === "duration" && (
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        className="absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md px-1.5 text-left text-[10px] font-medium whitespace-nowrap"
                        style={{
                          left: bar.startIndex * DAY_WIDTH + 2,
                          width: Math.max(bar.span * DAY_WIDTH - 4, DAY_WIDTH - 4),
                          backgroundColor: `color-mix(in oklch, ${color} 30%, var(--card))`,
                          borderColor: `color-mix(in oklch, ${color} 60%, transparent)`,
                          color: `color-mix(in oklch, ${color} 80%, var(--foreground))`,
                          borderWidth: 1,
                        }}
                        title={`${task.title} (${task.startDate} – ${task.dueDate})`}
                      >
                        {task.title}
                      </button>
                    )}
                    {bar.kind === "deadline" && (
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        aria-label={`${task.title} — due ${task.dueDate}`}
                        title={`${task.title} — due ${task.dueDate} (due date only, not a multi-day duration)`}
                        className="absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md px-1.5 text-left text-[10px] font-medium whitespace-nowrap"
                        style={{
                          left: bar.index * DAY_WIDTH + 2,
                          width: DAY_WIDTH - 4,
                          backgroundColor: `color-mix(in oklch, ${color} 30%, var(--card))`,
                          borderColor: `color-mix(in oklch, ${color} 60%, transparent)`,
                          color: `color-mix(in oklch, ${color} 80%, var(--foreground))`,
                          borderWidth: 1,
                        }}
                      >
                        {task.title}
                      </button>
                    )}
                    {bar.kind === "start-marker" && (
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        aria-label={`${task.title} — starts ${task.startDate}`}
                        title={`${task.title} — starts ${task.startDate}`}
                        className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full"
                        style={{ left: bar.index * DAY_WIDTH + 2, backgroundColor: color }}
                      />
                    )}
                    {bar.kind === "no-schedule" && (
                      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] whitespace-nowrap text-muted-foreground/60">
                        No schedule
                      </span>
                    )}
                    {/* "out-of-range": renders nothing — the Task IS scheduled, its dates simply
                        don't fall in the selected month. */}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
