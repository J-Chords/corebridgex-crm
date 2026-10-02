import type { ProjectContractPeriod, ProjectStatus } from "@/lib/data/types";
import { parseDateOnly, formatDateOnly, todayDateOnly, addDays } from "@/lib/planner-dates";

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

/**
 * Phase 6B (CD-216) — the one period in a Project's chain that nothing else has renewed from (the
 * chain's own "leaf"). A chain is always linear (one root, one successor per predecessor — enforced
 * by the Phase-6A DB invariants), so there is at most one such period. `null` when the Project has no
 * recorded periods at all. Renewal always extends from this period, never from an arbitrary one the
 * caller names.
 */
export function getLatestProjectContractPeriod(periods: ProjectContractPeriod[]): ProjectContractPeriod | null {
  if (periods.length === 0) return null;
  const referencedIds = new Set(
    periods.map((p) => p.renewedFromPeriodId).filter((id): id is string => id !== null)
  );
  return periods.find((p) => !referencedIds.has(p.id)) ?? null;
}

export type ProjectContractPeriodDisplayState = "past" | "current" | "upcoming";

/**
 * Phase 6B (CD-216) — purely presentational, never a stored DB value (locked model section M: "Do
 * not store current/upcoming/past status"). A period recorded early for next year renders Upcoming
 * right up until its own `periodStart`, at which point it becomes Current — the still-active prior
 * period remains Current until its own `periodEnd`, never superseded early just because a successor
 * already exists.
 */
export function getProjectContractPeriodDisplayState(
  period: Pick<ProjectContractPeriod, "periodStart" | "periodEnd">,
  today: string = todayDateOnly()
): ProjectContractPeriodDisplayState {
  if (today < period.periodStart) return "upcoming";
  if (today > period.periodEnd) return "past";
  return "current";
}

/**
 * Phase 6B (CD-216) — the server-derived successor of `leaf`: start = `leaf.periodEnd + 1 day`
 * (always January 1, since every period ends December 31), end = December 31 of that same year.
 * Callers never accept or compute these dates from client input — see
 * `renew_project_contract_period`'s own doc comment.
 */
export function nextContractPeriodFrom(leaf: Pick<ProjectContractPeriod, "periodEnd">): {
  periodStart: string;
  periodEnd: string;
} {
  const periodStart = formatDateOnly(addDays(parseDateOnly(leaf.periodEnd), 1));
  return { periodStart, periodEnd: periodEndForStart(periodStart) };
}

/**
 * Phase 6B (CD-216), locked model section K — a contract period may be RENEWED only while the
 * Project is Active or On Hold. Never blocks the separate "record the first period" action (section
 * L — that's factual history maintenance, not a lifecycle transition) and never blocks correction/
 * removal (section 2.4 — "Lifecycle does NOT block correction").
 */
export function isProjectRenewalEligibleStatus(status: ProjectStatus): boolean {
  return status === "active" || status === "on-hold";
}

/** The one shared "why can't I renew this contract" explanation — mirrors
 * `projectNotActiveMessage`'s own convention (`src/lib/data/project-display.ts`), kept as a separate
 * function since renewal eligibility (Active OR On Hold) is a different, wider boundary than "active
 * for new work" (Active only). */
export function projectRenewalNotEligibleMessage(status: ProjectStatus): string {
  switch (status) {
    case "completed":
      return "This project is completed — return it to Active or On Hold to renew its contract.";
    case "cancelled":
      return "This project is canceled — return it to Active or On Hold to renew its contract.";
    case "archived":
      return "This project is archived — reactivate it to renew its contract.";
    case "trash":
      return "This project is in Trash — restore it first.";
    default:
      return "This project must be Active or On Hold to renew its contract.";
  }
}
