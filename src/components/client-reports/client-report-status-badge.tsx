import { Badge } from "@/components/ui/badge";
import type { ClientReportStatus } from "@/lib/data/types";

const STATUS_META: Record<ClientReportStatus, { label: string; variant: "success" | "warning" }> = {
  draft: { label: "Draft", variant: "warning" },
  finalized: { label: "Finalized", variant: "success" },
};

export function ClientReportStatusBadge({ status }: { status: ClientReportStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
