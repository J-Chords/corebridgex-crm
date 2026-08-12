"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { tasksProvider } from "@/lib/data/providers";
import { canProgressTask } from "@/lib/data/permissions";
import type { ChecklistItem } from "@/lib/data/types";
import { Checkbox } from "@/components/ui/checkbox";
import { ChecklistProgress } from "@/components/ui/checklist-progress";

interface TaskChecklistProps {
  taskId: string;
  items: ChecklistItem[];
  assigneeIds: string[];
  onChanged: () => void;
}

export function TaskChecklist({ taskId, items, assigneeIds, onChanged }: TaskChecklistProps) {
  const { user } = useAuth();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!user) return null;
  const canProgress = canProgressTask(user, { assigneeIds });
  const done = items.filter((i) => i.isDone).length;

  async function handleToggle(itemId: string, isDone: boolean) {
    if (!user) return;
    setPendingId(itemId);
    try {
      await tasksProvider.toggleChecklistItem(user, taskId, itemId, isDone);
      onChanged();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ChecklistProgress done={done} total={items.length} label="Checklist progress" />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No checklist items on this task.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5">
              <Checkbox
                className="mt-0.5"
                checked={item.isDone}
                disabled={!canProgress || pendingId === item.id}
                onCheckedChange={(checked) => handleToggle(item.id, checked === true)}
                aria-label={item.description}
              />
              <span className={item.isDone ? "text-sm text-muted-foreground line-through" : "text-sm"}>
                {item.description}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
