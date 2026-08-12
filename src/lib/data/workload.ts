export type WorkloadLevel = "available" | "busy" | "at-capacity";

export interface Workload {
  level: WorkloadLevel;
  label: string;
}

/**
 * Simple, transparent tiering by active (non-done) task count — same "named constants, no
 * black box" philosophy as `computeClientHealth`. There's no per-person capacity/target field in
 * the data model, so this deliberately doesn't compute a percentage against an invented baseline —
 * just a plain-English read of real task counts.
 */
const AVAILABLE_MAX = 2;
const BUSY_MAX = 5;

export function computeWorkload(activeTaskCount: number): Workload {
  if (activeTaskCount <= AVAILABLE_MAX) return { level: "available", label: "Available" };
  if (activeTaskCount <= BUSY_MAX) return { level: "busy", label: "Busy" };
  return { level: "at-capacity", label: "At capacity" };
}
