import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@/lib/data/types";

export const STATUS_META: Record<
  TaskStatus,
  { label: string; variant: "success" | "info" | "warning" | "destructive" | "neutral" }
> = {
  todo: { label: "To do", variant: "neutral" },
  "in-progress": { label: "In progress", variant: "info" },
  blocked: { label: "Blocked", variant: "destructive" },
  "waiting-on-client": { label: "Waiting on client", variant: "warning" },
  done: { label: "Done", variant: "success" },
};

/** The single source of truth for "what color is this status" — every status-colored element in the app (this badge, the status picker's pills, My Day's buckets, the board) reads from this map. */
export const STATUS_COLOR_VAR: Record<TaskStatus, string> = {
  todo: "var(--muted-foreground)",
  "in-progress": "var(--info)",
  blocked: "var(--destructive)",
  "waiting-on-client": "var(--warning)",
  done: "var(--success)",
};

/**
 * A bolder, higher-contrast chip style than the generic `Badge` tint (which sits at ~10% background
 * opacity — legible enough for a report status, too faint for a status a person needs to
 * distinguish at a glance, especially once "selected"). Background/border are strong blended tints
 * of the status hue; text blends the hue into the theme's own `--foreground` so it always stays
 * readable in both themes without hand-picking new contrast-checked colors per status.
 * `strength: "solid"` (the default, used for the badge and a selected pill/bucket) reads as a real
 * colored chip; `"subtle"` (an unselected pill) stays present but clearly secondary.
 */
export function statusChipStyle(status: TaskStatus, strength: "solid" | "subtle" = "solid"): CSSProperties {
  const c = STATUS_COLOR_VAR[status];
  const bgPercent = strength === "solid" ? 22 : 12;
  const borderPercent = strength === "solid" ? 65 : 35;
  return {
    backgroundColor: `color-mix(in oklch, ${c} ${bgPercent}%, var(--card))`,
    borderColor: `color-mix(in oklch, ${c} ${borderPercent}%, transparent)`,
    color: `color-mix(in oklch, ${c} 72%, var(--foreground))`,
  };
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="neutral" style={statusChipStyle(status)} className="font-semibold">
      {meta.label}
    </Badge>
  );
}

/** value->label map for Select `items` — lets SelectValue resolve the label immediately, without waiting for the popup to mount once. */
export const TASK_STATUS_SELECT_ITEMS: Record<TaskStatus, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([value, meta]) => [value, meta.label])
) as Record<TaskStatus, string>;
