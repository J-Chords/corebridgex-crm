import type { Brand } from "@/lib/data/types";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { INTERNAL_BRAND_ID } from "@/lib/data/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

interface BrandSnapshotCardProps {
  brands: Brand[];
  companies: CompanyWithRelations[];
  tasks: TaskWithRelations[];
}

/** Per-partner-brand rollup — clients and active tasks per brand, excluding the Internal pseudo-brand (not a real partner). Real data only: reads brandId already on Company/Task, no new provider method. */
export function BrandSnapshotCard({ brands, companies, tasks }: BrandSnapshotCardProps) {
  const partnerBrands = brands.filter((b) => b.id !== INTERNAL_BRAND_ID);

  const rows = partnerBrands.map((brand) => {
    const clientCount = companies.filter((c) => c.brandId === brand.id).length;
    const activeTaskCount = tasks.filter((t) => t.company.brandId === brand.id && t.status !== "done").length;
    return { brand, clientCount, activeTaskCount };
  });

  const maxClients = Math.max(1, ...rows.map((r) => r.clientCount));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-Brand Snapshot</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No partner brands yet.</p>
        ) : (
          rows.map(({ brand, clientCount, activeTaskCount }, i) => {
            const pct = Math.round((clientCount / maxClients) * 100);
            return (
              <div
                key={brand.id}
                className={cn(
                  "-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60",
                  STAGGER_ITEM_CLASS
                )}
                style={staggerDelay(i)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{brand.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {clientCount} client{clientCount === 1 ? "" : "s"} · {activeTaskCount} active
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
