"use client";

import { useSubtasks } from "@/lib/data/hooks/use-tasks";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TaskRowList } from "@/components/tasks/task-row";

interface TaskSubtasksSectionProps {
  parentTask: TaskWithRelations;
}

/**
 * Phase 13B final boss-feedback pass — Subtask creation is retired from normal operational UI (the
 * locked hierarchy is now Project → Service → Activity → Task → Checklist; independently-trackable
 * work becomes another Task in the right context, not a child row). This section keeps existing
 * historical Subtasks fully viewable/navigable — no data, RPC, or authorization was removed — it
 * just no longer offers a way to create new ones, and stays out of the way entirely (renders
 * nothing) for the now-common case of a Task with none. Reuses `TaskRowList`/`TaskRow` verbatim,
 * same as before.
 */
export function TaskSubtasksSection({ parentTask }: TaskSubtasksSectionProps) {
  const { subtasks, isLoading } = useSubtasks(parentTask.id);

  if (!isLoading && subtasks.length === 0) return null;

  const doneCount = subtasks.filter((s) => s.status === "done").length;

  return (
    <>
      <Separator />
      <Card>
        <CardHeader className="space-y-0">
          <CardTitle className="text-base">
            Subtasks
            {subtasks.length > 0 && (
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                {doneCount} / {subtasks.length} done
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TaskRowList tasks={subtasks} isLoading={isLoading} emptyMessage="No Subtasks yet." />
        </CardContent>
      </Card>
    </>
  );
}
