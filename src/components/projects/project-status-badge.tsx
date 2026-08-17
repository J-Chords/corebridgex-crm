import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/lib/data/types";

const STATUS_META: Record<ProjectStatus, { label: string; variant: "success" | "info" | "warning" | "destructive" }> = {
  active: { label: "Active", variant: "success" },
  "on-hold": { label: "On hold", variant: "warning" },
  completed: { label: "Completed", variant: "info" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
