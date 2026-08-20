import { Badge } from "@/components/ui/badge";
import type { DailyUpdateStatus } from "@/lib/data/types";

// User-facing wording is "Submit"/"Submitted" (business workflow) even though the underlying
// status stays "confirmed" internally (database enum/RPC names unchanged — renaming those would be
// needless churn for a copy-only change).
const STATUS_META: Record<DailyUpdateStatus, { label: string; variant: "success" | "warning" }> = {
  draft: { label: "Draft", variant: "warning" },
  confirmed: { label: "Submitted", variant: "success" },
};

export function DailyUpdateStatusBadge({ status }: { status: DailyUpdateStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
