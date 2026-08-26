"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTask, useSubtasks } from "@/lib/data/hooks/use-tasks";
import { useTaskTimer } from "@/lib/data/hooks/use-task-timer";
import { canEditTask, canProgressTask } from "@/lib/data/permissions";
import { tasksProvider } from "@/lib/data/providers";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskStatus, User } from "@/lib/data/types";
import { Badge } from "@/components/ui/badge";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";
import { TaskTimerControl } from "@/components/tasks/task-timer-control";
import { TaskPropertiesRail } from "@/components/tasks/task-properties-rail";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { task, isLoading, notFound, refresh } = useTask(id);

  if (!user) return null;

  // Phase 8C — /dashboard/tasks is open to every role now, so "Back to tasks" is always correct;
  // My Day never needed a separate fallback here once the Task Center gate was removed in 8B.
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !task) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/tasks" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to tasks
        </Link>
        <p className="text-sm text-muted-foreground">
          This task doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  return <LoadedTaskDetailPage task={task} user={user} refresh={refresh} />;
}

/**
 * Bug fix (Phase 11) — the empty-UUID crash (`invalid input syntax for type uuid: ""`, reproduced
 * via `listTimeEntriesForTask`) came from calling `useTaskTimer(task?.id ?? "", ...)` unconditionally
 * at the top of `TaskDetailPage`, before `task` was guaranteed to exist. Splitting the timer-owning
 * content into this child component, which only ever mounts once `task` is a real, loaded object,
 * guarantees `useTaskTimer`/`useTaskTimeEntries` never run with an empty id — while still satisfying
 * the Rules of Hooks (this component's own hooks are always called consistently, since it's never
 * rendered without a real `task`).
 *
 * Phase 12B — two-column workspace layout (Part 25): a main work-area column (`TaskDetailContent`)
 * and a right property rail (`TaskPropertiesRail` + the rail-variant `TaskTimerControl`). Status-
 * change state/logic (including the existing "mark parent Done with open Subtasks" confirmation)
 * lives here now, since the rail's compact status control and the confirmation dialog need to share
 * it — `canProgressTask`/`updateTaskStatus` themselves are completely unchanged.
 */
function LoadedTaskDetailPage({ task, user, refresh }: { task: TaskWithRelations; user: User; refresh: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false);
  // The ONE authoritative timer instance for this page, shared by the right rail's timer widget and
  // the Time Activity history section below (via TaskDetailContent) — see use-task-timer.ts.
  const timer = useTaskTimer(task.id, task.assignees.map((a) => a.id));
  const canEdit = canEditTask(user, task);
  const assigneeIds = task.assignees.map((a) => a.id);
  const canProgress = canProgressTask(user, { assigneeIds });

  // Only a top-level Task can have Subtasks — this warning is a no-op for a Subtask itself.
  const { subtasks } = useSubtasks(task.parentTaskId ? null : task.id);
  const openSubtaskCount = subtasks.filter((s) => s.status !== "done").length;

  async function applyStatusChange(status: TaskStatus) {
    setStatusPending(true);
    try {
      await tasksProvider.updateTaskStatus(user, task.id, status);
      refresh();
    } finally {
      setStatusPending(false);
    }
  }

  function handleStatusChange(status: string | null) {
    if (!status) return;
    // Section 22 — a warning, never a hard block: manually marking a parent Task Done while
    // Subtasks remain open still succeeds if the user confirms. This is the ONLY place completing
    // a Subtask could ever indirectly touch the parent's status, and only via this explicit,
    // user-initiated, confirmable action — never automatically.
    if (status === "done" && !task.parentTaskId && openSubtaskCount > 0) {
      setConfirmDoneOpen(true);
      return;
    }
    void applyStatusChange(status as TaskStatus);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/tasks" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to tasks
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {task.parentTaskId && task.parentTask && (
              <>
                <Badge variant="neutral" className="text-[10px]">
                  SUBTASK
                </Badge>
                <span>
                  Subtask of{" "}
                  <Link href={`/dashboard/tasks/${task.parentTask.id}`} className="font-medium text-foreground underline underline-offset-2 hover:no-underline">
                    {task.parentTask.title}
                  </Link>
                </span>
                <span className="text-muted-foreground/60">·</span>
              </>
            )}
            <span>{task.company.name}</span>
            {task.workstream.projectId && (
              <>
                <span className="text-muted-foreground/60">→</span>
                <Link href={`/dashboard/projects/${task.workstream.projectId}`} className="hover:underline">
                  {task.workstream.projectName ?? "Project"}
                </Link>
              </>
            )}
            <span className="text-muted-foreground/60">→</span>
            <Link href={`/dashboard/workstreams/${task.workstream.id}`} className="hover:underline">
              {task.workstream.name}
            </Link>
            {task.activity && (
              <>
                <span className="text-muted-foreground/60">→</span>
                <span>{task.activity.name}</span>
              </>
            )}
          </div>
          <h1 className="font-heading text-2xl font-semibold">{task.title}</h1>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          <TaskDetailContent task={task} onChanged={refresh} timer={timer} />
        </div>
        <div className="order-1 flex flex-col gap-5 lg:order-2 lg:border-l lg:pl-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Properties</span>
            <TaskPropertiesRail
              task={task}
              canProgress={canProgress}
              onStatusChange={handleStatusChange}
              statusPending={statusPending}
            />
          </div>
          <TaskTimerControl timer={timer} taskId={task.id} companyId={task.companyId} onTaskChanged={refresh} />
        </div>
      </div>

      {canEdit && (
        <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" task={task} onSaved={refresh} />
      )}

      <ConfirmDialog
        open={confirmDoneOpen}
        onOpenChange={setConfirmDoneOpen}
        title="Subtasks are still open"
        description={`${openSubtaskCount} Subtask${openSubtaskCount === 1 ? " is" : "s are"} still open. Mark this Task Done anyway?`}
        confirmLabel="Mark Done"
        onConfirm={() => applyStatusChange("done")}
      />
    </div>
  );
}
