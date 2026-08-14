import type { RecurrenceFrequency } from "./recurrence";

export type WorkstreamStatus = "active" | "on-hold" | "completed" | "cancelled";

/** One service delivered to one client — the layer between a Company and its Tasks. */
export interface Workstream {
  id: string;
  name: string;
  /** Optional freeform context — same treatment as Task.description. */
  description: string | null;
  companyId: string;
  /** Null for workstreams with no real client service line (e.g. Internal Operations). */
  serviceLineId: string | null;
  /** Denormalized copy of the owning company's brandId — companies don't yet support multi-brand association. */
  brandId: string;
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
export interface WorkstreamActivity {
  workstreamId: string;
  activityId: string;
}
