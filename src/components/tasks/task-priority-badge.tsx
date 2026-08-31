import type { TaskPriority } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; variant: "success" | "info" | "warning" | "destructive" | "neutral" }
> = {
  low: { label: "Low", variant: "neutral" },
  medium: { label: "Medium", variant: "info" },
  high: { label: "High", variant: "warning" },
  urgent: { label: "Urgent", variant: "destructive" },
};

/** Single source of truth for "what color is this priority" — same pattern as Task Status's own
 * `STATUS_COLOR_VAR`/Project Status's `PROJECT_STATUS_COLOR_VAR`. Deliberately reuses the exact
 * existing semantic tokens each priority already carried via `PRIORITY_META`'s `variant` (neutral/
 * info/warning/destructive) — not the reference screenshot's own literal green/amber/red, so this
 * never drifts from what "info blue," "warning amber," etc. already mean everywhere else. */
export const PRIORITY_COLOR_VAR: Record<TaskPriority, string> = {
  low: "var(--muted-foreground)",
  medium: "var(--info)",
  high: "var(--warning)",
  urgent: "var(--destructive)",
};

/** How many of the 4 ascending bars are filled — one clean level per real `TaskPriority` value, no
 * enum change. */
const PRIORITY_BAR_LEVEL: Record<TaskPriority, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
const BAR_HEIGHTS = [5, 7, 9, 11];

/**
 * Phase 13B — compact ascending signal-bar indicator + plain text label (references/phase-13b/
 * task-priority-reference.png.png), replacing the earlier colored-pill-capsule treatment
 * repository-wide. Every existing display call site already used this one shared component (Board
 * cards, List rows, Timeline, Quick View, full Task Properties, My Day/Planner's shared
 * `TaskSummaryItem`) — the export name is kept unchanged specifically to avoid touching any of
 * them; they all pick up the new look for free. Text is never colored (color is supplemental, the
 * bars carry it) so legibility never depends on a per-priority contrast check. Urgent stays
 * visibly distinct from High by both an extra filled bar AND its own color (destructive vs
 * warning), never by color alone. The ascending-bar indicator itself (`PriorityBars`, below) is
 * shared with the compact `TaskPriorityPicker` (Phase 13 final visual polish — Create/Edit now uses
 * the same bars in a compact dropdown, replacing its own earlier separate pill-row treatment), so a
 * read-only display and the editable control can never drift apart.
 */
export function PriorityBars({ priority, className }: { priority: TaskPriority; className?: string }) {
  const level = PRIORITY_BAR_LEVEL[priority];
  const color = PRIORITY_COLOR_VAR[priority];
  return (
    <span className={cn("flex items-end gap-[2px]", className)} aria-hidden="true">
      {BAR_HEIGHTS.map((height, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-[1px]"
          style={{ height, backgroundColor: i < level ? color : "var(--border)" }}
        />
      ))}
    </span>
  );
}

export function TaskPriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <PriorityBars priority={priority} />
      <span className="text-xs font-medium text-foreground">{meta.label}</span>
    </span>
  );
}

/** value->label map for Select `items` — lets SelectValue resolve the label immediately, without waiting for the popup to mount once. */
export const TASK_PRIORITY_SELECT_ITEMS: Record<TaskPriority, string> = Object.fromEntries(
  Object.entries(PRIORITY_META).map(([value, meta]) => [value, meta.label])
) as Record<TaskPriority, string>;
