"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { tasksProvider } from "@/lib/data/providers";
import { canProgressTask } from "@/lib/data/permissions";
import { formatMinutes } from "@/lib/format-minutes";
import { useSubtasks } from "@/lib/data/hooks/use-tasks";
import type { TaskTimerState } from "@/lib/data/hooks/use-task-timer";
import type { TaskStatus } from "@/lib/data/types";
import type { TaskTimeRollup, TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskStatusRail } from "@/components/tasks/task-status-rail";
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskTimeTracking } from "@/components/tasks/task-time-tracking";
import { TaskHandoffSection } from "@/components/tasks/task-handoff-section";
import { TaskSubtasksSection } from "@/components/tasks/task-subtasks-section";
import { useTaskHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { NotesSection } from "@/components/notes/notes-section";
import { useTaskNotes } from "@/lib/data/hooks/use-notes";
import { notesProvider } from "@/lib/data/providers";
import { getInitials as initials } from "@/lib/initials";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  /** The ONE shared timer instance the full page owns (`useTaskTimer`) — also read by the page's
   * own `TaskTimerControl` in the header, so the two can never race or disagree. */
  timer: TaskTimerState;
}

/**
 * The real Task detail body for the full `/dashboard/tasks/[id]` route. Phase 11B split this off
 * from the Task Drawer, which is now its own separate, much lighter Quick View (`task-drawer.tsx`)
 * — the two intentionally no longer share this component. Phase 11A redesign: the old large
 * Details+Assignees two-card grid is now one compact metadata rail (status rail, priority, due
 * date, activity, checklist progress, and a compact assignee summary — hidden entirely when the
 * only assignee is the viewer themselves, since ownership is then obvious from context) directly
 * under the header. The full Checklist gets its own card lower down. Each embedded section
 * (TaskChecklist/TaskTimeTracking/TaskHandoffSection/NotesSection) already owns its own data
 * fetching and Card chrome. No fake tabs — every section here is backed by a real, already-shipped
 * provider capability.
 */
export function TaskDetailContent({ task, onChanged, timer }: TaskDetailContentProps) {
  const { user } = useAuth();
  const { handoffs, refresh: refreshHandoffs } = useTaskHandoffs(task.id);
  const { notes, refresh: refreshNotes } = useTaskNotes(task.id);
  const [statusPending, setStatusPending] = useState(false);
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false);
  const [timeRollup, setTimeRollup] = useState<TaskTimeRollup | null>(null);

  // Only a top-level Task can have Subtasks — this fetch (and the "mark Done with open Subtasks"
  // warning below) is a no-op for a Subtask itself, per useSubtasks(null).
  const { subtasks } = useSubtasks(task.parentTaskId ? null : task.id);
  const openSubtaskCount = subtasks.filter((s) => s.status !== "done").length;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    tasksProvider.getTaskTimeRollup(user, task.id).then((rollup) => {
      if (!cancelled) setTimeRollup(rollup);
    });
    return () => {
      cancelled = true;
    };
  }, [user, task.id, task.updatedAt]);

  if (!user) return null;

  const assigneeIds = task.assignees.map((a) => a.id);
  const canProgress = canProgressTask(user, { assigneeIds });

  async function applyStatusChange(status: TaskStatus) {
    if (!user) return;
    setStatusPending(true);
    try {
      await tasksProvider.updateTaskStatus(user, task.id, status);
      onChanged();
    } finally {
      setStatusPending(false);
    }
  }

  async function handleStatusChange(status: string | null) {
    if (!status) return;
    // Section 22 — a warning, never a hard block: manually marking a parent Task Done while
    // Subtasks remain open still succeeds if the user confirms. Status independence (Section 21)
    // means this is the ONLY place completing a Subtask could ever indirectly touch the parent's
    // status, and only via this explicit, user-initiated, confirmable action — never automatically.
    if (status === "done" && !task.parentTaskId && openSubtaskCount > 0) {
      setConfirmDoneOpen(true);
      return;
    }
    await applyStatusChange(status as TaskStatus);
  }

  const checklistTotal = task.checklistItems.length;
  const checklistDone = task.checklistItems.filter((ci) => ci.isDone).length;
  const isSelfOnlyAssignee = task.assignees.length === 1 && task.assignees[0].id === user.id;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <TaskStatusRail
            status={task.status}
            onChange={canProgress ? handleStatusChange : undefined}
            disabled={statusPending}
          />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <TaskPriorityBadge priority={task.priority} />
            <span>Due {formatDate(task.dueDate)}</span>
            <span>
              {task.activity ? `${task.activity.departmentName}: ${task.activity.name}` : "No activity tagged"}
            </span>
            {checklistTotal > 0 && (
              <span>
                Checklist {checklistDone}/{checklistTotal}
              </span>
            )}
            {!isSelfOnlyAssignee &&
              (task.assignees.length === 0 ? (
                <span>Unassigned</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="flex -space-x-2">
                    {task.assignees.map((assignee) => (
                      <Avatar key={assignee.id} size="sm" className="ring-2 ring-card">
                        <AvatarFallback className="text-[0.65rem]">{initials(assignee.fullName)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </span>
                  {task.assignees.length === 1 ? task.assignees[0].fullName : `${task.assignees.length} assignees`}
                </span>
              ))}
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
            <span>
              Created by <span className="font-medium text-foreground">{task.createdBy.fullName}</span>
              {task.selfAdded && " (self-added)"} · {formatDateTime(task.createdAt)}
            </span>
            {task.statusChangedBy && (
              <span>
                Status last changed by{" "}
                <span className="font-medium text-foreground">{task.statusChangedBy.fullName}</span> ·{" "}
                {formatDateTime(task.statusChangedAt)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!task.parentTaskId && timeRollup && timeRollup.subtasksMinutes > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                Own time: <span className="font-medium text-foreground">{formatMinutes(timeRollup.ownMinutes)}</span>
              </span>
              <span>
                Including Subtasks:{" "}
                <span className="font-medium text-foreground">{formatMinutes(timeRollup.ownMinutes + timeRollup.subtasksMinutes)}</span>
              </span>
            </div>
          )}
          <TaskTimeTracking timer={timer} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskChecklist
            taskId={task.id}
            items={task.checklistItems}
            assigneeIds={assigneeIds}
            onChanged={onChanged}
          />
        </CardContent>
      </Card>

      {!task.parentTaskId && <TaskSubtasksSection parentTask={task} onChanged={onChanged} />}

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
