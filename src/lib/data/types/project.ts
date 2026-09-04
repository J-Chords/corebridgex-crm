export type ProjectStatus = "active" | "on-hold" | "completed" | "cancelled" | "archived" | "trash";

/** Optional Project grouping (e.g. "2026 Tax Season", "UK Clients") — distinct from Company,
 * Service, and Tags. Admin-managed, reused across every Project. */
export interface ProjectGroup {
  id: string;
  name: string;
}

/**
 * The operational client engagement / annual contract layer between Company and Workstream.
 * UI term is always "Project" — never "Engagement" (that word was this app's own original,
 * later-retired name for what is now Workstream; reusing it here would resurrect a confusing
 * term for a different concept). A normal client Project represents one annual contract; the
 * Internal/Non-billable Company's Project has null contract dates (no annual-contract concept
 * applies to internal work) — see `INTERNAL_COMPANY_ID`.
 */
export interface Project {
  id: string;
  companyId: string;
  name: string;
  ownerId: string;
  status: ProjectStatus;
  /** Null when no reliable historical contract date exists — never fabricated. */
  contractStartDate: string | null;
  /** Forward-looking default (typically 12) for suggesting a renewal/end date on new/edited
   * Projects — never used to compute a historical contractEndDate that wasn't actually recorded. */
  contractMonths: number;
  /** Always stored, never derived — must support extensions and early terminations. Null when no
   * reliable historical renewal date exists. */
  contractEndDate: string | null;
  /** The Project's own planned/actual work timeline — genuinely distinct from the annual-contract
   * term dates above (see docs/project-level-product-architecture.md's date-semantics audit).
   * Start = planned/actual beginning of work; End = planned end of work. Both optional, always
   * independently stored. */
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  /** The real, actual-successful-completion date — distinct from `contractEndDate` (the planned
   * end). Never fabricated; defaults to today only when a status transition to "completed" leaves
   * it unset (see `set_project_status`). */
  completionDate: string | null;
  projectGroupId: string | null;
  tags: string[];
  /** Present only while status is "on-hold"/"cancelled" (required at that transition) — cleared on
   * any other transition. */
  statusReason: string | null;
  statusChangedAt: string | null;
  statusChangedById: string | null;
  /** Present only while status is "trash" — the status to return to via the explicit Restore
   * action, never inferred from status-select. */
  trashedAt: string | null;
  preTrashStatus: ProjectStatus | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/** Join row: Project operational membership — the future access relationship, coexisting with
 * (not replacing) `user_companies` during the Phase 8 transition. `projectRole` is a free-text,
 * Project-scoped label ("Project Lead", "Reviewer", "Contributor" as placeholder examples only) —
 * data only, never a new global authorization role, never consulted by any access helper. */
export interface ProjectMember {
  projectId: string;
  userId: string;
  projectRole: string | null;
}

/** Optional preset that references (never copies) existing Service Line/Activity catalog rows —
 * see docs/project-level-product-architecture.md's Template architecture section. */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/** Correction — a Project Template bundle entry references an existing Service Template/recipe
 * (the pre-existing `templates` entity, with its own recurrence/default Tasks/checklists), never a
 * bare Service Line. `serviceLineId` is always derived server-side from that recipe (never
 * independently supplied), kept here only for convenient display/filtering. */
export interface ProjectTemplateServiceConfig {
  serviceTemplateId: string;
  serviceLineId: string;
  activityIds: string[];
}

/** One step of applying a Project Template bundle onto a Project — "created" a new Workstream, or
 * "merged" selected Activities into one that already existed on that Service Line. Never a
 * duplicate Workstream/Tasks/checklists on repeated application. */
export interface ProjectTemplateApplyStep {
  serviceLineId: string;
  serviceLineName: string;
  serviceTemplateName: string;
  status: "created" | "merged";
  workstreamId: string;
  activitiesMerged?: number;
}

/** Singleton row — see `set_project_trash_retention`. `retentionDays === null` means automatic
 * purge is disabled (the default); a positive number is the Admin's own explicit choice. No
 * automatic physical purge is ever scheduled by this codebase — see the architecture doc's
 * dependency-audit finding (several FKs into `projects` are `ON DELETE NO ACTION`). */
export interface ProjectTrashSettings {
  retentionDays: number | null;
  updatedAt: string;
}
