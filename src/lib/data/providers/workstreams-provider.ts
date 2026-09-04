import type { Activity, Brand, Company, RecurrenceFrequency, Workstream, WorkstreamStatus, ServiceLine, User } from "../types";
import type { TimeBudget } from "../time-budget";
import type { WorkstreamRecurrenceInfo } from "../recurrence";

/** Workstream joined with the read-shape screens actually need — not a raw schema row. */
export interface WorkstreamWithRelations extends Workstream {
  company: Company;
  serviceLine: ServiceLine | null;
  brand: Brand;
  /** The Project Service Lead — one explicit operational lead for THIS Service within THIS Project.
   * Distinct from `createdBy` (historical creator) and from a Service Line's Global Team Leads
   * (org-wide responsibility for the catalog definition, resolved separately via
   * `useServiceLineStaffing`) — see docs/current-project-state.md's Service Level notes. */
  lead: User;
  /** Project Service Team — this Project Service's own staffing, distinct from a Service Line's
   * Global "Works In Services" membership. */
  team: User[];
  /** The historical creator, hydrated from `createdById`. Never derive "who created this" from
   * `lead`/Global Team Leads/the current viewer — this is the only truthful source. */
  createdBy: User;
  /**
   * The Activity Catalog entries explicitly enabled for this workstream (via the `WorkstreamActivity`
   * join, resolved here the same way `team` resolves `WorkstreamMember`) — empty for a workstream with
   * no persisted associations yet. Empty does NOT mean "no activities apply" — see
   * `useWorkstreamActivities` for the legacy/no-catalog fallback every screen reading this should go
   * through instead of reading this field directly.
   */
  activities: Activity[];
  taskCount: number;
  doneTaskCount: number;
  /** Rounded 0-100, done tasks / total tasks. 0 when the workstream has no tasks yet. */
  progressPercent: number;
  /** Computed on every read from this workstream's own time entries — never stored. */
  budget: TimeBudget;
  /** Null when not recurring. Computed on every read — never stored. See src/lib/data/recurrence.ts. */
  recurrence: WorkstreamRecurrenceInfo | null;
}

export interface WorkstreamInput {
  name: string;
  description: string | null;
  companyId: string;
  /**
   * The Project this Service belongs to. Optional on create — when omitted, the provider resolves
   * it from `companyId` (only when that Company has exactly one Project, matching today's 1:1
   * reality; ambiguous/missing cases throw rather than guess). Always required in practice from the
   * Project workspace's own "+ Add Service" flow, which always knows its own Project.
   */
  projectId?: string | null;
  serviceLineId: string | null;
  leadUserId: string;
  teamUserIds: string[];
  status: WorkstreamStatus;
  startDate: string | null;
  endDate: string | null;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceAnchorDate: string | null;
  recurrenceCustomIntervalDays: number | null;
  /**
   * Which of the selected service's Activity Catalog entries apply to this specific client
   * workstream — always an explicit list (matches `teamUserIds`'s "always an array" shape), never
   * omitted. Each id must belong to a department whose `serviceLineId` matches `serviceLineId`
   * above; the provider validates this rather than trusting the caller.
   */
  activityIds: string[];
  /**
   * Only used by "Generate next occurrence" — records which workstream this one continues from.
   * Ignored on update (a workstream's place in its recurrence chain never changes after creation).
   */
  previousOccurrenceWorkstreamId?: string | null;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Every method takes the requesting `viewer` and enforces the workstream
 * visibility gate (src/lib/data/permissions.ts) itself, so screens never
 * need to re-derive who's allowed to see or manage what.
 */
export interface WorkstreamsProvider {
  listWorkstreams(viewer: User, filters?: { companyId?: string; projectId?: string }): Promise<WorkstreamWithRelations[]>;
  getWorkstream(viewer: User, id: string): Promise<WorkstreamWithRelations | null>;
  createWorkstream(viewer: User, input: WorkstreamInput): Promise<WorkstreamWithRelations>;
  updateWorkstream(viewer: User, id: string, input: WorkstreamInput): Promise<WorkstreamWithRelations>;
  /**
   * Phase 13B final boss-feedback pass — creates a genuinely new, reusable Activity Catalog entry
   * (auto-resolving/creating its Department from this Workstream's own brand+serviceLine, the same
   * 1:1 convention every other Department already follows) and associates it with this Workstream in
   * one call. Same authorization scope as the existing "+ Add another activity to this service"
   * mechanism (`canExtendServiceActivities`'s real server-side counterpart): Employee only for a
   * Workstream they themselves lead; Supervisor only for one led by someone they manage, within a
   * Project they can access; Superadmin unconditionally. Reuses (never duplicates) an existing
   * Activity in the same Department whose name matches case-insensitively.
   */
  createActivityForWorkstream(viewer: User, workstreamId: string, name: string): Promise<Activity>;
}
