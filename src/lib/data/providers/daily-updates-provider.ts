import type { DailyUpdate, User } from "../types";

/** What the person fills in for a manual entry — the same shape an auto-drafted entry ends up with,
 * minus everything that's normally computed from a task/handoff. `projectId` is offered only when
 * a client is picked and it has at least one legitimate accessible Project (Phase 9C) — internal
 * or genuinely Project-less work leaves it null. */
export interface AddManualDailyUpdateEntryInput {
  companyId: string | null;
  projectId: string | null;
  activityId: string | null;
  actualMinutes: number;
  scheduledMinutes: number | null;
  details: string;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement. Every method takes the
 * requesting `viewer` and enforces `canViewDailyUpdate` (src/lib/data/permissions.ts) itself, so an
 * employee can never reach another person's update through any provider method — `updateEntryDetails`/
 * `confirmUpdate` additionally require `canEditDailyUpdate` (owner-only, draft-only), `reopenUpdate`
 * requires `canReopenDailyUpdate` (owner-only, confirmed-only), and `reviewUpdate` requires
 * `canReviewDailyUpdate` (never-owner, confirmed-only, legitimate-team-scoped-or-Superadmin).
 */
export interface DailyUpdatesProvider {
  /**
   * Today's update for the viewer — creates it (auto-drafted from today's tracked work) if none
   * exists yet. If one exists and is still "draft", re-scans today's evidence and merges in any
   * newly-touched tasks/handoffs while preserving already-edited `details`/`scheduledMinutes` on
   * existing entries. A "confirmed" update is returned untouched — no re-scan.
   */
  getMyTodayUpdate(viewer: User): Promise<DailyUpdate>;
  /**
   * Every update for one date that `viewer` is allowed to see (own + reports, per canViewDailyUpdate)
   * — a pure read, creates nothing. Powers the Team Updates page's roster + per-person drill-down
   * from a single call.
   */
  listUpdatesForDate(viewer: User, date: string): Promise<DailyUpdate[]>;
  /** Owner-only, draft-only. */
  updateEntryDetails(viewer: User, updateId: string, entryId: string, details: string): Promise<DailyUpdate>;
  /** Owner-only, draft-only — the only other field a person may edit on an auto-drafted, Task-backed
   * entry (everything else is a computed fact; if it's wrong, the source Task/Time Entry is what
   * needs correcting). `null` clears it back to blank. */
  updateEntryScheduledMinutes(viewer: User, updateId: string, entryId: string, scheduledMinutes: number | null): Promise<DailyUpdate>;
  /**
   * Adds a free-standing entry for work the auto-draft didn't pick up (a meeting, a call, "Other")
   * — client/Project/activity are optional, unlike an auto-drafted entry's always-real company.
   * Owner-only, draft-only, same guard as `updateEntryDetails`. Never touched by the live-merge
   * re-scan afterward.
   */
  addManualEntry(viewer: User, updateId: string, input: AddManualDailyUpdateEntryInput): Promise<DailyUpdate>;
  /** Freezes today's update — status becomes "confirmed", confirmedAt set, no further merges happen until reopened. Owner-only. */
  confirmUpdate(viewer: User, updateId: string): Promise<DailyUpdate>;
  /** Unfreezes a confirmed update back to "draft" so it resumes merging fresh evidence; clears any
   * review marker, since the submitted snapshot that was reviewed no longer exists once it's back
   * in draft. Owner-only. */
  reopenUpdate(viewer: User, updateId: string): Promise<DailyUpdate>;
  /** Marks a submitted (confirmed) update reviewed — sets reviewedAt/reviewedBy. Never the owner;
   * a Supervisor only for a genuine direct report's; Superadmin organization-wide; never a draft. */
  reviewUpdate(viewer: User, updateId: string): Promise<DailyUpdate>;
}
