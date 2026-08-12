import type { TimeEntry } from "./types";

/**
 * Sums `durationMinutes` backward through a chain of paused→resumed entries — the accumulated time
 * from earlier segments of the same working session, so a resumed timer's live elapsed display can
 * continue counting up from where it left off instead of restarting at zero. Walks purely through
 * `continuesFromEntryId` links within the already-fetched `entries` array (no new fetch); stops at
 * the first entry with no link. `fromEntryId` is excluded from the sum — pass the *currently
 * running* entry's own `continuesFromEntryId` to get "everything before this segment."
 */
export function sumChainMinutes(entries: TimeEntry[], fromEntryId: string | null): number {
  let total = 0;
  let currentId = fromEntryId;
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const entry = entries.find((e) => e.id === currentId);
    if (!entry) break;
    total += entry.durationMinutes ?? 0;
    currentId = entry.continuesFromEntryId;
  }

  return total;
}
