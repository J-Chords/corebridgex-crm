"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ListChecks, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTask, useSubtasks } from "@/lib/data/hooks/use-tasks";
import { useTaskTimer } from "@/lib/data/hooks/use-task-timer";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { canEditTask } from "@/lib/data/permissions";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { User } from "@/lib/data/types";
import { Badge } from "@/components/ui/badge";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskTimerControl } from "@/components/tasks/task-timer-control";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskActionsMenu } from "@/components/tasks/task-actions-menu";
import { TaskRowList } from "@/components/tasks/task-row";
import {
  DetailDrawer,
  DetailDrawerHeader,
  DetailDrawerIdentity,
  DetailDrawerBody,
  DetailDrawerSection,
  DetailDrawerPropertyGrid,
  DetailDrawerPropertyRow,
  DetailDrawerFooter,
} from "@/components/ui/detail-drawer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { formatDueDateShort } from "@/lib/data/task-display";
import { isLikelyInternalTask } from "@/lib/data/identity-color";

import { getInitials as initials } from "@/lib/initials";

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
 * Phase 11B — Quick View, redesigned in the Phase 13B final boss-feedback pass into a clean
 * operational inspector built on the shared `DetailDrawer` primitives (see
 * `src/components/ui/detail-drawer.tsx`). Deliberately lightweight: this is the Dashboard/Home
 * overview preview ONLY — the locked navigation rule sends every dedicated work surface (Tasks
 * List/Grid/Board, My Day, Planner) straight to the full `/dashboard/tasks/[id]` page instead of
 * opening this. It intentionally does NOT reproduce the full page's rich sections: no full
 * Checklist editor, no Notes/Handoff history, no full Time Entry history — just enough to decide
 * "do I need to open this," plus "Open full task" and "Edit" (shown only when the viewer is
 * actually authorized to edit — never merely because hierarchy-read visibility let them see it).
 *
 * Identity, once — Company name only (never the redundant "Company → Project-with-year" chain),
 * paired with Service · Activity as muted secondary context. Subtask navigation: a Subtask's own
 * parent context, and the fact that a parent's own historical Subtasks aren't individually listed
 * here (only their count), are both handled with plain `Link` navigation to that Task's own full
 * page, never a stacked Drawer.
 */
export function TaskDrawer({ taskId, onOpenChange, onChanged, onTimerChanged }: TaskDrawerProps) {
  const { user } = useAuth();
  const { task, isLoading, notFound } = useTask(taskId ?? "");

  return (
    <DetailDrawer open={taskId != null} onOpenChange={onOpenChange} srTitle={task ? task.title : "Task"}>
      {isLoading || !user ? (
        <div className="p-6">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : notFound || !task ? (
        <div className="flex flex-col gap-2 p-6">
          <p className="font-heading text-lg font-semibold text-foreground">Task not found</p>
          <p className="text-sm text-muted-foreground">This task doesn&apos;t exist, or you no longer have access to it.</p>
        </div>
      ) : (
        <LoadedTaskQuickView task={task} user={user} onChanged={onChanged} onTimerChanged={onTimerChanged} onOpenChange={onOpenChange} />
      )}
    </DetailDrawer>
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
  onOpenChange,
}: {
  task: TaskWithRelations;
  user: User;
  onChanged: () => void;
  onTimerChanged?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const timer = useTaskTimer(task.id, task.assignees.map((a) => a.id));
  // Only a top-level Task has (historical) Subtasks — useSubtasks(null) is a safe no-op for a Subtask itself.
  const { subtasks } = useSubtasks(task.parentTaskId ? null : task.id);
  // Phase 13 security hardening — see task-actions-menu.tsx's own comment on why `assignableStaff`
  // is the right "allUsers" convenience list for this UI-only gate.
  const { assignableStaff } = useCompanyLookups();

  const canEdit = canEditTask(user, { ...task, assigneeIds: task.assignees.map((a) => a.id) }, assignableStaff);
  const checklistTotal = task.checklistItems.length;
  const checklistDone = task.checklistItems.filter((ci) => ci.isDone).length;

  return (
    <>
      <DetailDrawerHeader>
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
        <DetailDrawerIdentity
          icon={<TaskStatusAvatar title={task.title} status={task.status} />}
          title={task.title}
          primaryContext={
            <>
              <CompanyProjectAvatar
                companyId={task.company.id}
                companyName={task.company.name}
                size="sm"
                isInternal={isLikelyInternalTask(task)}
              />
              {task.company.name}
            </>
          }
          secondaryContext={
            <>
              {task.workstream.name}
              {task.activity && ` · ${task.activity.name}`}
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
        </div>
      </DetailDrawerHeader>

      <DetailDrawerBody>
        <DetailDrawerSection label="Details">
          <DetailDrawerPropertyGrid>
            <DetailDrawerPropertyRow label="Start">
              {task.startDate ? formatDueDateShort(task.startDate) : "—"}
            </DetailDrawerPropertyRow>
            <DetailDrawerPropertyRow label="Due">
              <span className={task.dueDate && task.status !== "done" && task.dueDate < new Date().toISOString().slice(0, 10) ? "font-medium text-warning" : undefined}>
                {task.dueDate ? formatDueDateShort(task.dueDate) : "—"}
              </span>
            </DetailDrawerPropertyRow>
            <DetailDrawerPropertyRow label="Assignee">
              {task.assignees.length === 0 ? (
                "Unassigned"
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-2">
                    {task.assignees.map((assignee) => (
                      <Avatar key={assignee.id} size="sm" className="ring-2 ring-card">
                        <AvatarFallback className="text-[0.65rem]">{initials(assignee.fullName)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="truncate">
                    {task.assignees.length === 1 ? task.assignees[0].fullName : `${task.assignees.length} assignees`}
                  </span>
                </div>
              )}
            </DetailDrawerPropertyRow>
          </DetailDrawerPropertyGrid>
        </DetailDrawerSection>

        {task.description && (
          <DetailDrawerSection label="Description">
            <p className="line-clamp-3 text-sm whitespace-pre-wrap">{task.description}</p>
          </DetailDrawerSection>
        )}

        {checklistTotal > 0 && (
          <DetailDrawerSection label="Checklist">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ListChecks className="size-3.5" aria-hidden="true" />
              {checklistDone}/{checklistTotal} complete
            </span>
          </DetailDrawerSection>
        )}

        <DetailDrawerSection label="Time">
          <TaskTimerControl timer={timer} onTaskChanged={onChanged} onTimerChanged={onTimerChanged} variant="compact" />
        </DetailDrawerSection>

        {!task.parentTaskId && subtasks.length > 0 && (
          <DetailDrawerSection label="Subtasks">
            <TaskRowList tasks={subtasks} emptyMessage="" />
          </DetailDrawerSection>
        )}
      </DetailDrawerBody>

      <DetailDrawerFooter>
        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
        )}
        <Button nativeButton={false} render={<Link href={`/dashboard/tasks/${task.id}`} />}>
          <ArrowUpRight /> Open full task
        </Button>
        <TaskActionsMenu
          task={task}
          hideEditItem
          onEdit={() => setEditOpen(true)}
          onDeleted={() => {
            onOpenChange(false);
            onChanged();
          }}
          className="ml-auto"
        />
      </DetailDrawerFooter>

      {canEdit && <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" task={task} onSaved={onChanged} />}
    </>
  );
}
