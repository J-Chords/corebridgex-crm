import type { RecurrenceFrequency } from "./types/recurrence";

export interface RecurrenceConfig {
  frequency: RecurrenceFrequency;
  /** Fixed reference date the cadence steps from — never moves once set, even as occurrences get generated. */
  anchorDate: string;
  /** Only meaningful (and required to actually compute a next date) when frequency is "custom". */
  customIntervalDays: number | null;
}

/**
 * Everything a screen needs to show "is this recurring, and when's next" for one workstream —
 * computed on every read, never stored. No hidden scoring: every field here is a plain fact.
 */
export interface WorkstreamRecurrenceInfo extends RecurrenceConfig {
  /** False once a later occurrence has already been generated from this workstream — the newer one carries the live indicator instead. */
  isActive: boolean;
  /** Null when superseded, or when a custom frequency has no interval day-count set. */
  nextOccurrenceDate: string | null;
  /** True when nextOccurrenceDate is today or earlier. Always false when nextOccurrenceDate is null. */
  isDue: boolean;
}

export const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

/** Safety valve only — real data should never need anywhere close to this many steps. */
const MAX_STEPS = 2000;

function toParts(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function fromParts(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Days-from-start offset -> an actual calendar date, computed in local date parts to avoid UTC-shift surprises. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const { y, m, d } = toParts(dateStr);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return fromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Adds whole months, clamping the day to the target month's length (e.g. Jan 31 + 1 month -> Feb 28/29, not March). */
export function addMonthsClamped(dateStr: string, months: number): string {
  const { y, m, d } = toParts(dateStr);
  const totalMonths = y * 12 + (m - 1) + months;
  const ny = Math.floor(totalMonths / 12);
  const nm = (totalMonths % 12) + 1;
  return fromParts(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

function stepOnce(dateStr: string, config: RecurrenceConfig): string | null {
  switch (config.frequency) {
    case "weekly":
      return addDaysToDateString(dateStr, 7);
    case "monthly":
      return addMonthsClamped(dateStr, 1);
    case "quarterly":
      return addMonthsClamped(dateStr, 3);
    case "yearly":
      return addMonthsClamped(dateStr, 12);
    case "custom":
      return config.customIntervalDays && config.customIntervalDays > 0
        ? addDaysToDateString(dateStr, config.customIntervalDays)
        : null;
  }
}

/**
 * Steps forward from `config.anchorDate` by whole cadence intervals until finding the first date
 * strictly after `afterDate` — so a workstream's "next occurrence" is always aligned to the fixed
 * anchor, not to wherever this particular instance happened to start. Returns null only when a
 * custom cadence has no interval day-count configured yet (an honest "can't compute this" signal,
 * never a silent guess).
 */
export function computeNextOccurrenceDate(config: RecurrenceConfig, afterDate: string): string | null {
  let current = config.anchorDate;
  let steps = 0;
  while (current <= afterDate) {
    const next = stepOnce(current, config);
    if (next == null) return null;
    current = next;
    steps += 1;
    if (steps > MAX_STEPS) return null;
  }
  return current;
}

/** Everything a workstream detail/list row needs — bundles the chain-lookup and due-check the UI would otherwise have to re-derive itself. */
export function computeWorkstreamRecurrence(
  config: RecurrenceConfig | null,
  workstreamStartDate: string | null,
  hasSuccessor: boolean,
  today: string
): WorkstreamRecurrenceInfo | null {
  if (!config) return null;
  if (hasSuccessor) {
    return { ...config, isActive: false, nextOccurrenceDate: null, isDue: false };
  }
  const nextOccurrenceDate = computeNextOccurrenceDate(config, workstreamStartDate ?? config.anchorDate);
  return {
    ...config,
    isActive: true,
    nextOccurrenceDate,
    isDue: nextOccurrenceDate != null && nextOccurrenceDate <= today,
  };
}

function formatDate(dateStr: string): string {
  const { y, m, d } = toParts(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Payroll 2026" period naming — "August 2026" / "Q3 2026" / "2026" / a plain date for weekly/custom, which have no natural period name. */
export function formatPeriodLabel(dateStr: string, frequency: RecurrenceFrequency | null): string {
  const { y, m, d } = toParts(dateStr);
  if (frequency === "monthly") {
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (frequency === "quarterly") {
    return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  }
  if (frequency === "yearly") {
    return String(y);
  }
  if (frequency === "weekly") {
    return `Week of ${formatDate(fromParts(y, m, d))}`;
  }
  if (frequency === "custom") {
    return formatDate(dateStr);
  }
  return String(y);
}

/** "Recurs monthly" / "Recurs every 45 days" — the plain-English cadence description used everywhere a recurrence indicator renders. */
export function formatRecurrenceSummary(frequency: RecurrenceFrequency, customIntervalDays: number | null): string {
  if (frequency === "custom") {
    return customIntervalDays && customIntervalDays > 0 ? `Recurs every ${customIntervalDays} days` : "Recurs (interval not set)";
  }
  return `Recurs ${FREQUENCY_LABEL[frequency].toLowerCase()}`;
}

export { formatDate as formatRecurrenceDate };

/** Whole calendar days between two YYYY-MM-DD dates, computed in local date parts to avoid UTC-shift/DST surprises. */
export function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = toParts(fromDateStr);
  const to = toParts(toDateStr);
  const fromMs = new Date(from.y, from.m - 1, from.d).getTime();
  const toMs = new Date(to.y, to.m - 1, to.d).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}
