"use client";

import { useAuth } from "@/lib/auth/auth-context";
import type { TaskTimerState } from "@/lib/data/hooks/use-task-timer";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskTimeTracking } from "@/components/tasks/task-time-tracking";
import { TaskHandoffSection } from "@/components/tasks/task-handoff-section";
import { useTaskHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { NotesSection } from "@/components/notes/notes-section";
import { useTaskNotes } from "@/lib/data/hooks/use-notes";
import { ProjectCommentsSection } from "@/components/projects/project-comments-section";
import type { ProjectCommentTarget } from "@/lib/data/providers/projects-provider";
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
 * Checklist, Notes/Handoff, then Time Activity last — Time Tracking's primary controls live
 * exclusively in the page's right property rail now, so this column never repeats them (Part 34's
 * locked order, addressing the "Time Tracking dominates the page" criticism directly). Status/
 * Priority/Due date/Assignees moved to the right rail too — this column is purely "the place the
 * work happens," not a second copy of the header's own metadata. Each embedded section
 * (`TaskChecklist`/`TaskHandoffSection`/`NotesSection`) still owns its own data fetching; the ones
 * with their own Card chrome keep it, the lighter ones (Description, Checklist, Time Activity) use a
 * plain heading + divider instead of a nested card, per the "whitespace over card-everything" rule.
 */
export function TaskDetailContent({ task, onChanged, timer }: TaskDetailContentProps) {
  const { user } = useAuth();
  const { handoffs, refresh: refreshHandoffs } = useTaskHandoffs(task.id);
  const { notes } = useTaskNotes(task.id);

  if (!user) return null;

  // Part 7/8/9 — a Task Comment is only possible when the Task's own Workstream belongs to a
  // Project (`project_comments.project_id` is always required); a legacy/internal Task with no
  // Project simply has no Comments tab, same as it has no Project Issues/Documents context.
  const commentsTarget: ProjectCommentTarget | null = task.workstream.projectId
    ? { projectId: task.workstream.projectId, taskId: task.id }
    : null;

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

      <Separator />
      <TaskHandoffSection taskId={task.id} handoffs={handoffs} onChanged={refreshHandoffs} />

      {notes.length > 0 && (
        <>
          <Separator />
          <NotesSection
            title="Notes"
            description="Historical context, kept for reference — new Task discussion happens in Comments below."
            notes={notes}
            emptyMessage="No notes on this task."
            readOnly
          />
        </>
      )}

      {commentsTarget && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <SectionHeading>Comments</SectionHeading>
            <ProjectCommentsSection target={commentsTarget} compact />
          </div>
        </>
      )}

      <Separator />

      <div className="flex flex-col gap-3">
        <SectionHeading>Time Activity</SectionHeading>
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
