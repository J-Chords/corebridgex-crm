"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { formatRecurrenceDate, formatRecurrenceSummary } from "@/lib/data/recurrence";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const MAX_ROWS = 5;

interface RecurringWorkDueCardProps {
  /** Already scoped to this viewer's own visible workstreams — pass the caller's own useWorkstreams() result. */
  workstreams: WorkstreamWithRelations[];
}

/** Recurring workstreams whose next occurrence is due now — a manual generate action lives on each workstream's own detail page, not inline here. */
export function RecurringWorkDueCard({ workstreams }: RecurringWorkDueCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const due = workstreams
    .filter((w) => w.recurrence?.isDue)
    .sort((a, b) => (a.recurrence!.nextOccurrenceDate ?? "").localeCompare(b.recurrence!.nextOccurrenceDate ?? ""));
  const overflow = due.length - MAX_ROWS;

  function renderRow(workstream: WorkstreamWithRelations, i: number) {
    return (
      <Link
        key={workstream.id}
        href={`/dashboard/workstreams/${workstream.id}`}
        className={cn(
          "group/row -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 hover:no-underline",
          STAGGER_ITEM_CLASS
        )}
        style={staggerDelay(i)}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium group-hover/row:underline">{workstream.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {workstream.company.name} · {formatRecurrenceSummary(workstream.recurrence!.frequency, workstream.recurrence!.customIntervalDays)}
          </span>
        </div>
        <span className="shrink-0 text-xs font-medium text-warning">
          Due {formatRecurrenceDate(workstream.recurrence!.nextOccurrenceDate!)}
        </span>
      </Link>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recurring Work Due</CardTitle>
        <CardAction>
          <CardExpandButton onClick={() => setDrawerOpen(true)} label="Expand Recurring Work Due" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due for regeneration right now.</p>
        ) : (
          <>
            {due.slice(0, MAX_ROWS).map(renderRow)}
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

      <DashboardWidgetFocusDialog open={drawerOpen} onOpenChange={setDrawerOpen} title="Recurring Work Due" description={`${due.length} service${due.length === 1 ? "" : "s"}`}>
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due for regeneration right now.</p>
        ) : (
          due.map(renderRow)
        )}
      </DashboardWidgetFocusDialog>
    </Card>
  );
}
