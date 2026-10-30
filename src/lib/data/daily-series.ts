import { todayDateOnly, parseDateOnly, addDays, formatDateOnly, dateKeyFromTimestamp } from "@/lib/planner-dates";

export interface DaySeriesPoint {
  dateKey: string;
  label: string;
  value: number;
  isToday: boolean;
}

/**
 * Whether `timestamp`'s own LOCAL calendar day falls within the last `days` local calendar days
 * ending today (inclusive of today). This is the exact membership test `buildDailySeries` uses for
 * its own buckets — exported so a caller can filter/count the same real records by the identical
 * rule (e.g. a caption's "across N entries" count), rather than filtering by a *different* window
 * (a rolling `now - N*24h` cutoff) and risking a silent mismatch between what's counted and what's
 * actually bucketed/charted. Never mix this with a rolling-hours cutoff for the same display.
 */
export function isWithinLastNLocalDays(timestamp: string, days = 7): boolean {
  const today = parseDateOnly(todayDateOnly());
  const cutoffKey = formatDateOnly(addDays(today, -(days - 1)));
  return dateKeyFromTimestamp(timestamp) >= cutoffKey;
}

/**
 * Buckets already-real per-event records (a completed Task's `statusChangedAt`, a Time Entry's
 * `startTime`, etc.) into the last `days` local calendar days ending today, via the same
 * `dateKeyFromTimestamp` local-date rule the Weekly Client Report generator uses
 * (`client-report-weekly.ts`) — never a fabricated or interpolated point. A day with no matching
 * records is a real zero, not a gap.
 */
export function buildDailySeries<T>(
  items: T[],
  getTimestamp: (item: T) => string,
  getValue: (item: T) => number,
  days = 7
): DaySeriesPoint[] {
  const today = parseDateOnly(todayDateOnly());
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(formatDateOnly(addDays(today, -i)), 0);
  }

  for (const item of items) {
    const key = dateKeyFromTimestamp(getTimestamp(item));
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key)! + getValue(item));
    }
  }

  const todayKey = formatDateOnly(today);
  return Array.from(buckets.entries()).map(([dateKey, value]) => ({
    dateKey,
    label: parseDateOnly(dateKey).toLocaleDateString("en-US", { weekday: "short" }),
    value,
    isToday: dateKey === todayKey,
  }));
}
