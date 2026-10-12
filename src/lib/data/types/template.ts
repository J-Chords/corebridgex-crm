import type { Role } from "./role";
import type { RecurrenceFrequency } from "./recurrence";

/** A reusable recipe for a full workstream's worth of work — applied once to create a real Workstream + Tasks. */
export interface Template {
  id: string;
  name: string;
  description: string | null;
  serviceLineId: string | null;
  /** Null = the workstreams created from this template aren't recurring by default. Carried onto the created workstream by "Apply template" (its anchor becomes the chosen start date) — see "Recurring Work" (Phase 3.19). Authored via Reusable Template authoring (CD-218) — `admin_create_template_bundle`/`admin_update_template_bundle`, Admin-only. */
  recurrenceFrequency: RecurrenceFrequency | null;
  /** Only meaningful when recurrenceFrequency is "custom". */
  recurrenceCustomIntervalDays: number | null;
  /** CD-218 — Active/Inactive lifecycle (Reusable Template authoring). An inactive Reusable
   * Template is preserved, still editable by Admin, and keeps every already-materialized Task's
   * lineage — it just stops being offered for new application (`apply_template`/
   * `apply_service_template_to_project` both reject it). Defaults true for every pre-existing row;
   * no hard-delete concept exists in V1. */
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateTask {
  id: string;
  templateId: string;
  title: string;
  description: string;
  /** Who typically does this — shown as a hint when applying, but tasks are still created unassigned. */
  defaultOwnerRole: Role | null;
  /** Due date offset in days from the workstream's start date. Null = no due date. */
  dueDaysAfterStart: number | null;
  /** Normalized to minutes (see `src/lib/data/expected-time.ts`). Copied onto the created task, and summed into the new workstream's expectedMinutes. Optional — null if not estimated. */
  expectedMinutes: number | null;
  position: number;
}

export interface TemplateChecklistItem {
  id: string;
  templateTaskId: string;
  description: string;
  position: number;
}
