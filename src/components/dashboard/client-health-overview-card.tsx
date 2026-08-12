import type { CSSProperties } from "react";
import Link from "next/link";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import type { ClientHealthStatus } from "@/lib/data/client-health";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientHealthDonut } from "@/components/dashboard/client-health-donut";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const STATUS_META: Record<ClientHealthStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  "on-track": { label: "On Track", variant: "success" },
  "needs-attention": { label: "Needs Attention", variant: "warning" },
  "at-risk": { label: "At Risk", variant: "destructive" },
};

interface ClientHealthOverviewCardProps {
  companies: CompanyWithRelations[];
  className?: string;
  style?: CSSProperties;
}

/** Rollup of an already-scoped company list's health statuses — counts plus the at-risk names, reusing computeClientHealth's output as-is (no new scoring). */
export function ClientHealthOverviewCard({ companies, className, style }: ClientHealthOverviewCardProps) {
  const counts: Record<ClientHealthStatus, number> = { "on-track": 0, "needs-attention": 0, "at-risk": 0 };
  for (const company of companies) counts[company.health.status]++;
  const atRisk = companies.filter((c) => c.health.status === "at-risk");

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle className="text-base">Client Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
        ) : (
          <>
            <ClientHealthDonut counts={counts} />
            {atRisk.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">At risk</span>
                <div className="flex flex-col">
                  {atRisk.map((company, i) => (
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
                      <Badge variant={STATUS_META["at-risk"].variant} className="shrink-0">
                        {STATUS_META["at-risk"].label}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
