import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/lib/data/types";

// Visible label uses the product-locked "Canceled" (single L) spelling; the underlying DB value
// stays "cancelled" (unchanged, avoiding schema churn) — see docs/project-level-product-architecture.md.
// "completed" is retired as a normal, selectable target (Project = Client workspace — a client
// relationship becomes Archived, not "Completed"; see `ProjectStatusControl`) — this entry stays only
// so an already-existing legacy row still renders a real, correct label instead of an unknown status.
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; variant: "success" | "info" | "warning" | "destructive" | "neutral" }> = {
  active: { label: "Active", variant: "success" },
  "on-hold": { label: "On Hold", variant: "warning" },
  completed: { label: "Completed", variant: "info" },
  cancelled: { label: "Canceled", variant: "destructive" },
  archived: { label: "Archived", variant: "neutral" },
  trash: { label: "Trash", variant: "neutral" },
};

/** Same "single source of truth for status color" pattern as Task's `STATUS_COLOR_VAR` — reused by
 * the Projects index's status summary strip and Gantt bars so both read the exact same semantic
 * theme tokens `ProjectStatusBadge` itself renders with, never a hand-picked new hue. */
export const PROJECT_STATUS_COLOR_VAR: Record<ProjectStatus, string> = {
  active: "var(--success)",
  "on-hold": "var(--warning)",
  completed: "var(--info)",
  cancelled: "var(--destructive)",
  archived: "var(--muted-foreground)",
  trash: "var(--muted-foreground)",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const meta = PROJECT_STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
