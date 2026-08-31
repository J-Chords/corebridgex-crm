/**
 * Phase 8D (Planner) — date-only arithmetic that never round-trips through `Date`'s UTC-based
 * `toISOString()`/ISO-string constructor, which is what actually causes a date-only value to shift
 * onto the previous/next day depending on the browser's timezone offset. `Task.dueDate` is a plain
 * `YYYY-MM-DD` business date (no time-of-day, no timezone) — every function here parses/formats it
 * through `Date`'s *local* year/month/day constructor and getters only, so a date-only string always
 * round-trips to itself regardless of where the browser is running.
 *
 * Phase 9C hotfix added `dateKeyFromTimestamp`/`localDayBoundsUtc` — the same local-calendar
 * discipline, but for classifying an absolute timestamp (a Time Entry's `startTime`, a Handoff's
 * `createdAt`, etc.) by which local work-day it falls on, and for turning a selected local day back
 * into the UTC instant range a `timestamptz` query needs. Daily Update is the first consumer; reuse
 * these rather than adding another competing date implementation.
 */

const PAD2 = (n: number) => String(n).padStart(2, "0");

/** Parses a `YYYY-MM-DD` string into a local `Date` (midnight local time) — never via `new Date(string)`, which parses date-only strings as UTC and can display as the previous day in a timezone west of UTC. */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Formats a local `Date` back to `YYYY-MM-DD` using local getters — never `.toISOString()`, which converts to UTC first and can shift the date. */
export function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${PAD2(date.getMonth() + 1)}-${PAD2(date.getDate())}`;
}

/** "Today" as a local `YYYY-MM-DD` — deliberately not `new Date().toISOString().slice(0, 10)` (that's a UTC date, which can already be tomorrow for a browser west of UTC in the evening). */
export function todayDateOnly(): string {
  return formatDateOnly(new Date());
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/** Monday of the week containing `date` — `getDay()` is 0=Sunday..6=Saturday, so Monday is day 1. */
export function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

/** The 7 local dates (Monday-first) of the week containing `date`. */
export function weekDates(date: Date): Date[] {
  const start = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** First of the month containing `date`. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * A Monday-first calendar grid for the month containing `date` — always a whole number of weeks
 * (5 or 6 rows), including the trailing days of the previous/next month needed to fill the first
 * and last rows, exactly like every standard month calendar.
 */
export function monthGridDates(date: Date): Date[] {
  const firstOfMonth = startOfMonth(date);
  const gridStart = startOfWeekMonday(firstOfMonth);
  const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const gridEnd = startOfWeekMonday(lastOfMonth);
  const lastRowEnd = addDays(gridEnd, 6);
  const totalDays = Math.round((lastRowEnd.getTime() - gridStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatShortDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Classifies an absolute timestamp (e.g. a Time Entry's `startTime`, a Task's `statusChangedAt`, a
 * Handoff's `createdAt`) by the LOCAL calendar date it falls on — the one correct way to answer
 * "which work day does this timestamp belong to," since the same instant can fall on different
 * calendar dates depending on timezone (`2026-08-21T00:30:00Z` is `2026-08-20` in
 * America/Toronto). Never use `timestamp.slice(0, 10)` for this — that reads the UTC date embedded
 * in the ISO string, not the viewer's local date. `new Date(isoTimestamp)` already parses to the
 * correct absolute instant; `formatDateOnly`'s local getters then read off the right calendar day.
 */
export function dateKeyFromTimestamp(isoTimestamp: string): string {
  return formatDateOnly(new Date(isoTimestamp));
}

/** The LOCAL calendar month (`YYYY-MM`) a timestamp falls on — the month-grouping counterpart of
 * `dateKeyFromTimestamp`, for surfaces that group by month (e.g. Project Completed Work) rather than
 * by day. Never `timestamp.slice(0, 7)` — same UTC-vs-local reasoning as `dateKeyFromTimestamp`. */
export function monthKeyFromTimestamp(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  return `${d.getFullYear()}-${PAD2(d.getMonth() + 1)}`;
}

/**
 * The local calendar day `dateKey` (`YYYY-MM-DD`), expressed as a half-open UTC instant range
 * (`startUtc <= timestamp < endUtc`) suitable for a Postgres `timestamptz` query — local midnight
 * at the start of `dateKey` through local midnight at the start of the following day, each
 * converted to its own UTC instant via `Date.toISOString()`. Never construct
 * `` `${dateKey}T00:00:00.000Z` `` for this — that's UTC midnight, not local midnight, and silently
 * misclassifies anything logged near midnight in a non-UTC timezone. Built from a calendar-day
 * increment (`addDays`, which uses `Date`'s own `setDate`), not raw millisecond arithmetic, so a
 * DST transition day still produces the correct (23- or 25-hour) window instead of a fixed 24h one.
 */
export function localDayBoundsUtc(dateKey: string): { startUtc: string; endUtc: string } {
  const start = parseDateOnly(dateKey);
  const end = addDays(start, 1);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}
