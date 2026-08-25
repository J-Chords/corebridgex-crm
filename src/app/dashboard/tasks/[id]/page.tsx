"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTask } from "@/lib/data/hooks/use-tasks";
import { useTaskTimer } from "@/lib/data/hooks/use-task-timer";
import { canEditTask } from "@/lib/data/permissions";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { User } from "@/lib/data/types";
import { Badge } from "@/components/ui/badge";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";
import { TaskTimerControl } from "@/components/tasks/task-timer-control";
import { Button } from "@/components/ui/button";

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
 * Bug fix — the empty-UUID crash (`invalid input syntax for type uuid: ""`, reproduced via
 * `listTimeEntriesForTask`) came from calling `useTaskTimer(task?.id ?? "", ...)` unconditionally
 * at the top of `TaskDetailPage`, before `task` was guaranteed to exist — `useTaskTimeEntries`
 * (unlike `getTask`, which has its own established `if (!id) return null` guard) has no such
 * guard, so it queried `task_id=""` on every mount while the real Task was still loading. Splitting
 * the timer-owning content into this child component, which only ever mounts once `task` is a real,
 * loaded object, guarantees `useTaskTimer`/`useTaskTimeEntries` never run with an empty id — while
 * still satisfying the Rules of Hooks (this component's own hooks are always called consistently,
 * since it's never rendered without a real `task`).
 */
function LoadedTaskDetailPage({ task, user, refresh }: { task: TaskWithRelations; user: User; refresh: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  // The ONE authoritative timer instance for this page, shared by the top-right header cluster and
  // the Time Activity history section below (via TaskDetailContent) — see use-task-timer.ts.
  const timer = useTaskTimer(task.id, task.assignees.map((a) => a.id));
  const canEdit = canEditTask(user, task);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/tasks" className="w-fit text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to tasks
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            {task.parentTaskId && task.parentTask && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Badge variant="neutral" className="text-[10px]">
                  SUBTASK
                </Badge>
                <span>
                  Subtask of{" "}
                  <Link href={`/dashboard/tasks/${task.parentTask.id}`} className="font-medium text-foreground underline underline-offset-2 hover:no-underline">
                    {task.parentTask.title}
                  </Link>
                </span>
              </div>
            )}
            <h1 className="font-heading text-2xl font-semibold">{task.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{task.company.name}</span>
              {task.workstream.projectId && (
                <>
                  <span className="text-sm text-muted-foreground/60">→</span>
                  <Link href={`/dashboard/projects/${task.workstream.projectId}`} className="text-sm text-muted-foreground hover:underline">
                    {task.workstream.projectName ?? "Project"}
                  </Link>
                </>
              )}
              <span className="text-sm text-muted-foreground/60">→</span>
              <Link href={`/dashboard/workstreams/${task.workstream.id}`} className="text-sm text-muted-foreground hover:underline">
                {task.workstream.name}
              </Link>
              {task.activity && (
                <>
                  <span className="text-sm text-muted-foreground/60">→</span>
                  <span className="text-sm text-muted-foreground">{task.activity.name}</span>
                </>
              )}
            </div>
          </div>
          {/* Edit is a page-level action, not part of Time Tracking — kept in the title row, clearly
           * separated from the timer cluster below. */}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit task
            </Button>
          )}
        </div>
        <div className="flex justify-end">
          <TaskTimerControl timer={timer} taskId={task.id} companyId={task.companyId} onTaskChanged={refresh} />
        </div>
      </div>

      <TaskDetailContent task={task} onChanged={refresh} timer={timer} />

      {canEdit && (
        <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" task={task} onSaved={refresh} />
      )}
    </div>
  );
}
