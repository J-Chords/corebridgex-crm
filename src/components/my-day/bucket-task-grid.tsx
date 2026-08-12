"use client";

import { useState, type ReactNode } from "react";
import type { User, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { tasksProvider } from "@/lib/data/providers";
import { canProgressTask } from "@/lib/data/permissions";
import { TaskGridCard } from "@/components/tasks/task-grid-card";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";

interface BucketTaskGridProps {
  user: User;
  /** Already bucket-filtered tasks to show (My Day's `selectedStatus` slice). */
  tasks: TaskWithRelations[];
  /** Keys the grid so the stagger replays on every bucket switch, same technique `PageTransition` uses. */
  selectedStatus: TaskStatus;
  /** The one task (if any) to mark "Start here" — see `findFocusTask`. */
  focusTaskId?: string | null;
  /** Refetches the underlying task list — called once a task is marked done. */
  onChanged: () => void;
  /**
   * Shown instead of the grid once there's truly nothing left to render — computed by the caller
   * (which knows whether this is a genuinely empty bucket vs. filters hiding otherwise-existing tasks)
   * but rendered *here*, not branched on by the caller — see the component doc comment for why.
   */
  emptyMessage: ReactNode;
}

/**
 * The status-bucket task grid, shared by every role's My Day. Owns the "mark done" micro-interaction:
 * clicking a card's checkbox plays a brief check pop, then the card eases out via its own exit
 * animation — independent of the `key={selectedStatus}` remount used for the bucket-switch stagger, so
 * completing one task never replays the whole grid's entrance. A completing task is kept rendered from
 * a local snapshot for the duration of its exit animation even after the real data (and bucket count)
 * has already updated, so the two effects — visual exit, count changing — land at the same moment.
 *
 * **Empty-state branching lives here, not in the caller.** It used to be the caller's job ("if
 * bucketTasks.length === 0, render a message instead of <BucketTaskGrid>") — but that unmounts this
 * whole component, wiping its local `exiting` state, the instant the *last* task in a bucket is marked
 * done (the refetch resolves before the exit animation finishes, `bucketTasks` becomes empty, and the
 * parent swaps to the empty message mid-animation). Branching on `combined.length` instead — after the
 * still-exiting snapshot is folded in — means the grid stays mounted for the whole exit animation
 * regardless of whether it was the bucket's last remaining task.
 */
export function BucketTaskGrid({ user, tasks, selectedStatus, focusTaskId, onChanged, emptyMessage }: BucketTaskGridProps) {
  const [exiting, setExiting] = useState<Record<string, TaskWithRelations>>({});

  async function handleMarkDone(task: TaskWithRelations) {
    setExiting((prev) => ({ ...prev, [task.id]: task }));
    await tasksProvider.updateTaskStatus(user, task.id, "done");
    onChanged();
  }

  function handleExitEnd(taskId: string) {
    setExiting((prev) => {
      if (!(taskId in prev)) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }

  const visibleIds = new Set(tasks.map((t) => t.id));
  const stillExiting = Object.values(exiting).filter((t) => !visibleIds.has(t.id));
  const combined = [...tasks, ...stillExiting];

  if (combined.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div key={selectedStatus} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {combined.map((task, i) => {
        const isExiting = task.id in exiting;
        return (
          <TaskGridCard
            key={task.id}
            task={task}
            className={STAGGER_ITEM_CLASS}
            style={staggerDelay(i)}
            isFocusTask={task.id === focusTaskId}
            isExiting={isExiting}
            onExitEnd={() => handleExitEnd(task.id)}
            onMarkDone={
              !isExiting && canProgressTask(user, { assigneeIds: task.assignees.map((a) => a.id) })
                ? () => handleMarkDone(task)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
