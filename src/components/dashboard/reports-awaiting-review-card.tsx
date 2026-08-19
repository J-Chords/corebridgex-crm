"use client";

import { useState } from "react";
import Link from "next/link";
import type { AccomplishmentsReport } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { ReportStatusBadge } from "@/components/reports/report-status-badge";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

const MAX_ROWS = 5;

interface ReportsAwaitingReviewCardProps {
  /** Already scoped to "not mine" — pass the caller's own owner-filtered team/all-reports list. */
  reports: AccomplishmentsReport[];
}

/** Reports the viewer can open and comment on — the same "Team Reports"/"All Reports" partition already used on /dashboard/reports, just surfaced here. */
export function ReportsAwaitingReviewCard({ reports }: ReportsAwaitingReviewCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sorted = [...reports].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const overflow = sorted.length - MAX_ROWS;

  function renderRow(report: AccomplishmentsReport, i: number) {
    return (
      <Link
        key={report.id}
        href={`/dashboard/reports/${report.id}`}
        className={cn(
          "group/row -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 hover:no-underline",
          STAGGER_ITEM_CLASS
        )}
        style={staggerDelay(i)}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium group-hover/row:underline">{report.subjectLabel}</span>
          <span className="truncate text-xs text-muted-foreground">
            {formatRange(report.rangeStart, report.rangeEnd)}
          </span>
        </div>
        <ReportStatusBadge status={report.status} />
      </Link>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reports Awaiting Review</CardTitle>
        <CardAction>
          <CardExpandButton onClick={() => setDrawerOpen(true)} label="Expand Reports Awaiting Review" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team reports to review yet.</p>
        ) : (
          <>
            {sorted.slice(0, MAX_ROWS).map(renderRow)}
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

      <DashboardWidgetFocusDialog open={drawerOpen} onOpenChange={setDrawerOpen} title="Reports Awaiting Review" description={`${sorted.length} report${sorted.length === 1 ? "" : "s"}`}>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team reports to review yet.</p>
        ) : (
          sorted.map(renderRow)
        )}
      </DashboardWidgetFocusDialog>
    </Card>
  );
}
