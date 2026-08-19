/**
 * Phase 8D (Planner) — date-only arithmetic that never round-trips through `Date`'s UTC-based
 * `toISOString()`/ISO-string constructor, which is what actually causes a date-only value to shift
 * onto the previous/next day depending on the browser's timezone offset. `Task.dueDate` is a plain
 * `YYYY-MM-DD` business date (no time-of-day, no timezone) — every function here parses/formats it
 * through `Date`'s *local* year/month/day constructor and getters only, so a date-only string always
 * round-trips to itself regardless of where the browser is running.
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
