"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { tasksProvider } from "@/lib/data/providers";
import { canAddTaskChecklistItem, canEditTask, canProgressTask } from "@/lib/data/permissions";
import type { TaskInput, TaskChecklistItemInput } from "@/lib/data/providers/tasks-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TaskChecklistProps {
  task: TaskWithRelations;
  onChanged: () => void;
}

/** Every field `updateTask` needs, taken straight from the already-loaded Task — the exact same
 * shape `TaskFormDialog`'s own edit-mode submit builds. Used only to remove one checklist line
 * without opening the full Edit dialog; every other field round-trips unchanged. */
function taskToInput(task: TaskWithRelations, checklistItems: TaskChecklistItemInput[]): TaskInput {
  return {
    title: task.title,
    description: task.description,
    workstreamId: task.workstreamId,
    assigneeIds: task.assignees.map((a) => a.id),
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    expectedMinutes: task.expectedMinutes,
    checklistItems,
    activityId: task.activityId,
  };
}

/**
 * Phase 12B — Reference 3's spreadsheet-dense table style, applied to the EXISTING checklist model
 * only (checkbox/description/position — no Maintenance Level, Duration, Period, Code, or per-item
 * assignee, none of which this app's checklist stores). Three deliberately distinct permissions,
 * never conflated:
 *
 * - TOGGLE — the existing `toggleChecklistItem` RPC, gated by `canProgressTask` (unchanged).
 * - ADD — the narrow `add_task_checklist_item` RPC (`tasksProvider.addChecklistItem`), gated by
 *   `canAddTaskChecklistItem` (any direct assignee, or anyone who already has `canEditTask`) —
 *   final Phase 12B backend completion. Never touches the `tasks` row or any other checklist line.
 * - REMOVE — still the general `updateTask` RPC (the same one `TaskFormDialog`'s checklist builder
 *   already calls), gated by `canEditTask` — unchanged; no narrower existing rule supports a safer
 *   self-delete-own-item boundary, since the data model has no per-item creator/owner field.
 */
export function TaskChecklist({ task, onChanged }: TaskChecklistProps) {
  const { user } = useAuth();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  if (!user) return null;
  const items = task.checklistItems;
  const canProgress = canProgressTask(user, { assigneeIds: task.assignees.map((a) => a.id) });
  const canAdd = canAddTaskChecklistItem(user, { ...task, assigneeIds: task.assignees.map((a) => a.id) });
  const canEdit = canEditTask(user, task);

  async function handleToggle(itemId: string, isDone: boolean) {
    if (!user) return;
    setPendingId(itemId);
    try {
      await tasksProvider.toggleChecklistItem(user, task.id, itemId, isDone);
      onChanged();
    } finally {
      setPendingId(null);
    }
  }

  async function handleAdd() {
    const description = newText.trim();
    if (!user || !description) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await tasksProvider.addChecklistItem(user, task.id, description);
      setNewText("");
      onChanged();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unable to add checklist item.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(itemId: string) {
    if (!user) return;
    setPendingId(itemId);
    try {
      const nextItems: TaskChecklistItemInput[] = items
        .filter((i) => i.id !== itemId)
        .map((i) => ({ id: i.id, description: i.description }));
      await tasksProvider.updateTask(user, task.id, taskToInput(task, nextItems));
      onChanged();
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0 && !canAdd) {
    return <p className="text-sm text-muted-foreground">No checklist items on this task.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {items.map((item, i) => (
        <div
          key={item.id}
          className={cn(
            "group flex items-center gap-2.5 border-b px-2.5 py-1.5 last:border-b-0 hover:bg-muted/40",
            i % 2 === 1 && "bg-muted/10"
          )}
        >
          <Checkbox
            checked={item.isDone}
            disabled={!canProgress || pendingId === item.id}
            onCheckedChange={(checked) => handleToggle(item.id, checked === true)}
            aria-label={item.description}
          />
          <span className={cn("min-w-0 flex-1 truncate text-sm", item.isDone && "text-muted-foreground line-through")}>
            {item.description}
          </span>
          <span className={cn("shrink-0 text-xs", item.isDone ? "text-success" : "text-muted-foreground")}>
            {item.isDone ? "Completed" : "Open"}
          </span>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 opacity-0 group-hover:opacity-100"
              disabled={pendingId === item.id}
              onClick={() => handleRemove(item.id)}
              aria-label={`Remove "${item.description}"`}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      ))}
      {canAdd && (
        <div className="flex flex-col gap-1 px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Add checklist item…"
              className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
              disabled={isAdding}
              aria-label="Add checklist item"
            />
            {newText.trim().length > 0 && (
              <Button size="sm" variant="ghost" onClick={handleAdd} disabled={isAdding}>
                Add
              </Button>
            )}
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
        </div>
      )}
    </div>
  );
}
