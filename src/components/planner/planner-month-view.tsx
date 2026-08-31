"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Button } from "@/components/ui/button";
import { TaskSummaryItem } from "@/components/tasks/task-summary-item";
import {
  formatDateOnly,
  formatMonthLabel,
  isSameMonth,
  monthGridDates,
  parseDateOnly,
  todayDateOnly,
  WEEKDAY_LABELS,
} from "@/lib/planner-dates";
import { cn } from "@/lib/utils";

const CHIPS_PER_DAY = 3;

interface PlannerMonthViewProps {
  anchorDate: string;
  onAnchorDateChange: (date: string) => void;
  onOpenDay: (date: string) => void;
  tasks: TaskWithRelations[];
  onOpen: (taskId: string) => void;
  runningTaskId: string | null;
  /** Task Action correction — both passed together or neither, forwarded to each chip's own
   * always-visible (never hover-only — no touch equivalent) `TaskActionsMenu`. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

export function PlannerMonthView({ anchorDate, onAnchorDateChange, onOpenDay, tasks, onOpen, runningTaskId, onEdit, onDeleted }: PlannerMonthViewProps) {
  const anchor = parseDateOnly(anchorDate);
  const gridDates = monthGridDates(anchor);
  const today = todayDateOnly();

  const byDate = new Map<string, TaskWithRelations[]>();
  for (const day of gridDates) byDate.set(formatDateOnly(day), []);
  for (const task of tasks) {
    if (task.dueDate && byDate.has(task.dueDate)) byDate.get(task.dueDate)!.push(task);
  }

  function shiftMonth(amount: number) {
    onAnchorDateChange(formatDateOnly(new Date(anchor.getFullYear(), anchor.getMonth() + amount, 1)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAnchorDateChange(today)}>
            This month
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
        <span className="text-sm font-medium">{formatMonthLabel(anchor)}</span>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-muted/40 px-2 py-1.5 text-center font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {label}
          </div>
        ))}
        {gridDates.map((day) => {
          const dateStr = formatDateOnly(day);
          const dayTasks = byDate.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, anchor);
          const isToday = dateStr === today;
          return (
            <div
              key={dateStr}
              className={cn(
                "flex min-h-24 flex-col gap-1 bg-card p-1.5",
                !inMonth && "bg-muted/20 text-muted-foreground/60"
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(dateStr)}
                className={cn(
                  "flex size-5 items-center justify-center self-start rounded-full font-medium hover:bg-muted",
                  isToday && "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {day.getDate()}
              </button>
              <div className="flex flex-col gap-1">
                {dayTasks.slice(0, CHIPS_PER_DAY).map((task) => (
                  <TaskSummaryItem
                    key={task.id}
                    task={task}
                    onOpen={onOpen}
                    isRunning={task.id === runningTaskId}
                    variant="chip"
                    onEdit={onEdit}
                    onDeleted={onDeleted}
                  />
                ))}
                {dayTasks.length > CHIPS_PER_DAY && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(dateStr)}
                    className="text-left text-[11px] text-muted-foreground hover:underline"
                  >
                    +{dayTasks.length - CHIPS_PER_DAY} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
