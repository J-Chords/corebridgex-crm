import type { TaskStatus } from "@/lib/data/types";

/**
 * Phase 5 (CD-214) — the single canonical Task status order. Every status-ordered surface
 * (pickers, filters, grouping, the donut, Board, My Day) should derive from this rather than
 * maintaining its own independent copy — the pre-Phase-5 audit found at least 7 duplicated
 * `STATUS_ORDER` literals across the codebase, which is exactly the drift this consolidates.
 */
export const TASK_STATUS_ORDER: TaskStatus[] = ["not-started", "in-progress", "waiting", "completed", "canceled"];

/** Board/My Day subset — canonical order minus the closed `canceled` status, which is
 * closed/historical and never an active workflow column or bucket. */
export const ACTIVE_TASK_STATUS_ORDER: TaskStatus[] = TASK_STATUS_ORDER.filter((s) => s !== "canceled");

const TASK_STATUS_SET = new Set<string>(TASK_STATUS_ORDER);

/** Runtime membership guard — the TS union alone provides zero runtime protection once a status
 * value crosses an API boundary (devtools, a raw fetch, a stale persisted value). Use this on
 * every Task mutation path that accepts a status, and reject (never silently convert) anything
 * that fails it. */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUS_SET.has(value);
}

/** Phase 5 (CD-214) — only Waiting requires a reason now; Blocked is retired. */
export function taskStatusRequiresReason(status: TaskStatus): boolean {
  return status === "waiting";
}

/**
 * Phase 5 (CD-214) legacy FILTER/READ compatibility ONLY — never use this on a Task write/mutation
 * path. Maps a possibly-stale persisted/URL/Saved-View status value to its current equivalent: the
 * retired `"blocked"` slug normalizes to `"waiting"`; a current valid status passes through
 * unchanged; anything else (garbage, an unrecognized future value) returns `null` so the caller can
 * fall back to "no filter" rather than produce an impossible, permanently-empty result. A Task
 * WRITE of `status: "blocked"` must still be rejected via `isTaskStatus`, never converted.
 */
export function normalizeLegacyTaskFilterStatus(value: string): TaskStatus | null {
  if (value === "blocked") return "waiting";
  return isTaskStatus(value) ? value : null;
}

/** Same compatibility mapping as `normalizeLegacyTaskFilterStatus`, for the `TaskStatus | "all"`
 * shape every Task filter (`TaskFilters`, `SavedViewFilters`) actually uses. */
export function normalizeLegacyTaskFilterStatusOrAll(value: string): TaskStatus | "all" {
  if (value === "all") return "all";
  return normalizeLegacyTaskFilterStatus(value) ?? "all";
}
