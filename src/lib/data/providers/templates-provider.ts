import type { RecurrenceFrequency, Role, ServiceLine, Template, TemplateChecklistItem, TemplateTask, User } from "../types";

export interface TemplateTaskWithChecklist extends TemplateTask {
  checklistItems: TemplateChecklistItem[];
}

/** Template joined with the read-shape screens actually need — not a raw schema row. */
export interface TemplateWithTasks extends Template {
  serviceLine: ServiceLine | null;
  /** Ordered by position. */
  tasks: TemplateTaskWithChecklist[];
}

/** CD-218 (Reusable Template authoring) — one Checklist item inside a bundle create/update payload. `id` is
 * omitted/null for a brand-new item; a real id on an update reconciles (updates in place) rather
 * than recreating, preserving that row's own identity. */
export interface TemplateChecklistItemBundleInput {
  id?: string | null;
  description: string;
}

/** CD-218 — one Task inside a bundle create/update payload. Array order is canonical: the backend
 * always renormalizes `position` from this order, never from a client-supplied position field.
 * Same `id`-reconciliation rule as the Checklist item above. */
export interface TemplateTaskBundleInput {
  id?: string | null;
  title: string;
  description: string;
  defaultOwnerRole: Role | null;
  dueDaysAfterStart: number | null;
  expectedMinutes: number | null;
  checklistItems: TemplateChecklistItemBundleInput[];
}

/** CD-218 — the whole-Reusable-Template create/update payload. Shared shape for both create (every
 * `id` omitted) and update (retained rows carry their real id) — one atomic RPC per direction
 * reconciles rather than blindly recreating, so an unmodified Task's `tasks.template_id` lineage on
 * any already-materialized real Task is never disturbed by an edit elsewhere in the same bundle. */
export interface TemplateBundleInput {
  name: string;
  description: string | null;
  serviceLineId: string;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceCustomIntervalDays: number | null;
  tasks: TemplateTaskBundleInput[];
}

export interface ApplyTemplateInput {
  templateId: string;
  /** Ignored when `projectId` is given — the Project's own Company always wins (never trusted
   * independently), matching `create_workstream`'s own existing project->company derivation. */
  companyId: string;
  /** Trimmed workstream name — the caller (ApplyTemplateDialog) owns suggesting/editing this.
   * Ignored when `projectId` is given (the Project-aware path always uses the Service Template's
   * own name, matching Project Template bundle materialization). */
  name: string;
  leadUserId: string;
  teamUserIds: string[];
  startDate: string;
  /**
   * Project Level correction (Section 6) — when given, the resulting Workstream is attached to
   * this Project and reuses the SAME role-based authorization `create_workstream` already enforces
   * for "add a Service to a Project" (Superadmin unconditional; Supervisor/Employee only with real
   * Project access and only as their own/their report's legitimate lead) — never the looser
   * Company-only Supervisor-or-Superadmin check the legacy path still uses unchanged. Idempotent:
   * if the Project already has a Workstream on this Service Template's own Service Line, no second
   * Workstream/Tasks/checklists are created — only missing `activityIds` are merged into it.
   */
  projectId?: string | null;
  /** Activities to enable on the resulting Workstream — validated to belong to the Service
   * Template's own Service Line. Only meaningful alongside `projectId`; the legacy Company-only
   * path never had an Activity concept and this is ignored there. */
  activityIds?: string[];
}

export interface ApplyTemplateResult {
  workstreamId: string;
  /** "created" a new Workstream, or "merged" Activities into one that already existed on the
   * Project for this Service Line. Always "created" for the Company-only legacy path (`projectId`
   * omitted), which has no merge concept. */
  status: "created" | "merged";
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Templates are a shared reference library, not scoped by role or team —
 * `viewer` is still threaded through for interface consistency and in case
 * a later phase scopes templates (e.g. per brand).
 */
export interface TemplatesProvider {
  /** Defaults to Active Reusable Templates only (matching `apply_template`/
   * `apply_service_template_to_project`'s own rejection of an inactive one) — every existing
   * Apply-Template caller gets this safely for free. Pass `includeInactive: true` only for Admin
   * Reusable-Template-management surfaces that need to see and manage deactivated ones too. */
  listTemplates(viewer: User, options?: { includeInactive?: boolean }): Promise<TemplateWithTasks[]>;
  getTemplate(viewer: User, id: string): Promise<TemplateWithTasks | null>;
  /**
   * Creates (or, Project-aware, reuses) the workstream, its team, every template task, and each
   * task's checklist items as one unit — never partially applied. Templates carry no Activity
   * concept of their own beyond what `activityIds` explicitly enables for this one application.
   */
  applyTemplate(viewer: User, input: ApplyTemplateInput): Promise<ApplyTemplateResult>;
  /** CD-218 (Reusable Template authoring) — Admin-only. Authors a brand-new Reusable Template
   * (Template + Tasks + Checklist Items) under a given parent Service Line, as one atomic bundle;
   * any validation failure persists nothing. */
  createTemplateBundle(viewer: User, input: TemplateBundleInput): Promise<TemplateWithTasks>;
  /** CD-218 — Admin-only. Reconciles an existing Reusable Template's full bundle against `input`
   * (update retained rows in place by id, insert new rows, delete rows no longer present) as one
   * atomic operation. Never affects any already-materialized real Task — see `TemplateBundleInput`. */
  updateTemplateBundle(viewer: User, templateId: string, input: TemplateBundleInput): Promise<TemplateWithTasks>;
  /** CD-218 — Admin-only. Deactivating stops the Reusable Template being offered for new
   * application (enforced in `applyTemplate` itself, not just by hiding it from a picker) without
   * touching its own rows or any historical lineage. No hard-delete exists in V1. */
  setTemplateActive(viewer: User, templateId: string, isActive: boolean): Promise<TemplateWithTasks>;
}
