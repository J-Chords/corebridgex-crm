import type { RecurrenceFrequency } from "./recurrence";

export type WorkstreamStatus = "active" | "on-hold" | "completed" | "cancelled";

/** One service delivered to one client — the layer between a Company and its Tasks. */
export interface Workstream {
  id: string;
  name: string;
  /** Optional freeform context — same treatment as Task.description. */
  description: string | null;
  companyId: string;
  /** The Project (annual client engagement) this Service belongs to — nullable only during the
   * Phase 8A/8B transition; every newly-created Workstream must always resolve to one (enforced by
   * `enforce_workstream_project_link`, which also keeps `companyId` in sync with the Project's own
   * company, closing the "guess between multiple Projects" risk). See docs/current-project-state.md's
   * Phase 8 notes. */
  projectId: string | null;
  /** Null for workstreams with no real client service line (e.g. Internal Operations). */
  serviceLineId: string | null;
  /** Denormalized reference only (Phase 3, CD-208) — sourced from the owning Project's own
   * `partnerBrandId` at creation time, falling back to the Company's `brandId`, then null. No
   * longer required: canonical Template Activities are Brand-independent, so a Project/Company
   * with no Brand set can still receive Templates. */
  brandId: string | null;
  leadUserId: string;
  status: WorkstreamStatus;
  startDate: string | null;
  /** Displayed as "Renewal date" — services are often ongoing, not a task-style deadline. */
  endDate: string | null;
  /** Null = not recurring. Set (with recurrenceAnchorDate) via the workstream form or "Apply template" — see "Recurring Work" (Phase 3.19). */
  recurrenceFrequency: RecurrenceFrequency | null;
  /** Fixed reference date the cadence steps from. Never null when recurrenceFrequency is set; always null otherwise. */
  recurrenceAnchorDate: string | null;
  /** Only meaningful when recurrenceFrequency is "custom". */
  recurrenceCustomIntervalDays: number | null;
  /** Set only when this workstream was created via "Generate next occurrence" — points at the workstream it continues from. Null for a series' first workstream. */
  previousOccurrenceWorkstreamId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/** Join row: workstream team membership. The lead is tracked separately via Workstream.leadUserId. */
export interface WorkstreamMember {
  workstreamId: string;
  userId: string;
}

/**
 * Join row: an Activity Catalog entry enabled for this specific client Workstream — "this Workstream
 * uses this Activity," never "create every one of its default tasks." Empty for a workstream with no
 * persisted associations yet (legacy data, or a brand-new workstream whose service has no catalog) —
 * see `useWorkstreamActivities` for the read-side fallback that covers that case.
 */
/** Phase 3 (CD-208) — a Workstream's own frozen Activity snapshot, applied at Template-application
 * time and never live-joined again. `activityId` is lineage only (nullable — survives a source
 * Activity later being deleted); `name`/`description`/`defaultTaskTitles`/`position` are the
 * Project-facing display data, frozen as of the moment this Activity was applied. Editing the
 * global catalog Activity afterward never changes an already-applied snapshot; editing this
 * snapshot (e.g. removing/re-adding it) never changes the global catalog Activity. */
export interface WorkstreamActivity {
  workstreamId: string;
  activityId: string | null;
  name: string;
  description: string | null;
  defaultTaskTitles: string[];
  position: number;
}
