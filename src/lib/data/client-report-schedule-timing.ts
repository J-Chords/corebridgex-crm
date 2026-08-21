/**
 * Phase 9F — mock-provider equivalent of `compute_next_client_report_run`
 * (20260821150000_client_report_schedules.sql). The real Supabase RPC asks Postgres's own timezone
 * database for the correct UTC instant of a given local wall-clock moment (`AT TIME ZONE`), which is
 * inherently DST-safe; JS has no equivalent built-in, so this uses the standard
 * `Intl.DateTimeFormat`-based iterative correction technique: format a guessed instant in the target
 * zone, measure the drift between the intended wall-clock time and what that guess actually reads
 * as, and correct by that drift. Two iterations comfortably cover every real DST-transition case
 * (the second iteration converges because the offset from iteration 1 is already within the same
 * or adjacent DST regime as the true answer).
 */

function partsInZone(instant: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour") === "24" ? 0 : Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/** Converts a local wall-clock (year, month, day, hour, minute) IN `timeZone` to its UTC instant. */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 2; i++) {
    const seen = partsInZone(guess, timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const intendedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const driftMs = intendedAsUtc - seenAsUtc;
    if (driftMs === 0) break;
    guess = new Date(guess.getTime() + driftMs);
  }
  return guess;
}

/**
 * Next occurrence of (weekday, localTime) in timezone, strictly after `after` — same weekly-only
 * semantics as the SQL function (never daily/monthly/quarterly). `weekday`: 0=Sunday..6=Saturday.
 * `localTime`: "HH:MM".
 */
export function computeNextClientReportRun(weekday: number, localTime: string, timezone: string, after: Date = new Date()): Date {
  const [hourStr, minuteStr] = localTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const todayParts = partsInZone(after, timezone);
  const dayDiff = (weekday - todayParts.weekday + 7) % 7;

  let candidateDay = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
  candidateDay.setUTCDate(candidateDay.getUTCDate() + dayDiff);
  let candidate = zonedTimeToUtc(candidateDay.getUTCFullYear(), candidateDay.getUTCMonth() + 1, candidateDay.getUTCDate(), hour, minute, timezone);

  if (candidate.getTime() <= after.getTime()) {
    candidateDay = new Date(candidateDay.getTime());
    candidateDay.setUTCDate(candidateDay.getUTCDate() + 7);
    candidate = zonedTimeToUtc(candidateDay.getUTCFullYear(), candidateDay.getUTCMonth() + 1, candidateDay.getUTCDate(), hour, minute, timezone);
  }
  return candidate;
}

/** The local calendar date (YYYY-MM-DD) of `instant` in `timezone` — used for the previous-7-
 * completed-days range computation, same convention as `visit_date`/`dateKeyFromTimestamp`. */
export function localDateKeyInZone(instant: Date, timezone: string): string {
  const p = partsInZone(instant, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Previous SEVEN COMPLETED local calendar days ending the local day immediately before `now` in
 * `timezone` (Section 32's exact locked semantics) — e.g. a Monday run covers the prior Mon-Sun. */
export function computeScheduledReportRange(timezone: string, now: Date = new Date()): { rangeStart: string; rangeEnd: string } {
  const todayKey = localDateKeyInZone(now, timezone);
  const rangeEnd = addDaysToDateKey(todayKey, -1);
  const rangeStart = addDaysToDateKey(rangeEnd, -6);
  return { rangeStart, rangeEnd };
}
