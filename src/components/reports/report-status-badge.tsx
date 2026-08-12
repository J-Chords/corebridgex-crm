import { Badge } from "@/components/ui/badge";
import type { ReportStatus } from "@/lib/data/types";

const STATUS_META: Record<ReportStatus, { label: string; variant: "success" | "warning" }> = {
  draft: { label: "Draft", variant: "warning" },
  finalized: { label: "Finalized", variant: "success" },
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
