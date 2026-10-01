/**
 * Task Level Phase 1 — final canonical status set (renamed from the pre-Phase-1
 * todo/in-progress/blocked/waiting-on-client/done set; `canceled` is new). Persisted value IS the
 * canonical name — no separate display-mapping layer. See `supabase/migrations/
 * 20260908090000_task_status_model_phase1.sql` for the historical-data rename.
 *
 * Phase 5 (CD-214) — `"blocked"` retired in favor of `"waiting"`. A legacy `"blocked"` value may
 * still appear in a stale URL/sessionStorage/Saved-View filter; see `src/lib/data/task-status.ts`
 * for the FILTER/READ-only compatibility mapping. It is no longer a valid Task status value.
 */
export type TaskStatus =
  | "not-started"
  | "in-progress"
  | "waiting"
  | "completed"
  | "canceled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** How the tasks list view clusters an already-filtered list — orthogonal to filtering, never narrows which tasks show. */
export type TaskGroupBy = "none" | "project" | "company" | "activity" | "workstream" | "status" | "assignee";

export interface Task {
  id: string;
  title: string;
  description: string;
  companyId: string;
  /** Every task belongs to a workstream; companyId above is a denormalized copy of workstream.companyId, synced by the provider — never independently editable. */
  workstreamId: string;
  status: TaskStatus;
  /** Task Level Phase 1 — the CURRENT reason this Task is Waiting; required exactly when `status`
   * is `"waiting"`, and auto-cleared the moment status leaves it (server-enforced by
   * `enforce_task_invariants`, never left stale). This is workflow state, not conversation
   * history — it never replaces or is replaced by Comments. Phase 5 (CD-214) — previously also
   * required for the now-retired `"blocked"` status; a handful of legacy pre-Phase-1 rows are
   * exempt from the requirement on unrelated edits (see `enforce_task_invariants`'s own comment). */
  statusReason: string | null;
  priority: TaskPriority;
  /** Optional planned/scheduled start date, set directly by the user — never derived from
   * createdAt, statusChangedAt, or any timer/status event. Phase 13B, added for the Project
   * Tasks Timeline view. */
  startDate: string | null;
  dueDate: string | null;
  /** Normalized to minutes regardless of which unit (minutes/hours/days) it was entered in — see `src/lib/data/expected-time.ts`. For later profitability reporting. Set automatically from the template when created via "Apply template"; editable directly otherwise. */
  expectedMinutes: number | null;
  createdById: string;
  /** True if created via employee self-add (goes live immediately, no approval). */
  selfAdded: boolean;
  templateId: string | null;
  relatedContactId: string | null;
  /** Optional tag into the brand's Activity Catalog — never required, work is never blocked for lack of one. */
  activityId: string | null;
  recurrenceRule: string | null;
  /** Who last changed `status`, and when — feeds the "who did what, by whom" report (Phase 2). */
  statusChangedById: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Join row: a task can have multiple assignees. */
export interface TaskAssignee {
  taskId: string;
  userId: string;
}
