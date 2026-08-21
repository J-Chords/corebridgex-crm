/**
 * Phase 9F — Daily Visit Hours: an Employee/Supervisor physically visiting a Client Project and
 * performing visit-related work. Deliberately a separate model from `TimeEntry`/`Task`, never a
 * fake Task or a fake Time Entry — the whole point is that Visit minutes and tracked Task minutes
 * are two structurally distinct kinds of hours that must never overlap for the same person (server-
 * enforced — see `completeVisitEntry`), so Total Week Hours + Daily Visit Hours = Grand Total can
 * never silently double-count.
 *
 * Locked business workflow (Phase 9 final semantics fix): a Visit is PLANNED before the client
 * meeting — Project, intended local date, and the Agenda/questions the Employee is taking into the
 * meeting — and contributes zero reportable minutes while planned (there are no actual hours yet to
 * report). Only after the Employee records the real Start/End does it become COMPLETED, at which
 * point its calculated actual minutes become real Daily Visit Hours evidence. `status` is the single
 * source of truth for which state a row is in; `startAt`/`endAt`/`durationMinutes` are all null
 * together for a Planned Visit and all set together for a Completed one — never partially.
 */
export type VisitEntryStatus = "planned" | "completed";

export interface VisitEntry {
  id: string;
  userId: string;
  projectId: string;
  /** YYYY-MM-DD — the intended/actual local calendar visit date. Chosen directly at planning time;
   * never silently moved once actual hours are recorded (a mismatched actual date is rejected, not
   * auto-corrected). */
  visitDate: string;
  status: VisitEntryStatus;
  /** Null while `status === "planned"` — there are no actual hours yet. Set together with `endAt`/`durationMinutes` the moment the Visit is completed. */
  startAt: string | null;
  endAt: string | null;
  /** Always `(endAt - startAt)` in minutes — calculated server-side, never freely entered. Null while planned. */
  durationMinutes: number | null;
  /** The questions/items the Employee is taking into the client visit — internal only, prepared
   * before the meeting happens. Required at planning time and preserved through completion; never
   * exposed in client-facing report body/PDF/CSV. */
  agenda: string;
  /** The IANA zone the visiting user was in when they planned/completed it. */
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

/** Plans a new Visit — no actual hours exist yet, so none are asked for. */
export interface VisitPlanInput {
  projectId: string;
  /** YYYY-MM-DD — today or a future local calendar date. */
  visitDate: string;
  agenda: string;
  timezone: string;
}

/** Edits a still-Planned Visit's date/Agenda. Project is immutable once planned (same precedent as
 * the original create/update split — pick a different Project by planning a new Visit instead). */
export interface VisitPlanUpdateInput {
  visitDate: string;
  agenda: string;
}

/** Records the real Start/End for a Planned Visit (or corrects them on an already-Completed one) —
 * duration is always derived server-side from these two timestamps, never entered directly. */
export interface VisitActualTimeInput {
  startAt: string;
  endAt: string;
}
