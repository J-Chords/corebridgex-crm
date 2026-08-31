"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Button } from "@/components/ui/button";
import { TaskSummaryItem, TaskSummaryEmptyState } from "@/components/tasks/task-summary-item";
import { addDays, formatDateOnly, formatDayLabel, parseDateOnly, todayDateOnly } from "@/lib/planner-dates";

interface PlannerDayViewProps {
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  tasks: TaskWithRelations[];
  onOpen: (taskId: string) => void;
  runningTaskId: string | null;
  showAssignee: boolean;
  /** Task Action correction — both passed together or neither. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

export function PlannerDayView({ selectedDate, onSelectedDateChange, tasks, onOpen, runningTaskId, showAssignee, onEdit, onDeleted }: PlannerDayViewProps) {
  const date = parseDateOnly(selectedDate);
  const dayTasks = tasks.filter((t) => t.dueDate === selectedDate);

  function shift(amount: number) {
    onSelectedDateChange(formatDateOnly(addDays(date, amount)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSelectedDateChange(todayDateOnly())}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Next day">
            <ChevronRight />
          </Button>
        </div>
        <span className="text-sm font-medium">{formatDayLabel(date)}</span>
      </div>

      <div className="flex flex-col gap-2">
        {dayTasks.length === 0 ? (
          <TaskSummaryEmptyState message="No Tasks due today." />
        ) : (
          dayTasks.map((task) => (
            <TaskSummaryItem
              key={task.id}
              task={task}
              onOpen={onOpen}
              isRunning={task.id === runningTaskId}
              showAssignee={showAssignee}
              onEdit={onEdit}
              onDeleted={onDeleted}
            />
          ))
        )}
      </div>
    </div>
  );
}
