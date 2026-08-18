"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { tasksProvider } from "@/lib/data/providers";
import { canProgressTask } from "@/lib/data/permissions";
import { formatExpectedTime } from "@/lib/data/expected-time";
import type { TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
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
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskTimeTracking } from "@/components/tasks/task-time-tracking";
import { TaskHandoffSection } from "@/components/tasks/task-handoff-section";
import { useTaskHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { NotesSection } from "@/components/notes/notes-section";
import { useTaskNotes } from "@/lib/data/hooks/use-notes";
import { notesProvider } from "@/lib/data/providers";
import { getInitials as initials } from "@/lib/initials";

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

interface TaskDetailContentProps {
  task: TaskWithRelations;
  onChanged: () => void;
  /** Forwarded straight to TaskTimeTracking's own onTimerChanged — see that prop's doc comment.
   * Optional: the full `/dashboard/tasks/[id]` route has no separate "Running" derived view to
   * invalidate, so it simply omits this; TaskDrawer (Task Center) passes its own. */
  onTimerChanged?: () => void;
}

/**
 * The real Task detail body — Details/Status/Checklist, Assignees, Time Tracking, Handoffs, Notes —
 * shared verbatim between the full `/dashboard/tasks/[id]` route and the Task Center's drawer
 * (Phase 8C), so the two never diverge. Each embedded section (TaskChecklist/TaskTimeTracking/
 * TaskHandoffSection/NotesSection) already owns its own data fetching and Card chrome; this
 * component only supplies the Details/Assignees layout around them. No fake tabs — every section
 * here is backed by a real, already-shipped provider capability.
 */
export function TaskDetailContent({ task, onChanged, onTimerChanged }: TaskDetailContentProps) {
  const { user } = useAuth();
  const { handoffs, refresh: refreshHandoffs } = useTaskHandoffs(task.id);
  const { notes, refresh: refreshNotes } = useTaskNotes(task.id);
  const [statusPending, setStatusPending] = useState(false);

  if (!user) return null;

  const assigneeIds = task.assignees.map((a) => a.id);
  const canProgress = canProgressTask(user, { assigneeIds });

  async function handleStatusChange(status: string | null) {
    if (!status || !user) return;
    setStatusPending(true);
    try {
      await tasksProvider.updateTaskStatus(user, task.id, status as TaskStatus);
      onChanged();
    } finally {
      setStatusPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
                  onChanged={onChanged}
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
            onTaskChanged={onChanged}
            onTimerChanged={onTimerChanged}
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
    </div>
  );
}
