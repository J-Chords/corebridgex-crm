import { Badge } from "@/components/ui/badge";
import type { CompanyStatus } from "@/lib/data/types";

const STATUS_META: Record<CompanyStatus, { label: string; variant: "success" | "info" | "warning" | "destructive" }> = {
  active: { label: "Active", variant: "success" },
  prospect: { label: "Prospect", variant: "info" },
  dormant: { label: "Dormant", variant: "warning" },
  churned: { label: "Churned", variant: "destructive" },
};

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** value->label map for Select `items` — lets SelectValue resolve the label immediately, without waiting for the popup to mount once. */
export const COMPANY_STATUS_SELECT_ITEMS: Record<CompanyStatus, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([value, meta]) => [value, meta.label])
) as Record<CompanyStatus, string>;
