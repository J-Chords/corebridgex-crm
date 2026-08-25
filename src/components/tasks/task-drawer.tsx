"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTask, useSubtasks } from "@/lib/data/hooks/use-tasks";
import { useTaskTimer } from "@/lib/data/hooks/use-task-timer";
import { canEditTask } from "@/lib/data/permissions";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { User } from "@/lib/data/types";
import { Badge } from "@/components/ui/badge";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskTimerControl } from "@/components/tasks/task-timer-control";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { getInitials as initials } from "@/lib/initials";

function formatDueDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface TaskDrawerProps {
  /** The Task to preview, or null when Quick View should be closed. */
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Fires after any mutation inside Quick View (status/edit) — the caller should refresh its own
   * list/board so counts and rows stay in sync without a full reload. */
  onChanged: () => void;
  onTimerChanged?: () => void;
}

/**
 * Phase 11B — Quick View. Deliberately lightweight: this is the Dashboard/Home overview preview
 * ONLY — the locked navigation rule sends every dedicated work surface (Tasks List/Grid/Board, My
 * Day, Planner) straight to the full `/dashboard/tasks/[id]` page instead of opening this. It
 * intentionally does NOT reproduce the full page's rich sections: no full Checklist editor, no
 * Notes/Handoff history, no full Time Entry history, no giant Assignees/Details cards, and no
 * per-Subtask row list — just enough to decide "do I need to open this," plus "Open full task" and
 * "Edit" (shown only when the viewer is actually authorized to edit — never merely because
 * hierarchy-read visibility let them see it).
 *
 * Subtask navigation: Phase 10's TaskDrawer self-recursion bug (an unconditionally-nested
 * `<TaskDrawer>`, fixed during that phase's manual acceptance) cannot recur here — this component
 * never renders another instance of itself. A Subtask's own parent context, and the fact that a
 * parent's own Subtasks aren't individually listed here (only their count/progress), are both
 * handled with plain `Link` navigation to that Task's own full page, never a stacked Drawer.
 */
export function TaskDrawer({ taskId, onOpenChange, onChanged, onTimerChanged }: TaskDrawerProps) {
  const { user } = useAuth();
  const { task, isLoading, notFound } = useTask(taskId ?? "");

  return (
    <Sheet open={taskId != null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
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
          <LoadedTaskQuickView task={task} user={user} onChanged={onChanged} onTimerChanged={onTimerChanged} />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Bug fix — same empty-UUID crash as the full page (`invalid input syntax for type uuid: ""`, via
 * `listTimeEntriesForTask`): calling `useTaskTimer(task?.id ?? "", ...)` directly inside `TaskDrawer`
 * queried `task_id=""` on every mount while the real Task was still loading, since
 * `useTaskTimeEntries` (unlike `useTask`/`getTask`, which has its own established `if (!id) return
 * null` guard) has no such guard. This child component only ever mounts once `task` is a real,
 * loaded object, so `useTaskTimer`/`useSubtasks`/`useState` are always called consistently (Rules of
 * Hooks) and no empty-id query can ever fire.
 */
function LoadedTaskQuickView({
  task,
  user,
  onChanged,
  onTimerChanged,
}: {
  task: TaskWithRelations;
  user: User;
  onChanged: () => void;
  onTimerChanged?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const timer = useTaskTimer(task.id, task.assignees.map((a) => a.id));
  // Only a top-level Task has Subtasks to summarize — useSubtasks(null) is a safe no-op for a Subtask itself.
  const { subtasks } = useSubtasks(task.parentTaskId ? null : task.id);

  const canEdit = canEditTask(user, task);
  const checklistTotal = task.checklistItems.length;
  const checklistDone = task.checklistItems.filter((ci) => ci.isDone).length;
  const subtaskDone = subtasks.filter((s) => s.status === "done").length;
  const isSelfOnlyAssignee = task.assignees.length === 1 && task.assignees[0].id === user.id;

  return (
    <>
      <SheetHeader className="gap-2 border-b bg-card px-6 py-5">
        <SheetDescription className="sr-only">Quick view for &quot;{task.title}&quot;.</SheetDescription>
        {task.parentTaskId && task.parentTask && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Badge variant="neutral" className="text-[10px]">
              SUBTASK
            </Badge>
            <span>
              Subtask of{" "}
              <Link
                href={`/dashboard/tasks/${task.parentTask.id}`}
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
              >
                {task.parentTask.title}
              </Link>
            </span>
          </div>
        )}
        <SheetTitle className="font-heading text-lg font-semibold text-foreground">{task.title}</SheetTitle>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{task.company.name}</span>
          {task.workstream.projectId && (
            <>
              <span className="text-muted-foreground/60">→</span>
              <span>{task.workstream.projectName ?? "Project"}</span>
            </>
          )}
          <span className="text-muted-foreground/60">→</span>
          <span>{task.workstream.name}</span>
          {task.activity && (
            <>
              <span className="text-muted-foreground/60">→</span>
              <span>{task.activity.name}</span>
            </>
          )}
        </div>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
          {task.dueDate && <span className="text-xs text-muted-foreground">Due {formatDueDate(task.dueDate)}</span>}
        </div>

        {!isSelfOnlyAssignee &&
          (task.assignees.length === 0 ? (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="flex -space-x-2">
                {task.assignees.map((assignee) => (
                  <Avatar key={assignee.id} size="sm" className="ring-2 ring-card">
                    <AvatarFallback className="text-[0.65rem]">{initials(assignee.fullName)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {task.assignees.length === 1 ? task.assignees[0].fullName : `${task.assignees.length} assignees`}
            </div>
          ))}

        {task.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
        )}

        {(checklistTotal > 0 || (!task.parentTaskId && subtasks.length > 0)) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {checklistTotal > 0 && (
              <span>
                Checklist {checklistDone}/{checklistTotal}
              </span>
            )}
            {!task.parentTaskId && subtasks.length > 0 && (
              <span>
                Subtasks {subtaskDone}/{subtasks.length}
              </span>
            )}
          </div>
        )}

        <TaskTimerControl timer={timer} onTaskChanged={onChanged} onTimerChanged={onTimerChanged} variant="compact" />
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t bg-card">
        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
        )}
        <Button nativeButton={false} render={<Link href={`/dashboard/tasks/${task.id}`} />}>
          <ArrowUpRight /> Open full task
        </Button>
      </SheetFooter>

      {canEdit && <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" task={task} onSaved={onChanged} />}
    </>
  );
}
