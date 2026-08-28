import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/lib/data/types";

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; variant: "success" | "info" | "warning" | "destructive" }> = {
  active: { label: "Active", variant: "success" },
  "on-hold": { label: "On hold", variant: "warning" },
  completed: { label: "Completed", variant: "info" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

/** Same "single source of truth for status color" pattern as Task's `STATUS_COLOR_VAR` — reused by
 * the Projects index's status summary strip and Gantt bars so both read the exact same semantic
 * theme tokens `ProjectStatusBadge` itself renders with, never a hand-picked new hue. */
export const PROJECT_STATUS_COLOR_VAR: Record<ProjectStatus, string> = {
  active: "var(--success)",
  "on-hold": "var(--warning)",
  completed: "var(--info)",
  cancelled: "var(--destructive)",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const meta = PROJECT_STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
