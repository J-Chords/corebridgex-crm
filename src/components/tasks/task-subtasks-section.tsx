"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useSubtasks } from "@/lib/data/hooks/use-tasks";
import { isSuperadmin, isSupervisor, managesUser } from "@/lib/data/permissions";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskRowList } from "@/components/tasks/task-row";
import { AddSubtaskDialog } from "@/components/tasks/add-subtask-dialog";

interface TaskSubtasksSectionProps {
  parentTask: TaskWithRelations;
  /** Opens the given Subtask's own drawer, stacked on top of this one — see `TaskDrawer`'s doc
   * comment for the reused Sheet-on-Sheet pattern. Omitted falls back to normal `Link` navigation
   * (see `TaskRow`). */
  onOpenSubtask?: (subtaskId: string) => void;
  onChanged: () => void;
}

/**
 * Phase 10 — the "Subtasks" section inside a TOP-LEVEL Task's drawer/detail page (Section 18). Never
 * rendered for a Subtask itself (a Subtask can't have children — see `TaskDrawer`, which only
 * mounts this when `task.parentTaskId` is null). Reuses `TaskRowList`/`TaskRow` verbatim — the same
 * shared row shape every other "list of tasks" surface in the app already uses — rather than a new
 * nested-tree component. Progress ("2/4 done") is derived here, never stored.
 */
export function TaskSubtasksSection({ parentTask, onOpenSubtask, onChanged }: TaskSubtasksSectionProps) {
  const { user } = useAuth();
  const { subtasks, isLoading, refresh } = useSubtasks(parentTask.id);
  const [addOpen, setAddOpen] = useState(false);

  const doneCount = subtasks.filter((s) => s.status === "done").length;

  // Phase 10 hierarchy-authorization hardening (Section 11) — a viewer who can only see this Task
  // through hierarchy (assigned to one of its OWN Subtasks, not to this parent itself) must not be
  // shown "+ Add Subtask": the server (`create_subtask`, gated on `can_access_task_directly`) would
  // reject the attempt anyway, but the button shouldn't invite it. Approximates
  // `canAccessTaskDirectly` from already-loaded `parentTask.assignees` rather than fetching the full
  // org roster — a UI hint only; the server call remains the real, authoritative boundary.
  const canAddSubtask = user
    ? isSuperadmin(user) ||
      (isSupervisor(user) && parentTask.assignees.some((a) => managesUser(user, a))) ||
      parentTask.assignees.some((a) => a.id === user.id)
    : false;

  function handleCreated() {
    refresh();
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          Subtasks
          {subtasks.length > 0 && (
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              {doneCount} / {subtasks.length} done
            </span>
          )}
        </CardTitle>
        {canAddSubtask && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus /> Add Subtask
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <TaskRowList
          tasks={subtasks}
          isLoading={isLoading}
          emptyMessage="No Subtasks yet."
          onOpen={onOpenSubtask}
        />
      </CardContent>
      {canAddSubtask && (
        <AddSubtaskDialog open={addOpen} onOpenChange={setAddOpen} parentTask={parentTask} onCreated={handleCreated} />
      )}
    </Card>
  );
}
