"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTask } from "@/lib/data/hooks/use-tasks";
import { tasksProvider } from "@/lib/data/providers";
import { canEditTask, canManageTasks, canProgressTask } from "@/lib/data/permissions";
import { formatExpectedTime } from "@/lib/data/expected-time";
import type { TaskStatus } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskStatusBadge, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskTimeTracking } from "@/components/tasks/task-time-tracking";
import { TaskHandoffSection } from "@/components/tasks/task-handoff-section";
import { useTaskHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { NotesSection } from "@/components/notes/notes-section";
import { useTaskNotes } from "@/lib/data/hooks/use-notes";
import { notesProvider } from "@/lib/data/providers";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { task, isLoading, notFound, refresh } = useTask(id);
  const { handoffs, refresh: refreshHandoffs } = useTaskHandoffs(id);
  const { notes, refresh: refreshNotes } = useTaskNotes(id);
  const [editOpen, setEditOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);

  if (!user) return null;

  // Employees can't see the /dashboard/tasks list (supervisor/superadmin only) — send them
  // back to their own task hub instead of a link that just dead-ends on another restricted page.
  const backHref = canManageTasks(user) ? "/dashboard/tasks" : "/dashboard/my-day";
  const backLabel = canManageTasks(user) ? "Back to tasks" : "Back to My Day";

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !task) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          {backLabel}
        </Link>
        <p className="text-sm text-muted-foreground">
          This task doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const assigneeIds = task.assignees.map((a) => a.id);
  const canEdit = canEditTask(user, task);
  const canProgress = canProgressTask(user, { assigneeIds });

  async function handleStatusChange(status: string | null) {
    if (!status) return;
    setStatusPending(true);
    try {
      await tasksProvider.updateTaskStatus(user!, id, status as TaskStatus);
      refresh();
    } finally {
      setStatusPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={backHref} className="w-fit text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-semibold">{task.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <TaskPriorityBadge priority={task.priority} />
              <Link href={`/dashboard/companies/${task.company.id}`} className="text-sm text-muted-foreground hover:underline">
                {task.company.name}
              </Link>
              <span className="text-sm text-muted-foreground/60">·</span>
              <Link href={`/dashboard/workstreams/${task.workstream.id}`} className="text-sm text-muted-foreground hover:underline">
                {task.workstream.name}
              </Link>
            </div>
          </div>
          {canEdit && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit task
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {task.description || "No description provided."}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Status</span>
                <div className="mt-1.5">
                  {canProgress ? (
                    <Select
                      items={TASK_STATUS_SELECT_ITEMS}
                      value={task.status}
                      onValueChange={handleStatusChange}
                      disabled={statusPending}
                    >
                      <SelectTrigger aria-label="Change status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To do</SelectItem>
                        <SelectItem value="in-progress">In progress</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                        <SelectItem value="waiting-on-client">Waiting on client</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <TaskStatusBadge status={task.status} />
                  )}
                </div>
              </div>
              <div>
                <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Due date</span>
                <p className="mt-1.5 text-sm">{formatDate(task.dueDate)}</p>
              </div>
              <div>
                <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Activity</span>
                <p className="mt-1.5 text-sm">
                  {task.activity ? (
                    `${task.activity.departmentName}: ${task.activity.name}`
                  ) : (
                    <span className="text-muted-foreground">Not tagged</span>
                  )}
                </p>
              </div>
              <div>
                <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Expected time</span>
                <p className="mt-1.5 text-sm">
                  {task.expectedMinutes != null ? (
                    formatExpectedTime(task.expectedMinutes)
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </p>
              </div>
            </div>

            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Checklist</span>
              <div className="mt-2">
                <TaskChecklist
                  taskId={task.id}
                  items={task.checklistItems}
                  assigneeIds={assigneeIds}
                  onChanged={refresh}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignees</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {task.assignees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one assigned.</p>
            ) : (
              task.assignees.map((assignee) => (
                <div key={assignee.id} className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initials(assignee.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{assignee.fullName}</span>
                    <span className="text-xs text-muted-foreground capitalize">{assignee.role}</span>
                  </div>
                </div>
              ))
            )}

            <div className="mt-2 flex flex-col gap-1.5 border-t pt-3 text-xs text-muted-foreground">
              <span>
                Created by <span className="font-medium text-foreground">{task.createdBy.fullName}</span>
                {task.selfAdded && " (self-added)"}
              </span>
              <span>{formatDateTime(task.createdAt)}</span>
              {task.statusChangedBy && (
                <>
                  <span className="mt-2">
                    Status last changed by{" "}
                    <span className="font-medium text-foreground">{task.statusChangedBy.fullName}</span>
                  </span>
                  <span>{formatDateTime(task.statusChangedAt)}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskTimeTracking
            taskId={task.id}
            companyId={task.companyId}
            assigneeIds={assigneeIds}
            expectedMinutes={task.expectedMinutes}
            onTaskChanged={refresh}
          />
        </CardContent>
      </Card>

      <TaskHandoffSection taskId={task.id} handoffs={handoffs} onChanged={refreshHandoffs} />

      <NotesSection
        title="Notes"
        description="Comments on this task — internal only."
        notes={notes}
        emptyMessage="No notes on this task yet."
        onAddNote={async (input) => {
          await notesProvider.createTaskNote(user, task.id, input);
          refreshNotes();
        }}
      />

      {canEdit && (
        <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" task={task} onSaved={refresh} />
      )}
    </div>
  );
}
