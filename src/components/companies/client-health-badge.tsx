import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ClientHealth, ClientHealthStatus } from "@/lib/data/client-health";

const STATUS_META: Record<ClientHealthStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  "on-track": { label: "On Track", variant: "success" },
  "needs-attention": { label: "Needs Attention", variant: "warning" },
  "at-risk": { label: "At Risk", variant: "destructive" },
};

/** Compact badge for tight spaces (e.g. a table column) — reasons surface on hover/focus, never hidden entirely. */
export function ClientHealthBadge({ health }: { health: ClientHealth }) {
  const meta = STATUS_META[health.status];
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant={meta.variant} className="cursor-help" />}>{meta.label}</TooltipTrigger>
      <TooltipContent>{health.reasons.join(" · ")}</TooltipContent>
    </Tooltip>
  );
}

/** Prominent, always-visible version for the company detail page — badge plus the plain-English reasons right beneath it, no hover required. */
export function ClientHealthSummary({ health }: { health: ClientHealth }) {
  const meta = STATUS_META[health.status];
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={meta.variant} className="w-fit">
        {meta.label}
      </Badge>
      <p className="text-sm text-muted-foreground">{health.reasons.join(" · ")}</p>
    </div>
  );
}
