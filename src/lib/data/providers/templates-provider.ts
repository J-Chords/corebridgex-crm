import type { ServiceLine, Template, TemplateChecklistItem, TemplateTask, User } from "../types";

export interface TemplateTaskWithChecklist extends TemplateTask {
  checklistItems: TemplateChecklistItem[];
}

/** Template joined with the read-shape screens actually need — not a raw schema row. */
export interface TemplateWithTasks extends Template {
  serviceLine: ServiceLine | null;
  /** Ordered by position. */
  tasks: TemplateTaskWithChecklist[];
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
  listTemplates(viewer: User): Promise<TemplateWithTasks[]>;
  getTemplate(viewer: User, id: string): Promise<TemplateWithTasks | null>;
  /**
   * Creates (or, Project-aware, reuses) the workstream, its team, every template task, and each
   * task's checklist items as one unit — never partially applied. Templates carry no Activity
   * concept of their own beyond what `activityIds` explicitly enables for this one application.
   */
  applyTemplate(viewer: User, input: ApplyTemplateInput): Promise<ApplyTemplateResult>;
}
