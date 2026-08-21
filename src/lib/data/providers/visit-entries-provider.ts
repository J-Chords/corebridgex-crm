import type { User, VisitEntry, VisitPlanInput, VisitPlanUpdateInput, VisitActualTimeInput } from "../types";

/**
 * Contract every provider (mock, Supabase, future AWS) must implement — Phase 9F Daily Visit Hours,
 * evolved to the locked Plan → Complete workflow (Phase 9 final semantics fix): a Visit is planned
 * before the client meeting (Project/date/Agenda, zero reportable minutes), then completed
 * afterward by recording its real Start/End (duration always server-derived). Overlap enforcement
 * against the same user's Time Entries and other Completed Visits applies ONLY at completion time —
 * a Planned Visit has no actual interval and must never block/be blocked by anything (mirrored in
 * the mock provider too, not just the real RPCs — never a UI-only warning).
 */
export interface VisitEntriesProvider {
  /** The viewer's own Visit Entries (planned and completed), across every Project — callers filter by date/status client-side, same convention as `listMyTimeEntries`. */
  listMyVisitEntries(viewer: User): Promise<VisitEntry[]>;
  /** Every Visit Entry for `userId` the viewer may legitimately see — self, or anyone they manage (Section 23: a Supervisor may view direct-report Visit Entries for team reporting). */
  listVisitEntriesForUser(viewer: User, userId: string): Promise<VisitEntry[]>;
  /** Plans a new Visit — self-service only, no actual hours yet (status starts "planned"). Requires real access to a non-internal Client Project; today or a future local calendar date. No overlap check — a plan reserves nothing. */
  createVisitEntry(viewer: User, input: VisitPlanInput): Promise<VisitEntry>;
  /** Owner-only, Planned Visits only — edits date/Agenda. Project is immutable once planned. */
  updateVisitPlan(viewer: User, id: string, input: VisitPlanUpdateInput): Promise<VisitEntry>;
  /**
   * Records (or corrects) the actual Start/End for a Visit, transitioning it to "completed" (or
   * re-validating an already-completed one). Owner-only. The actual interval must fall on the
   * Visit's own already-chosen local date (never silently moved) and must not overlap the same
   * user's completed Task Time, running timer, or another Completed Visit.
   */
  completeVisitEntry(viewer: User, id: string, input: VisitActualTimeInput): Promise<VisitEntry>;
  /** Owner OR Superadmin (Section 23) — never a Supervisor acting on a direct report's entry merely because they manage them. Works on a Visit of either status. */
  deleteVisitEntry(viewer: User, id: string): Promise<void>;
}
