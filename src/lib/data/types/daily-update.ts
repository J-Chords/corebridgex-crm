import type { TaskStatus } from "./task";

export type DailyUpdateStatus = "draft" | "confirmed";

/** What produced this line — the stable key the live-merge logic uses to preserve edited `details` across re-drafts, and to avoid ever double-counting the same event. `"manual"` is the person's own free-standing entry for work the auto-draft never sees (a meeting, a call, "Other") — it's never touched by the merge/refresh logic, only ever added or edited by its owner. */
export type DailyUpdateEntrySource = "task" | "handoff-sent" | "handoff-received" | "manual";

/**
 * One thing this person did that day. Every field but `details` is a computed fact, refreshed
 * whenever the day's draft is re-merged — `details` is the one field the person owns and edits.
 * Manual entries are the exception: every field on them is person-entered at creation time and
 * never recomputed, since nothing auto-drafts them in the first place.
 */
export interface DailyUpdateEntry {
  id: string;
  source: DailyUpdateEntrySource;
  /** Always set for task/handoff entries — even handoff entries hang off a task. Null only for manual entries, which have no backing task. */
  sourceTaskId: string | null;
  /** Set only for handoff-sent/handoff-received entries. */
  sourceHandoffId: string | null;
  /** Null only for a manual entry with no client picked. */
  companyId: string | null;
  /** Snapshotted display name; "No client" for a manual entry with none picked. */
  companyLabel: string;
  activityId: string | null;
  /** Snapshotted "Department: Activity"; null = untagged. */
  activityLabel: string | null;
  /** 0 for handoff entries; person-entered (may be 0) for manual entries. */
  minutesLogged: number;
  /** The task's status at merge time — null for handoff and manual entries. */
  progressStatus: TaskStatus | null;
  /** TaskStatusBadge's own label for task entries; "Handed off to {name}" / "Received from {name}" for handoff entries; "Manual entry" for manual ones. */
  progressLabel: string;
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
}
