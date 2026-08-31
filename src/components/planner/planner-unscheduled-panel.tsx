"use client";

import { useState } from "react";
import { ChevronDown, Inbox } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskSummaryItem, TaskSummaryEmptyState } from "@/components/tasks/task-summary-item";
import { cn } from "@/lib/utils";

interface PlannerUnscheduledPanelProps {
  tasks: TaskWithRelations[];
  onOpen: (taskId: string) => void;
  runningTaskId: string | null;
  /** Task Action correction — both passed together or neither. */
  onEdit?: (task: TaskWithRelations) => void;
  onDeleted?: (taskId: string) => void;
}

/**
 * A Task with no due date is legitimate, real, operational work — never hidden. Rather than a
 * separate route, this is a calm, collapsed-by-default disclosure shared by Day/Week/Month (Group
 * view already shows every Task, unscheduled included, within its own groups, so it doesn't need
 * this panel repeated).
 */
export function PlannerUnscheduledPanel({ tasks, onOpen, runningTaskId, onEdit, onDeleted }: PlannerUnscheduledPanelProps) {
  const [open, setOpen] = useState(false);
  const unscheduled = tasks.filter((t) => t.dueDate == null);

  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <Inbox className="size-4 text-muted-foreground" aria-hidden="true" />
        Unscheduled
        <span className="font-mono text-xs text-muted-foreground">{unscheduled.length}</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t p-3">
          {unscheduled.length === 0 ? (
            <TaskSummaryEmptyState message="Nothing unscheduled — every visible Task has a due date." />
          ) : (
            unscheduled.map((task) => (
              <TaskSummaryItem
                key={task.id}
                task={task}
                onOpen={onOpen}
                isRunning={task.id === runningTaskId}
                showAssignee
                onEdit={onEdit}
                onDeleted={onDeleted}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
