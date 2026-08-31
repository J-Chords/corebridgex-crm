import { Badge } from "@/components/ui/badge";
import type { WorkstreamStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<
  WorkstreamStatus,
  { label: string; variant: "success" | "info" | "warning" | "destructive" | "neutral" }
> = {
  active: { label: "Active", variant: "success" },
  "on-hold": { label: "On hold", variant: "warning" },
  completed: { label: "Completed", variant: "info" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

/** Same semantic tokens each status's own `Badge` variant already renders with — the one source of
 * truth for "what color is this Workstream status," mirroring Task Status's own `STATUS_COLOR_VAR`. */
export const STATUS_COLOR_VAR: Record<WorkstreamStatus, string> = {
  active: "var(--success)",
  "on-hold": "var(--warning)",
  completed: "var(--info)",
  cancelled: "var(--destructive)",
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
