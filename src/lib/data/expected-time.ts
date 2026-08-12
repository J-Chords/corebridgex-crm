export type ExpectedTimeUnit = "minutes" | "hours" | "days";

/** A "day" is one 8-hour workday, not a 24-hour calendar day — matches how `expectedHours` was always meant as tracked work time, not wall-clock time, the same convention PSA/time-tracking tools (Harvest, Toggl) use for capacity math. */
const MINUTES_PER_UNIT: Record<ExpectedTimeUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 8,
};

export const EXPECTED_TIME_UNIT_ITEMS: Record<ExpectedTimeUnit, string> = {
  minutes: "Minutes",
  hours: "Hours",
  days: "Days",
};

export function toMinutes(value: number, unit: ExpectedTimeUnit): number {
  return Math.round(value * MINUTES_PER_UNIT[unit]);
}

export function fromMinutes(minutes: number, unit: ExpectedTimeUnit): number {
  return roundTo(minutes / MINUTES_PER_UNIT[unit], 2);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Which unit to show an existing stored value in — whichever is the "roundest" fit, so a value stored from a "2 days" input redisplays as "2 days," not "2880 minutes." Falls back to minutes when nothing divides evenly. */
export function bestUnitFor(minutes: number): ExpectedTimeUnit {
  if (minutes !== 0 && minutes % MINUTES_PER_UNIT.days === 0) return "days";
  if (minutes !== 0 && minutes % MINUTES_PER_UNIT.hours === 0) return "hours";
  return "minutes";
}

export function unitLabel(unit: ExpectedTimeUnit, value: number): string {
  if (unit === "days") return value === 1 ? "day" : "days";
  if (unit === "hours") return value === 1 ? "hour" : "hours";
  return value === 1 ? "minute" : "minutes";
}

/** Read-only display, everywhere an expected-time value is just shown, not edited — auto-picks the best-fit unit via `bestUnitFor`. */
export function formatExpectedTime(minutes: number | null, fallback = "Not set"): string {
  if (minutes == null) return fallback;
  const unit = bestUnitFor(minutes);
  return formatMinutesAs(minutes, unit);
}

/**
 * Same read-only display as `formatExpectedTime`, but in a caller-chosen unit instead of the
 * best-fit one — for comparing two values (e.g. "estimated" vs. "actual") that must share a common
 * unit to be legible together. Without this, an estimate entered as "1 day" and an actual of 180
 * minutes would independently best-fit to "1 day" and "3h" — technically correct individually, but
 * unreadable side by side (see `BudgetBar`'s "Estimated: ... · Actual: ..." headline).
 */
export function formatMinutesAs(minutes: number, unit: ExpectedTimeUnit): string {
  const value = fromMinutes(minutes, unit);
  return `${value} ${unitLabel(unit, value)}`;
}
