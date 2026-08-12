import Link from "next/link";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { formatRecurrenceDate, formatRecurrenceSummary } from "@/lib/data/recurrence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const MAX_ROWS = 5;

interface RecurringWorkDueCardProps {
  /** Already scoped to this viewer's own visible workstreams — pass the caller's own useWorkstreams() result. */
  workstreams: WorkstreamWithRelations[];
}

/** Recurring workstreams whose next occurrence is due now — a manual generate action lives on each workstream's own detail page, not inline here. */
export function RecurringWorkDueCard({ workstreams }: RecurringWorkDueCardProps) {
  const due = workstreams
    .filter((w) => w.recurrence?.isDue)
    .sort((a, b) => (a.recurrence!.nextOccurrenceDate ?? "").localeCompare(b.recurrence!.nextOccurrenceDate ?? ""))
    .slice(0, MAX_ROWS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recurring Work Due</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing due for regeneration right now.</p>
        ) : (
          due.map((workstream, i) => (
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
