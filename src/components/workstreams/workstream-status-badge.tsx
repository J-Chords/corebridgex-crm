import { Badge } from "@/components/ui/badge";
import type { WorkstreamStatus } from "@/lib/data/types";

export const STATUS_META: Record<
  WorkstreamStatus,
  { label: string; variant: "success" | "info" | "warning" | "destructive" | "neutral" }
> = {
  active: { label: "Active", variant: "success" },
  "on-hold": { label: "On hold", variant: "warning" },
  completed: { label: "Completed", variant: "info" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export function WorkstreamStatusBadge({ status }: { status: WorkstreamStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** value->label map for Select `items` — lets SelectValue resolve the label immediately, without waiting for the popup to mount once. */
export const WORKSTREAM_STATUS_SELECT_ITEMS: Record<WorkstreamStatus, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([value, meta]) => [value, meta.label])
) as Record<WorkstreamStatus, string>;
