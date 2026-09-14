import { Badge } from "@/components/ui/badge";
import type { WorkstreamStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

// CD-162 final gap closure — Archive-vs-Cancelled semantics audit: Workstream never had a separate
// "Archived" tier the way Project does (Project's own badge already distinguishes a destructive-red
// "Canceled" from a neutral-gray "Archived" — see project-status-badge.tsx); "cancelled" was the one
// existing generic inactive/historical state, already documented (product-brief.md) as grouped with
// "completed" — "intentionally paused or done," not alarming. Reusing it as this pass's Archive
// lifecycle action is safe (audited: no billing/reporting/other logic keys off it specially), but the
// display metadata is relabeled to match — "Archived"/neutral, not "Cancelled"/destructive — so the
// Lifecycle menu's "Archive" action and the resulting badge read consistently everywhere a
// Workstream's status is shown (Services list, Service Detail, the Status picker in Edit Service).
// The underlying stored value stays "cancelled" — no schema/type change, no migration needed.
export const STATUS_META: Record<
  WorkstreamStatus,
  { label: string; variant: "success" | "info" | "warning" | "destructive" | "neutral" }
> = {
  active: { label: "Active", variant: "success" },
  "on-hold": { label: "On hold", variant: "warning" },
  completed: { label: "Completed", variant: "info" },
  cancelled: { label: "Archived", variant: "neutral" },
};

/** Same semantic tokens each status's own `Badge` variant already renders with — the one source of
 * truth for "what color is this Workstream status," mirroring Task Status's own `STATUS_COLOR_VAR`. */
export const STATUS_COLOR_VAR: Record<WorkstreamStatus, string> = {
  active: "var(--success)",
  "on-hold": "var(--warning)",
  completed: "var(--info)",
  cancelled: "var(--muted-foreground)",
};

export function WorkstreamStatusBadge({ status }: { status: WorkstreamStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** Compact status dot for the picker (Create/Edit Service) — same pattern as Task Status's own `StatusDot`. */
export function WorkstreamStatusDot({ status, className }: { status: WorkstreamStatus; className?: string }) {
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: STATUS_COLOR_VAR[status] }}
      aria-hidden="true"
    />
  );
}

/** value->label map for Select `items` — lets SelectValue resolve the label immediately, without waiting for the popup to mount once. */
export const WORKSTREAM_STATUS_SELECT_ITEMS: Record<WorkstreamStatus, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([value, meta]) => [value, meta.label])
) as Record<WorkstreamStatus, string>;
