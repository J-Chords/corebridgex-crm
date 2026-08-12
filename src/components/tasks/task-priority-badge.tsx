import { Badge } from "@/components/ui/badge";
import type { TaskPriority } from "@/lib/data/types";

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; variant: "success" | "info" | "warning" | "destructive" | "neutral" }
> = {
  low: { label: "Low", variant: "neutral" },
  medium: { label: "Medium", variant: "info" },
  high: { label: "High", variant: "warning" },
  urgent: { label: "Urgent", variant: "destructive" },
};

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const meta = PRIORITY_META[priority];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** value->label map for Select `items` — lets SelectValue resolve the label immediately, without waiting for the popup to mount once. */
export const TASK_PRIORITY_SELECT_ITEMS: Record<TaskPriority, string> = Object.fromEntries(
  Object.entries(PRIORITY_META).map(([value, meta]) => [value, meta.label])
) as Record<TaskPriority, string>;
