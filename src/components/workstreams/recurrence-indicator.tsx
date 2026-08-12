import { Repeat } from "lucide-react";
import type { WorkstreamRecurrenceInfo } from "@/lib/data/recurrence";
import { formatRecurrenceDate, formatRecurrenceSummary } from "@/lib/data/recurrence";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Plain-English "next" fact — never hides the raw date, even once it's overdue. */
function nextOccurrenceText(recurrence: WorkstreamRecurrenceInfo): string {
  if (!recurrence.isActive) return "Superseded by a later occurrence";
  if (recurrence.nextOccurrenceDate == null) return "Interval not set";
  const date = formatRecurrenceDate(recurrence.nextOccurrenceDate);
  return recurrence.isDue ? `Due now — was due ${date}` : `Next: ${date}`;
}

/** Prominent version for the workstream detail page — a cadence badge plus the plain-English next-occurrence fact beside it. */
export function RecurrenceIndicator({
  recurrence,
  className,
}: {
  recurrence: WorkstreamRecurrenceInfo;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge variant={recurrence.isDue ? "warning" : "neutral"} className="gap-1">
        <Repeat className="size-3" aria-hidden="true" />
        {formatRecurrenceSummary(recurrence.frequency, recurrence.customIntervalDays)}
      </Badge>
      <span className={cn("text-xs", recurrence.isDue ? "font-medium text-warning" : "text-muted-foreground")}>
        {nextOccurrenceText(recurrence)}
      </span>
    </div>
  );
}

/** Slim one-line caption for anywhere workstreams are listed. */
export function RecurrenceIndicatorCompact({
  recurrence,
  className,
}: {
  recurrence: WorkstreamRecurrenceInfo;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-xs",
        recurrence.isDue ? "font-medium text-warning" : "text-muted-foreground",
        className
      )}
    >
      <Repeat className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {formatRecurrenceSummary(recurrence.frequency, recurrence.customIntervalDays)} ·{" "}
        {recurrence.isActive
          ? recurrence.isDue
            ? "due now"
            : recurrence.nextOccurrenceDate
              ? `next: ${formatRecurrenceDate(recurrence.nextOccurrenceDate)}`
              : "interval not set"
          : "superseded"}
      </span>
    </p>
  );
}
