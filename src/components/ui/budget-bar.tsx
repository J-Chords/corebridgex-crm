import type { CSSProperties } from "react";
import type { TimeBudget, BudgetStatus } from "@/lib/data/time-budget";
import { bestUnitFor, formatMinutesAs } from "@/lib/data/expected-time";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_META: Record<BudgetStatus, { label: string; barClass: string; badgeVariant: "success" | "warning" | "destructive" | "neutral" }> = {
  under: { label: "Under budget", barClass: "bg-success", badgeVariant: "success" },
  near: { label: "Near budget", barClass: "bg-warning", badgeVariant: "warning" },
  over: { label: "Over budget", barClass: "bg-destructive", badgeVariant: "destructive" },
  "no-budget": { label: "No budget set", barClass: "bg-muted-foreground/30", badgeVariant: "neutral" },
};

function hoursLabel(hours: number) {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}h`;
}

/**
 * Both sides of a comparison must share one unit to be legible together — independently best-fitting
 * an estimate of "1 day" and an actual of 180 minutes would read as "1 day" next to "3h," which is
 * technically correct but looks like a mismatch. Anchoring the shared unit to the estimate (the value
 * someone deliberately chose a unit for) keeps that side's number always looking exactly as entered.
 */
function sharedUnitFor(budget: TimeBudget) {
  return bestUnitFor(budget.expectedMinutes ?? budget.actualMinutes);
}

/** Prominent budget bar with the full billable/non-billable split — for a workstream's detail page, a client-level roll-up, or a single task's estimate vs. actual. Every number (expected, actual, percent, split) is always on screen, never hidden behind a hover. */
export function BudgetBar({ budget, className }: { budget: TimeBudget; className?: string }) {
  const meta = STATUS_META[budget.status];
  const unit = sharedUnitFor(budget);
  const actualLabel = formatMinutesAs(budget.actualMinutes, unit);

  if (budget.status === "no-budget" || budget.expectedMinutes == null) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {budget.actualMinutes > 0 ? (
              <>
                Actual: <span className="font-semibold">{actualLabel}</span>
              </>
            ) : (
              "No time logged yet"
            )}
          </span>
          <Badge variant="neutral">No estimate set</Badge>
        </div>
        <BillableSplit budget={budget} />
      </div>
    );
  }

  const estimatedLabel = formatMinutesAs(budget.expectedMinutes, unit);
  const fillPercent = Math.min(budget.percent ?? 0, 100);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          Estimated: <span className="font-semibold text-foreground">{estimatedLabel}</span>
          <span className="mx-1.5 text-muted-foreground/60">·</span>
          Actual: <span className="font-semibold text-foreground">{actualLabel}</span>
          <span className="text-muted-foreground"> — {budget.percent}%, {meta.label.toLowerCase()}</span>
        </span>
        <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Time budget</span>
        <div
          role="progressbar"
          aria-valuenow={budget.percent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Time logged vs. estimated"
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", meta.barClass)}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>
      <BillableSplit budget={budget} />
    </div>
  );
}

function BillableSplit({ budget }: { budget: TimeBudget }) {
  if (budget.actualHours === 0) {
    return <p className="text-xs text-muted-foreground">No time logged yet.</p>;
  }
  const billablePercent = Math.round((budget.billableHours / budget.actualHours) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Billable split</span>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-info" style={{ width: `${billablePercent}%` }} />
        <div className="h-full bg-muted-foreground/30" style={{ width: `${100 - billablePercent}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-info" aria-hidden="true" />
          {hoursLabel(budget.billableHours)} billable
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          {hoursLabel(budget.nonBillableHours)} non-billable
        </span>
      </div>
    </div>
  );
}

/** Slim bar for anywhere workstreams/tasks are listed — headline number + bar only; full billable split lives on the detail page. */
export function BudgetBarCompact({ budget, className, style }: { budget: TimeBudget; className?: string; style?: CSSProperties }) {
  const meta = STATUS_META[budget.status];
  const hasBudget = budget.status !== "no-budget" && budget.expectedMinutes != null;
  const fillPercent = hasBudget ? Math.min(budget.percent ?? 0, 100) : 0;
  const unit = sharedUnitFor(budget);

  return (
    <div className={cn("flex flex-col gap-1", className)} style={style}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Time budget</span>
        <span className="font-mono text-muted-foreground">
          {hasBudget && budget.expectedMinutes != null
            ? `${formatMinutesAs(budget.actualMinutes, unit)}/${formatMinutesAs(budget.expectedMinutes, unit)} · ${budget.percent}%`
            : "No estimate set"}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={budget.percent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Time logged vs. expected"
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {hasBudget && (
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", meta.barClass)}
            style={{ width: `${fillPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}
