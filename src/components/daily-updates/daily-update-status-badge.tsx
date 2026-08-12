import { Badge } from "@/components/ui/badge";
import type { DailyUpdateStatus } from "@/lib/data/types";

const STATUS_META: Record<DailyUpdateStatus, { label: string; variant: "success" | "warning" }> = {
  draft: { label: "Draft", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
};

export function DailyUpdateStatusBadge({ status }: { status: DailyUpdateStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
