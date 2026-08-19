"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import type { ClientHealthStatus } from "@/lib/data/client-health";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientHealthDonut } from "@/components/dashboard/client-health-donut";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const STATUS_META: Record<ClientHealthStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  "on-track": { label: "On Track", variant: "success" },
  "needs-attention": { label: "Needs Attention", variant: "warning" },
  "at-risk": { label: "At Risk", variant: "destructive" },
};

const MAX_ROWS = 6;

interface ClientHealthOverviewCardProps {
  companies: CompanyWithRelations[];
  className?: string;
  style?: CSSProperties;
}

function renderGroup(label: string, companies: CompanyWithRelations[], status: ClientHealthStatus) {
  if (companies.length === 0) return null;
  return (
    <div key={status} className="flex flex-col gap-1">
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
      <div className="flex flex-col">
        {companies.map((company, i) => (
          <Link
            key={company.id}
            href={`/dashboard/companies/${company.id}`}
            className={cn(
              "group/row -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 hover:no-underline",
              STAGGER_ITEM_CLASS
            )}
            style={staggerDelay(i)}
          >
            <span className="truncate text-sm font-medium group-hover/row:underline">{company.name}</span>
            <Badge variant={STATUS_META[status].variant} className="shrink-0">
              {STATUS_META[status].label}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Rollup of an already-scoped company list's health statuses — counts plus the at-risk names, reusing computeClientHealth's output as-is (no new scoring). */
export function ClientHealthOverviewCard({ companies, className, style }: ClientHealthOverviewCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const counts: Record<ClientHealthStatus, number> = { "on-track": 0, "needs-attention": 0, "at-risk": 0 };
  for (const company of companies) counts[company.health.status]++;
  const atRisk = companies.filter((c) => c.health.status === "at-risk");
  const needsAttention = companies.filter((c) => c.health.status === "needs-attention");
  const total = atRisk.length + needsAttention.length;

  const atRiskPreview = atRisk.slice(0, MAX_ROWS);
  const needsAttentionPreview = needsAttention.slice(0, Math.max(0, MAX_ROWS - atRiskPreview.length));
  const overflow = total - atRiskPreview.length - needsAttentionPreview.length;

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle className="text-base">Client Health</CardTitle>
        <CardAction>
          <CardExpandButton onClick={() => setDrawerOpen(true)} label="Expand Client Health" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
        ) : (
          <>
            <ClientHealthDonut counts={counts} />
            {renderGroup("At risk", atRiskPreview, "at-risk")}
            {renderGroup("Needs attention", needsAttentionPreview, "needs-attention")}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="self-start text-xs font-medium text-primary hover:underline"
              >
                +{overflow} more
              </button>
            )}
          </>
        )}
      </CardContent>

      <DashboardWidgetFocusDialog open={drawerOpen} onOpenChange={setDrawerOpen} title="Client Health" description={`${total} client${total === 1 ? "" : "s"} need attention`}>
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
        ) : (
          <>
            <ClientHealthDonut counts={counts} />
            {total === 0 ? (
              <p className="text-sm text-muted-foreground">Every client is on track — nothing needs attention.</p>
            ) : (
              <>
                {renderGroup("At risk", atRisk, "at-risk")}
                {renderGroup("Needs attention", needsAttention, "needs-attention")}
              </>
            )}
          </>
        )}
      </DashboardWidgetFocusDialog>
    </Card>
  );
}
