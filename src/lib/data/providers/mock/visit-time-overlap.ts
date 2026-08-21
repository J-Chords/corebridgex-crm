import type { TimeEntry, VisitEntry } from "../../types";

/**
 * Phase 9 final integrity hotfix — mock-provider mirror of the two hosted SQL helpers
 * (`visit_entry_overlaps`/`time_interval_overlaps_visit`, 20260821160000). Kept in one shared
 * module so both `mock-visit-entries-provider.ts` and `mock-time-entries-provider.ts` use the
 * IDENTICAL overlap rule — the invariant is bidirectional (no Visit may overlap Task Time, no Task
 * Time may overlap a Visit, regardless of which was created first), so a single shared
 * implementation is what actually guarantees that, rather than two hand-written copies drifting.
 */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Does `[startAt, endAt)` for `userId` overlap any of their OTHER Visit Entries, or any of their
 * Time Entries? A GENUINELY RUNNING Time Entry (`durationMinutes` null — the app's own established
 * "running" indicator, mirrored from `time_entries_one_running_per_user`) is treated as OPEN-ENDED
 * into the future — never as ending "now" — because its true end is genuinely unknown at Visit-
 * creation time: a running 09:00 timer could still be running at 10:30 when a 10:00 Visit is being
 * entered, and must block that Visit rather than silently allowing it.
 *
 * This is deliberately NOT the same thing as "`endTime` is null": a completed duration-only manual
 * entry (a real, finished span with a real `durationMinutes` but no specific clock `endTime`) has a
 * well-defined actual end at `startTime + durationMinutes`, and must be checked against that real
 * span, never treated as open-ended (an earlier version of this function conflated the two — caught
 * by the hosted SQL equivalent's own probe and fixed in both places together). Mirrors
 * `visit_entry_overlaps`.
 *
 * A PLANNED Visit (`status !== "completed"`, `startAt`/`endAt` both null) is excluded entirely — it
 * has no actual interval yet, so it must never block or be blocked by anything. Mirrors the hosted
 * `and v.status = 'completed'` filter added in 20260821180000; without it, a naive `new
 * Date(null)`-style read would be meaningless, and worse, the SQL equivalent (`tstzrange(NULL,
 * NULL)`) is actually an INFINITE range in Postgres, not "no interval" — the mock must reproduce the
 * "planned reserves nothing" behavior explicitly rather than by accident.
 */
export function visitOverlapsExisting(
  userId: string,
  startAt: string,
  endAt: string,
  excludeVisitId: string | null,
  visitEntries: VisitEntry[],
  timeEntries: TimeEntry[]
): boolean {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const visitConflict = visitEntries.some((v) => {
    if (v.userId !== userId) return false;
    if (v.status !== "completed" || v.startAt == null || v.endAt == null) return false;
    if (excludeVisitId && v.id === excludeVisitId) return false;
    return rangesOverlap(new Date(v.startAt).getTime(), new Date(v.endAt).getTime(), start, end);
  });
  if (visitConflict) return true;
  return timeEntries.some((te) => {
    if (te.userId !== userId) return false;
    const teStart = new Date(te.startTime).getTime();
    const teEnd =
      te.durationMinutes == null
        ? Infinity
        : te.endTime
          ? new Date(te.endTime).getTime()
          : teStart + te.durationMinutes * 60000;
    return rangesOverlap(teStart, teEnd, start, end);
  });
}

/**
 * Does `[start, end)` for `userId` overlap any of their COMPLETED Visits? A completed Visit always
 * has a real, already-finalized end (never "running"), so there's no open-ended concern on this
 * side. Pass `start === end` for a point-in-time check (e.g. "is right now inside a logged Visit?" —
 * used before starting/resuming a timer). A Planned Visit (no actual interval yet) is excluded —
 * mirrors `time_interval_overlaps_visit`.
 */
export function timeIntervalOverlapsVisit(userId: string, start: string, end: string, visitEntries: VisitEntry[]): boolean {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return visitEntries.some((v) => {
    if (v.userId !== userId) return false;
    if (v.status !== "completed" || v.startAt == null || v.endAt == null) return false;
    const vs = new Date(v.startAt).getTime();
    const ve = new Date(v.endAt).getTime();
    if (s === e) return vs <= s && s < ve;
    return rangesOverlap(vs, ve, s, e);
  });
}
