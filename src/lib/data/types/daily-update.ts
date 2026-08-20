import type { TaskStatus } from "./task";

export type DailyUpdateStatus = "draft" | "confirmed";

/** What produced this line — the stable key the live-merge logic uses to preserve edited `details` across re-drafts, and to avoid ever double-counting the same event. `"manual"` is the person's own free-standing entry for work the auto-draft never sees (a meeting, a call, "Other") — it's never touched by the merge/refresh logic, only ever added or edited by its owner. `"handoff-sent"`/`"handoff-received"` are legacy-only from before Phase 9C — a Handoff now always folds into its Task's own `"task"` entry for that day (see `handoffIds`) rather than producing a separate row, but old stored entries with these sources must keep rendering as-is. */
export type DailyUpdateEntrySource = "task" | "handoff-sent" | "handoff-received" | "manual";

/**
 * One thing this person did that day. For a Task-backed entry, every field but `details` and
 * `scheduledMinutes` is a computed fact, refreshed whenever the day's draft is re-merged —
 * `details`/`scheduledMinutes` are the two fields the person owns and edits (Phase 9C: Scheduled
 * Time has no trustworthy per-day auto-source yet, see docs/current-project-state.md, so it's
 * always human-entered and always preserved verbatim across refresh, exactly like `details`).
 * Manual entries are the exception: every field on them is person-entered at creation time and
 * never recomputed, since nothing auto-drafts them in the first place.
 *
 * Phase 9C added the Project/Workstream/Task-label fields below so a future weekly report can
 * safely use this entry's narrative as Project-scoped context. All of them are optional — a
 * legacy entry stored before Phase 9C simply won't have the key at all in its stored JSON, and
 * every read site must treat "missing" the same as "null." Use `getEntryActualMinutes(entry)`
 * rather than reading `actualMinutes`/`minutesLogged` directly, for the same reason.
 */
export interface DailyUpdateEntry {
  id: string;
  source: DailyUpdateEntrySource;
  /** Always set for a Task-backed entry — even one whose only event that day was a handoff. Null only for manual entries, which have no backing task. */
  sourceTaskId: string | null;
  /** @deprecated Legacy single-handoff link from before an entry could fold in more than one handoff. New entries use `handoffIds`; kept only so old stored entries keep their original shape. */
  sourceHandoffId?: string | null;
  /** Every Handoff folded into this Task's entry for this day (Phase 9C) — a Handoff never produces its own separate row anymore, it's context on the Task's own entry. Empty array (not null) when none. Always `[]`/absent on manual and legacy handoff-sourced entries. */
  handoffIds?: string[];

  /** Null only for a manual entry with no client picked. */
  companyId: string | null;
  /** Snapshotted display name; "No client" for a manual entry with none picked. */
  companyLabel: string;
  /** The annual/contract Project this Task's Workstream belongs to (Phase 9C). Null for a legacy entry predating Project-awareness, for a Workstream that genuinely has no Project (internal/non-client work), or for a manual entry with no Project selected. */
  projectId?: string | null;
  /** Snapshotted Project name; null wherever `projectId` is null. */
  projectLabel?: string | null;
  /** The Workstream ("Service") this Task belongs to (Phase 9C). Null for a legacy entry, or a manual entry with no Workstream context. */
  workstreamId?: string | null;
  /** Snapshotted Workstream display heading; null wherever `workstreamId` is null. */
  workstreamLabel?: string | null;

  activityId: string | null;
  /** Snapshotted "Department: Activity"; null = untagged. */
  activityLabel: string | null;

  /** The Task's own title (Phase 9C) — its own field so the person is never asked to retype it into `details`. Null for manual entries (which have no backing Task) and for legacy entries stored before this field existed (their title, if any, is already baked into `details` instead — see the migration note in mock/supabase providers). */
  taskLabel?: string | null;

  /** @deprecated Renamed to `actualMinutes` in Phase 9C. Kept only so old stored entries keep their original shape — read via `getEntryActualMinutes(entry)`, never this field directly. */
  minutesLogged?: number;
  /**
   * Actual tracked minutes (Phase 9C canonical field). For a Task-backed entry: the sum of this
   * person's own legitimate, non-running Time Entries for this Task on this date — read-only,
   * operationally derived, never person-edited. For a manual entry: whatever the person typed in
   * — a fallback value, visually marked as such, never a real Time Entry and never merged into
   * one. 0 for a Task-backed entry whose only event that day was a status change or a Handoff.
   */
  actualMinutes?: number;

  /**
   * Scheduled minutes for this Task on this day (Phase 9C) — always user-entered, never
   * auto-derived (Task.expectedMinutes is a whole-Task estimate, not a per-day plan, and Planner
   * schedules dates, not per-day effort — see docs/current-project-state.md for why). `null`/blank
   * on a freshly auto-drafted row; once set, preserved verbatim across every draft refresh, the
   * same way `details` is.
   */
  scheduledMinutes?: number | null;

  /** The task's status at merge time — null for manual entries and legacy handoff-sourced entries. */
  progressStatus: TaskStatus | null;
  /** TaskStatusBadge's own label for task entries; "Manual entry" for manual ones; legacy handoff-entry wording for old stored rows. */
  progressLabel: string;
  /** The one field the person always owns and edits, on every entry type. */
  details: string;
}

/** One person's log for one day — auto-drafted from tracked work, confirmed when they're done editing. One row per (userId, date). */
export interface DailyUpdate {
  id: string;
  userId: string;
  /** YYYY-MM-DD. */
  date: string;
  status: DailyUpdateStatus;
  entries: DailyUpdateEntry[];
  /** First-created timestamp. */
  generatedAt: string;
  confirmedAt: string | null;
  updatedAt: string;
  /**
   * Team Lead review marker (Phase 9C) — additive to the status machine, not a third status: a
   * confirmed update is either "not yet reviewed" (`reviewedAt` null) or "reviewed by {reviewedBy}
   * at {reviewedAt}." Both null on a draft, and cleared back to null whenever the owner reopens an
   * already-reviewed update — the submitted snapshot that was reviewed no longer exists once it's
   * back in draft, so a re-submit must be reviewed again.
   */
  reviewedAt: string | null;
  /** The reviewer's user id. */
  reviewedBy: string | null;
  /** Snapshotted at review time (same rationale as ClientReport's `generatedByName`) — the viewer
   * may not have roster visibility into the reviewer (e.g. a Supervisor viewing a direct report's
   * update that a Superadmin reviewed organization-wide), so the name is never resolved client-side. */
  reviewedByName: string | null;
}

/** Reads Actual Time off an entry regardless of whether it was stored under the Phase 9C canonical
 * `actualMinutes` key or the legacy `minutesLogged` key — every read site should use this rather
 * than either field directly. */
export function getEntryActualMinutes(entry: DailyUpdateEntry): number {
  return entry.actualMinutes ?? entry.minutesLogged ?? 0;
}
