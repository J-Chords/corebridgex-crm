"use client";

import Link from "next/link";
import { ArrowUpRight, Pencil } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTask } from "@/lib/data/hooks/use-tasks";
import { canEditTask } from "@/lib/data/permissions";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface TaskDrawerProps {
  /** The Task to show, or null when the drawer should be closed. Kept as a plain id (not the whole
   * task object) so the Task Center's own list/board never has to hold a second copy of task state
   * just to know what to open — this component fetches its own copy via the same `useTask` hook the
   * full page uses. */
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Fires after any mutation inside the drawer (status/checklist/edit/etc.) — the caller should
   * refresh its own list/board so counts and rows stay in sync without a full reload. */
  onChanged: () => void;
  /** Forwarded to TaskDetailContent's own onTimerChanged — see that prop's doc comment. The Task
   * Center passes its own `useRunningTimer().refresh` here so its `Running` quick filter/badges
   * pick up a Start/Pause/Resume/Stop that happened inside this drawer immediately, without relying
   * on the unrelated `onChanged` (task-list) refresh to somehow also refresh a completely separate
   * hook instance's state — it never would. */
  onTimerChanged?: () => void;
}

/**
 * Phase 8C's primary feature — a large side drawer so a Task can be opened, read, and acted on
 * without leaving the Task Center's own list/board (its search/filters/grouping/scroll position are
 * all just React state one level up, untouched by this overlay). Deliberately reuses
 * `TaskDetailContent` verbatim (the same body the full `/dashboard/tasks/[id]` route renders) — see
 * that component's own doc comment for why. "Edit" stacks a second Sheet on top, the same proven
 * pattern this codebase's dialogs already use elsewhere (e.g. TaskFormDialog's own inline "+ New
 * workstream" opens WorkstreamFormDialog on top of itself).
 */
export function TaskDrawer({ taskId, onOpenChange, onChanged, onTimerChanged }: TaskDrawerProps) {
  const { user } = useAuth();
  const { task, isLoading, notFound, refresh } = useTask(taskId ?? "");
  const [editOpen, setEditOpen] = useState(false);

  function handleChanged() {
    refresh();
    onChanged();
  }

  return (
    <Sheet open={taskId != null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        {isLoading || !user ? (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : notFound || !task ? (
          <div className="flex flex-col gap-2 p-6">
            <SheetTitle>Task not found</SheetTitle>
            <SheetDescription>This task doesn&apos;t exist, or you no longer have access to it.</SheetDescription>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b bg-card px-6 py-5">
              <SheetDescription className="sr-only">Task details for &quot;{task.title}&quot;.</SheetDescription>
              <div className="flex items-start justify-between gap-3 pr-8">
                <SheetTitle className="font-heading text-xl font-semibold text-foreground">{task.title}</SheetTitle>
                <TaskStatusBadge status={task.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <TaskPriorityBadge priority={task.priority} />
                {task.workstream.projectId && (
                  <>
                    <span>{task.workstream.projectName ?? "Project"}</span>
                    <span className="text-muted-foreground/60">→</span>
                  </>
                )}
                <span>{task.workstream.name}</span>
                {task.activity && (
                  <>
                    <span className="text-muted-foreground/60">→</span>
                    <span>{task.activity.name}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canEditTask(user, task) && (
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil /> Edit
                  </Button>
                )}
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/tasks/${task.id}`} />}>
                  <ArrowUpRight /> Open full page
                </Button>
              </div>
            </div>

            <div className="flex-1 px-6 py-5">
              <TaskDetailContent task={task} onChanged={handleChanged} onTimerChanged={onTimerChanged} />
            </div>

            {canEditTask(user, task) && (
              <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" task={task} onSaved={handleChanged} />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
