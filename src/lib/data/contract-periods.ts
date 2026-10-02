import type { ProjectContractPeriod } from "@/lib/data/types";
import { parseDateOnly, formatDateOnly, todayDateOnly } from "@/lib/planner-dates";

/**
 * Phase 6A (CD-215) — the calendar-year contract-period model locked by the Product Owner: every
 * recorded period ends December 31 of its own start year (`2026-05-04` → `2026-12-31`;
 * `2026-12-31` → `2026-12-31`; `2027-01-01` → `2027-12-31`). Date-only arithmetic throughout, via
 * `planner-dates.ts`'s local Y/M/D primitives — never `.toISOString().slice(0, 10)`.
 */
export function periodEndForStart(periodStart: string): string {
  const start = parseDateOnly(periodStart);
  return formatDateOnly(new Date(start.getFullYear(), 11, 31));
}

/** True when `today` (local calendar date) falls within the period, inclusive on both ends. */
export function isProjectContractPeriodCurrent(period: Pick<ProjectContractPeriod, "periodStart" | "periodEnd">, today: string = todayDateOnly()): boolean {
  return period.periodStart <= today && today <= period.periodEnd;
}

/**
 * The one recorded period containing `today`, or `null` if none does — deliberately derived fresh
 * from dates every time, never a stored `isCurrent` flag (which could silently go stale). Callers
 * must never fall back to `Client Since`, `company.renewalDate`, or the legacy
 * `contractMonths`/`contractEndDate` pair when this returns `null` — "no current period" is a real,
 * displayable state ("Not recorded"), not an error to paper over.
 */
export function getCurrentProjectContractPeriod(
  periods: ProjectContractPeriod[],
  today: string = todayDateOnly()
): ProjectContractPeriod | null {
  return periods.find((p) => isProjectContractPeriodCurrent(p, today)) ?? null;
}
