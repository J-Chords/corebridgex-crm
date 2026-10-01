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
   * end). Never fabricated; set once, the first time a status transition to "completed" leaves it
   * unset (see `set_project_status`) — never overwritten by any later transition, including a later
   * Canceled/Archived/Active move, so a genuine historical completion is never silently erased. */
  completionDate: string | null;
  /** Boss-Aligned Project Status Restoration — the persisted Archive date, distinct from
   * `completionDate` (Archived is not a "successful completion"; a Canceled or still-Active Project
   * can be Archived too). Stamped to now() every time a status transition to "archived" happens
   * (always the LATEST archive date, unlike `completionDate`'s set-once rule) — never cleared by
   * Reactivate, so "Previously Archived On" stays available after returning to Active. */
  archivedAt: string | null;
  projectGroupId: string | null;
  /** Phase 3 (CD-208) — Project-specific Partner Brand, independent of `Company.brandId`. Two
   * Projects under the same Company may carry different Partner Brands. Backfilled once from the
   * owning Company's `brandId` at migration time; no ongoing sync in either direction afterward —
   * editing one never touches the other. Null is valid (no Brand set). */
  partnerBrandId: string | null;
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

/** Phase 4 — a Project's Additional Team Lead(s): the dedicated relation representing "the same
 * normal Project-management authority as the Primary Team Lead (`Project.ownerId`), minus the
 * ability to change `ownerId` itself." Deliberately NOT layered onto `ProjectMember`/`projectRole`
 * (which stay descriptive-data-only, never authorization-bearing) — see `docs/domain-model.md`'s
 * Phase 4 entry. Eligibility (active Supervisor, not already the Project's own `ownerId`) is
 * enforced at write time (mock: `addProjectTeamLead`; hosted: the `project_team_leads` eligibility
 * trigger + `add_project_team_lead` RPC), not just here. */
export interface ProjectTeamLead {
  projectId: string;
  userId: string;
  createdAt: string;
  createdById: string;
}

/** Singleton row — see `set_project_trash_retention`. `retentionDays === null` means automatic
 * purge is disabled (the default); a positive number is the Admin's own explicit choice. No
 * automatic physical purge is ever scheduled by this codebase — see the architecture doc's
 * dependency-audit finding (several FKs into `projects` are `ON DELETE NO ACTION`). */
export interface ProjectTrashSettings {
  retentionDays: number | null;
  updatedAt: string;
}
