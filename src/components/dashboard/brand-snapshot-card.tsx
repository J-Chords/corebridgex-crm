"use client";

import { useState } from "react";
import Link from "next/link";
import type { Brand } from "@/lib/data/types";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { INTERNAL_BRAND_ID } from "@/lib/data/constants";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const MAX_ROWS = 6;

interface BrandSnapshotCardProps {
  brands: Brand[];
  companies: CompanyWithRelations[];
  tasks: TaskWithRelations[];
}

/** Per-partner-brand rollup — clients and active tasks per brand, excluding the Internal pseudo-brand (not a real partner). Real data only: reads brandId already on Company/Task, no new provider method. */
export function BrandSnapshotCard({ brands, companies, tasks }: BrandSnapshotCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const partnerBrands = brands.filter((b) => b.id !== INTERNAL_BRAND_ID);

  const rows = partnerBrands.map((brand) => {
    const clientCount = companies.filter((c) => c.brandId === brand.id).length;
    const activeTaskCount = tasks.filter((t) => t.company.brandId === brand.id && t.status !== "done").length;
    return { brand, clientCount, activeTaskCount };
  });

  const maxClients = Math.max(1, ...rows.map((r) => r.clientCount));
  const overflow = rows.length - MAX_ROWS;

  function renderRow({ brand, clientCount, activeTaskCount }: (typeof rows)[number], i: number) {
    const pct = Math.round((clientCount / maxClients) * 100);
    return (
      <Link
        // Project Closure — Navigation Correction: Projects has no per-Brand filter today, so this
        // is not a like-for-like destination — reported as a known filter gap rather than keeping
        // the competing Companies destination (Section 3 of that correction).
        key={brand.id}
        href="/dashboard/projects"
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
      </Link>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-Brand Snapshot</CardTitle>
        <CardAction>
          <CardExpandButton onClick={() => setDrawerOpen(true)} label="Expand Per-Brand Snapshot" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No partner brands yet.</p>
        ) : (
          <>
            {rows.slice(0, MAX_ROWS).map(renderRow)}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="mt-1 self-start text-xs font-medium text-primary hover:underline"
              >
                +{overflow} more
              </button>
            )}
          </>
        )}
      </CardContent>

      <DashboardWidgetFocusDialog open={drawerOpen} onOpenChange={setDrawerOpen} title="Per-Brand Snapshot" description={`${rows.length} brand${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No partner brands yet.</p> : rows.map(renderRow)}
      </DashboardWidgetFocusDialog>
    </Card>
  );
}
