export type BudgetStatus = "no-budget" | "under" | "near" | "over";

/** No hidden scoring — every number here (expected, actual, billable split, percent) is shown as-is, never rolled into an opaque score. Domain-agnostic: used for a workstream's own budget, a client-level rollup across its workstreams, and a single task's estimate vs. actual. */
export interface TimeBudget {
  status: BudgetStatus;
  /** Normalized to minutes regardless of which unit (minutes/hours/days) the estimate was entered in — see `src/lib/data/expected-time.ts` for display. */
  expectedMinutes: number | null;
  /** Same totals as the Hours fields below, in minutes — lets a display pick one common unit (via `bestUnitFor`/`formatMinutesAs`) for both the estimate and the actual instead of each independently best-fitting to a different one (e.g. "1 day expected" next to "3.7h logged"). */
  actualMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  actualHours: number;
  billableHours: number;
  nonBillableHours: number;
  /** Rounded whole-percent of expected; null when there's no budget to compare against. */
  percent: number | null;
}

export interface TimeBudgetInput {
  expectedMinutes: number | null;
  actualMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
}

/**
 * Every threshold that decides a budget status lives here, and only here — tune these constants to
 * change sensitivity, nothing else needs to change.
 */
const NEAR_BUDGET_PERCENT = 85;

function statusForPercent(percent: number): BudgetStatus {
  if (percent > 100) return "over";
  if (percent >= NEAR_BUDGET_PERCENT) return "near";
  return "under";
}

/** Computed on every read from a workstream's or task's own time entries — never stored. Takes plain numbers, not the provider layer, so it stays a pure, easily-testable function. */
export function computeWorkstreamBudget(hours: TimeBudgetInput): TimeBudget {
  const actualHours = hours.actualMinutes / 60;
  const billableHours = hours.billableMinutes / 60;
  const nonBillableHours = hours.nonBillableMinutes / 60;
  const minutes = {
    actualMinutes: hours.actualMinutes,
    billableMinutes: hours.billableMinutes,
    nonBillableMinutes: hours.nonBillableMinutes,
  };

  if (hours.expectedMinutes == null || hours.expectedMinutes <= 0) {
    return { status: "no-budget", expectedMinutes: null, ...minutes, actualHours, billableHours, nonBillableHours, percent: null };
  }

  const percent = Math.round((hours.actualMinutes / hours.expectedMinutes) * 100);
  return {
    status: statusForPercent(percent),
    expectedMinutes: hours.expectedMinutes,
    ...minutes,
    actualHours,
    billableHours,
    nonBillableHours,
    percent,
  };
}

export interface BudgetRollup extends TimeBudget {
  /** How many of the rolled-up workstreams actually have a budget set — surfaced so a partial rollup is never mistaken for a complete one. */
  workstreamsWithBudget: number;
  totalWorkstreams: number;
}

/** Client-level roll-up — sums actual hours across every workstream, but only sums expected minutes across the ones that actually have a budget set, so the percent never silently compares against a partial baseline without saying so. */
export function computeBudgetRollup(budgets: TimeBudget[]): BudgetRollup {
  const withBudget = budgets.filter((b) => b.expectedMinutes != null);
  const expectedMinutes = withBudget.length > 0 ? withBudget.reduce((sum, b) => sum + (b.expectedMinutes ?? 0), 0) : null;
  const actualMinutes = budgets.reduce((sum, b) => sum + b.actualMinutes, 0);
  const billableMinutes = budgets.reduce((sum, b) => sum + b.billableMinutes, 0);
  const nonBillableMinutes = budgets.reduce((sum, b) => sum + b.nonBillableMinutes, 0);
  const minutes = { actualMinutes, billableMinutes, nonBillableMinutes };
  const hours = { actualHours: actualMinutes / 60, billableHours: billableMinutes / 60, nonBillableHours: nonBillableMinutes / 60 };

  const base = { workstreamsWithBudget: withBudget.length, totalWorkstreams: budgets.length };

  if (expectedMinutes == null) {
    return { status: "no-budget", expectedMinutes: null, ...minutes, ...hours, percent: null, ...base };
  }

  const percent = Math.round((actualMinutes / expectedMinutes) * 100);
  return { status: statusForPercent(percent), expectedMinutes, ...minutes, ...hours, percent, ...base };
}
