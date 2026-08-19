"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Button } from "@/components/ui/button";
import { TaskSummaryItem } from "@/components/tasks/task-summary-item";
import { addDays, formatDateOnly, formatShortDayLabel, parseDateOnly, todayDateOnly, weekDates } from "@/lib/planner-dates";
import { cn } from "@/lib/utils";

const CHIPS_PER_DAY = 4;

interface PlannerWeekViewProps {
  anchorDate: string;
  onAnchorDateChange: (date: string) => void;
  onOpenDay: (date: string) => void;
  tasks: TaskWithRelations[];
  onOpen: (taskId: string) => void;
  runningTaskId: string | null;
}

export function PlannerWeekView({ anchorDate, onAnchorDateChange, onOpenDay, tasks, onOpen, runningTaskId }: PlannerWeekViewProps) {
  const anchor = parseDateOnly(anchorDate);
  const days = weekDates(anchor);
  const today = todayDateOnly();

  const byDate = new Map<string, TaskWithRelations[]>();
  for (const day of days) byDate.set(formatDateOnly(day), []);
  for (const task of tasks) {
    if (task.dueDate && byDate.has(task.dueDate)) byDate.get(task.dueDate)!.push(task);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => onAnchorDateChange(formatDateOnly(addDays(anchor, -7)))} aria-label="Previous week">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAnchorDateChange(today)}>
            This week
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => onAnchorDateChange(formatDateOnly(addDays(anchor, 7)))} aria-label="Next week">
            <ChevronRight />
          </Button>
        </div>
        <span className="text-sm font-medium">
          {formatShortDayLabel(days[0])} – {formatShortDayLabel(days[6])}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
        {days.map((day) => {
          const dateStr = formatDateOnly(day);
          const dayTasks = byDate.get(dateStr) ?? [];
          const isToday = dateStr === today;
          return (
            <div key={dateStr} className={cn("flex flex-col gap-2 rounded-lg border p-2", isToday && "border-primary/50 bg-primary/5")}>
              <button
                type="button"
                onClick={() => onOpenDay(dateStr)}
                className="flex items-center justify-between text-left text-xs font-medium hover:underline"
              >
                <span>{formatShortDayLabel(day)}</span>
                <span className="font-mono text-muted-foreground">{dayTasks.length}</span>
              </button>
              <div className="flex flex-col gap-1">
                {dayTasks.slice(0, CHIPS_PER_DAY).map((task) => (
                  <TaskSummaryItem key={task.id} task={task} onOpen={onOpen} isRunning={task.id === runningTaskId} variant="chip" />
                ))}
                {dayTasks.length > CHIPS_PER_DAY && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(dateStr)}
                    className="text-left text-xs text-muted-foreground hover:underline"
                  >
                    +{dayTasks.length - CHIPS_PER_DAY} more
                  </button>
                )}
                {dayTasks.length === 0 && <p className="px-1 text-xs text-muted-foreground">No Tasks.</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
