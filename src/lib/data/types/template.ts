import type { Role } from "./role";
import type { RecurrenceFrequency } from "./recurrence";

/** A reusable recipe for a full workstream's worth of work — applied once to create a real Workstream + Tasks. */
export interface Template {
  id: string;
  name: string;
  description: string | null;
  serviceLineId: string | null;
  /** Null = the workstreams created from this template aren't recurring by default. Carried onto the created workstream by "Apply template" (its anchor becomes the chosen start date) — see "Recurring Work" (Phase 3.19). Seed-only, like every other Template field (no in-app template editor yet). */
  recurrenceFrequency: RecurrenceFrequency | null;
  /** Only meaningful when recurrenceFrequency is "custom". */
  recurrenceCustomIntervalDays: number | null;
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
