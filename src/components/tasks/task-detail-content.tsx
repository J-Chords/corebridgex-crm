"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { tasksProvider } from "@/lib/data/providers";
import { formatMinutes } from "@/lib/format-minutes";
import type { TaskTimerState } from "@/lib/data/hooks/use-task-timer";
import type { TaskTimeRollup, TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskTimeTracking } from "@/components/tasks/task-time-tracking";
import { TaskHandoffSection } from "@/components/tasks/task-handoff-section";
import { TaskSubtasksSection } from "@/components/tasks/task-subtasks-section";
import { useTaskHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { NotesSection } from "@/components/notes/notes-section";
import { useTaskNotes } from "@/lib/data/hooks/use-notes";
import { notesProvider } from "@/lib/data/providers";
import { Separator } from "@/components/ui/separator";

interface TaskDetailContentProps {
  task: TaskWithRelations;
  onChanged: () => void;
  /** The ONE shared timer instance the full page owns (`useTaskTimer`) — also read by the page's
   * own right-rail `TaskTimerControl`, so the two can never race or disagree. */
  timer: TaskTimerState;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{children}</h2>;
}

/**
 * Phase 12B — the main work-area column for the full `/dashboard/tasks/[id]` route: Description,
 * Checklist, Subtasks (top-level Tasks only), Notes/Handoff, then Time Activity last — Time
 * Tracking's primary controls live exclusively in the page's right property rail now, so this
 * column never repeats them (Part 34's locked order, addressing the "Time Tracking dominates the
 * page" criticism directly). Status/Priority/Due date/Assignees moved to the right rail too — this
 * column is purely "the place the work happens," not a second copy of the header's own metadata.
 * Each embedded section (`TaskChecklist`/`TaskHandoffSection`/`NotesSection`/`TaskSubtasksSection`)
 * still owns its own data fetching; the ones with their own Card chrome keep it, the lighter ones
 * (Description, Checklist, Time Activity) use a plain heading + divider instead of a nested card,
 * per the "whitespace over card-everything" rule.
 */
export function TaskDetailContent({ task, onChanged, timer }: TaskDetailContentProps) {
  const { user } = useAuth();
  const { handoffs, refresh: refreshHandoffs } = useTaskHandoffs(task.id);
  const { notes, refresh: refreshNotes } = useTaskNotes(task.id);
  const [timeRollup, setTimeRollup] = useState<TaskTimeRollup | null>(null);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionHeading>Description</SectionHeading>
        {task.description ? (
          <p className="text-sm whitespace-pre-wrap">{task.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No description yet.</p>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <SectionHeading>Checklist</SectionHeading>
        <TaskChecklist task={task} onChanged={onChanged} />
      </div>

      {!task.parentTaskId && (
        <>
          <Separator />
          <TaskSubtasksSection parentTask={task} onChanged={onChanged} />
        </>
      )}

      <Separator />
      <TaskHandoffSection taskId={task.id} handoffs={handoffs} onChanged={refreshHandoffs} />

      <Separator />
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

      <Separator />

      <div className="flex flex-col gap-3">
        <SectionHeading>Time Activity</SectionHeading>
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
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Created by <span className="font-medium text-foreground">{task.createdBy.fullName}</span>
        {task.selfAdded && " (self-added)"}
        {task.statusChangedBy && (
          <>
            {" · "}Status last changed by <span className="font-medium text-foreground">{task.statusChangedBy.fullName}</span>
          </>
        )}
      </p>
    </div>
  );
}
