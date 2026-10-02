import type {
  Brand,
  Project,
  ProjectComment,
  ProjectContractPeriod,
  ProjectGroup,
  ProjectIssue,
  ProjectStatus,
  ProjectTrashSettings,
  User,
} from "../types";
import type { WorkstreamWithRelations } from "./workstreams-provider";

/** One canonical Template selection for atomic Project creation/"Add Template" application (Phase
 * 3, CD-208) — never the retired System A's `p_template_id`. `activityIds` omitted/undefined means
 * "every currently-active Activity for this Service Line," matching canonical Template
 * application's own default (see `apply_project_templates`). `leadUserId` omitted defaults to the
 * caller. */
export interface ProjectTemplateSelection {
  serviceLineId: string;
  activityIds?: string[];
  leadUserId?: string;
}

/** Task-completion rollup for a Project's own Tasks (Project -> Workstreams -> Tasks) — computed
 * on read from the current Task status model, never a second, separately-tracked progress engine. */
export interface ProjectTaskSummary {
  totalCount: number;
  doneCount: number;
  openCount: number;
  overdueCount: number;
}

/** Light reference to one Service (Workstream) under a Project — enough for a compact list-page
 * summary (Phase 8E). Not the full WorkstreamWithRelations; avoids a heavy nested join on every
 * Project fetch. */
export interface ProjectServiceSummary {
  id: string;
  name: string;
  /** The catalog Service Line this Workstream is on — null for a legacy Workstream with none set.
   * Part 13's Service filter matches on this, never on the free-text Workstream name. */
  serviceLineId: string | null;
}

/** Project joined with the read-shape a list/detail screen actually needs — not a raw schema row. */
export interface ProjectWithRelations extends Project {
  companyName: string;
  /** True only for the one permanently-seeded Internal/Non-billable pseudo-Project — read-only
   * exposure of the Company's own `is_internal` flag, never independently set. Phase 13B: used to
   * keep this system fallback bucket out of the normal Projects browsing experience for
   * Employee/Supervisor, without touching the underlying data, RLS, or its own fallback behavior. */
  isInternal: boolean;
  owner: User;
  /** Resolved from `partnerBrandId` (Phase 3, CD-208) — null when no Brand is set. Independent of
   * the owning Company's own `brand` (`Company.brandId`); do not confuse the two. */
  partnerBrand: Brand | null;
  /** The real, actual user who created this Project — distinct from `owner` (see `createdById` on
   * `Project` itself). Resolved through the same safe profile-directory as `owner`/`members`. */
  createdBy: User;
  /** Every operational Project member — resolved through the same safe profile-directory
   * architecture as Task/Workstream relations (never a plain `profiles` select) — each carrying its
   * own optional, Project-scoped `projectRole` label (never a global role). */
  members: (User & { projectRole: string | null })[];
  memberCount: number;
  /** Phase 4 — this Project's Additional Team Leads (`project_team_leads`), resolved the same way
   * as `members`/`owner`. Each one has the exact same normal Project-management authority as the
   * Primary Team Lead (`owner`) — see `canManageProjectRecord`. Independent of `members`: a user may
   * appear in both, neither, or either alone. */
  additionalTeamLeads: User[];
  workstreamCount: number;
  /** Every Service (Workstream) under this Project — light name-only reference, Phase 8E's Project
   * list "Service summary" reads from this instead of re-fetching the full Services tab. */
  services: ProjectServiceSummary[];
  tasks: ProjectTaskSummary;
  /** 0-100, derived from `tasks` (doneCount / totalCount) — never persisted. */
  progressPercent: number;
}

/**
 * Superadmin-only Project create/edit input (Phase 8E; extended Project Level Stage C).
 * `canManageProjects` is the permission gate. Deliberately excludes `status` — lifecycle status is
 * never set through this generic metadata edit, only through the dedicated `setProjectStatus`/
 * `trashProject`/`restoreProject` actions, so a reason can be enforced exactly where the product
 * requires it. `ownerId` is nullable only for `createProject` (null = default to the creating
 * Admin); `updateProject` always sends a real id, since every existing Project already has one.
 */
export interface ProjectInput {
  companyId: string;
  name: string;
  ownerId: string | null;
  contractStartDate: string | null;
  contractMonths: number;
  contractEndDate: string | null;
  /** The real, actual-successful-completion date — distinct from `contractEndDate`. */
  completionDate: string | null;
  /** The Project's own planned/actual work timeline — see `Project.startDate`/`endDate`. */
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  projectGroupId: string | null;
  /** Phase 3 (CD-208) — see `Project.partnerBrandId`'s own doc comment. Protected after creation
   * for a Team Lead (enforced server-side by `update_project_record`, not just a disabled input) —
   * only Admin may change it post-creation. */
  partnerBrandId: string | null;
  tags: string[];
  memberUserIds: string[];
  /** Phase 3 (CD-208) — canonical Templates to apply atomically alongside creation, or via
   * `applyProjectTemplates` after the fact. Ignored by `updateProject` (Template application has
   * its own dedicated method, never folded into a generic metadata edit). */
  templates?: ProjectTemplateSelection[];
}

/**
 * Project/client consolidation — the ONE normal "New Project" workflow for a brand-new client:
 * creates the underlying Company (name = `name`, reused as-is — never a second, duplicate-name
 * field) and the Project atomically. Brand/contact/contract fields are genuinely optional client
 * master data, never required Project attributes; leaving them blank creates a real, valid Company
 * with no Brand yet (see `Company.brandId`'s own doc comment) — never a fabricated default.
 */
export interface ClientProjectInput {
  /** Reused as both the Project's Title and the new Company's name. */
  name: string;
  brandId: string | null;
  /** Phase 3 (CD-208) — the new Project's own Partner Brand, independent of the new Company's
   * `brandId` above (which may still be set, or may differ — no forced inheritance). Omitted/null
   * defaults to `brandId` at the call site's own discretion (the UI may offer it as a convenience
   * default, never an ongoing sync). */
  partnerBrandId: string | null;
  /** Company master contract/renewal fields — distinct from the Project's own `startDate`/
   * `endDate`/`completionDate` below, never conflated (see docs/architecture.md's "Contract /
   * renewal information" section). Phase 6A (CD-215) — this is the Company's original-relationship
   * record only; the Project's own operational "Current Contract" lives entirely in
   * `project_contract_periods`, never derived from these two fields. */
  contractStartDate: string | null;
  renewalDate: string | null;
  /** A single optional primary contact, created alongside the Company when given. Deeper
   * multi-contact management stays on the existing Company/Project "Client Information" surface —
   * not duplicated here. */
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerId: string | null;
  completionDate: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  projectGroupId: string | null;
  tags: string[];
  memberUserIds: string[];
  /** Phase 3 (CD-208) — see `ProjectInput.templates`. */
  templates?: ProjectTemplateSelection[];
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement. Phase 8A was a read-only
 * surface; Phase 8E added Superadmin-only creation and editing. Product Owner Final Lifecycle
 * Integrity correction — "Renew Project" (creating a new Project each year for the same Company)
 * is a rejected product capability: Project IS the ongoing Client/Company workspace, never
 * re-created annually. `renewProject`/`ProjectRenewalInput` and their one UI consumer
 * (`project-renewal-dialog.tsx`, never actually imported/rendered anywhere) were removed — an
 * exhaustive search found zero other callers. The corresponding hosted `renew_project` RPC was
 * later dropped outright (`20260908140000_project_lifecycle_authoritative_hardening.sql`) — it does
 * NOT exist on hosted Supabase; do not assume otherwise from older comments. This locked invariant
 * ("never duplicate a Project to represent another contract year") carries forward unchanged into
 * Phase 6A/6B's contract-period model below — `listProjectContractPeriods`/
 * `createInitialProjectContractPeriod` record metadata on the SAME Project, never create a new one.
 */
export interface ProjectsProvider {
  listProjects(viewer: User): Promise<ProjectWithRelations[]>;
  getProject(viewer: User, id: string): Promise<ProjectWithRelations | null>;
  createProject(viewer: User, input: ProjectInput): Promise<ProjectWithRelations>;
  /** The ONE normal "New Project" workflow for a brand-new client — creates the Company and the
   * Project atomically (a real transaction on Supabase; the mock mirrors the same semantics with a
   * best-effort rollback on failure). See `ClientProjectInput`. */
  createClientProject(viewer: User, input: ClientProjectInput): Promise<ProjectWithRelations>;
  updateProject(viewer: User, id: string, input: ProjectInput): Promise<ProjectWithRelations>;

  /**
   * Project Level Stage C, restored by the Product Owner's Boss-Aligned Project Status Restoration
   * — Admin-only lifecycle transition across the full normal business-state set: Active/On Hold/
   * Completed/Canceled/Archived. Never covers "trash" (use `trashProject`) and never restores out
   * of trash (use `restoreProject`). `reason` is required for "on-hold"/"cancelled" (both providers
   * reject an empty one) and ignored otherwise. Archiving atomically stamps `archivedAt`/
   * `archived_at` (always the latest archive date); moving to "completed" stamps `completionDate`/
   * `completion_date` only the first time (never overwritten by a later transition) — the two dates
   * are intentionally distinct fields, never conflated under one label.
   */
  setProjectStatus(
    viewer: User,
    id: string,
    status: Exclude<ProjectStatus, "trash">,
    reason?: string
  ): Promise<ProjectWithRelations>;
  /** Explicit, deliberately destructive-feeling action even though Trash is technically a status. */
  trashProject(viewer: User, id: string): Promise<ProjectWithRelations>;
  /** Explicit restore — returns the Project to whatever status it held immediately before Trash. */
  restoreProject(viewer: User, id: string): Promise<ProjectWithRelations>;

  listProjectGroups(): Promise<ProjectGroup[]>;
  createProjectGroup(viewer: User, name: string): Promise<ProjectGroup>;

  /** Phase 3 (CD-208) — "Add Template" after creation, atomic across every selection in one call
   * (a partial failure never leaves some Templates applied and others not). Gated by
   * `canManageProjectRecord`, enforced identically server-side (`can_manage_project`/
   * `apply_project_templates`) — never trust the client. Never copies global Template staffing. */
  applyProjectTemplates(
    viewer: User,
    projectId: string,
    templates: ProjectTemplateSelection[]
  ): Promise<WorkstreamWithRelations[]>;

  /** Part 11 — data-only, Project-scoped label; never a global role, never an authorization input. */
  setProjectMemberRole(viewer: User, projectId: string, userId: string, projectRole: string | null): Promise<void>;

  /**
   * Phase 4 — incremental Project staffing, gated by `canManageProjectRecord`/`can_manage_project`
   * (Admin, or an authorized Project Team Lead — Primary or Additional), never by direct-table RLS
   * alone. Project must be Active (every method below rejects otherwise, matching the existing
   * lifecycle-guard pattern on `create_workstream`/`apply_project_templates`). Deliberately separate
   * from `updateProject`'s bulk `memberUserIds` replace (which stays Admin-only, unchanged) — these
   * are the narrow, TL-usable single add/remove actions.
   */
  /** Target must be an active Supervisor, and must not already be this Project's own `ownerId`
   * (enforced server-side, not just UI-side). Adding an existing Additional TL again is a safe
   * no-op. */
  addProjectTeamLead(viewer: User, projectId: string, userId: string): Promise<ProjectWithRelations>;
  /** Admin or the Primary TL may remove any Additional TL; an Additional TL may remove another
   * Additional TL but never themselves (enforced server-side). Never touches `ownerId` or any
   * `project_members` row the same person might also hold. */
  removeProjectTeamLead(viewer: User, projectId: string, userId: string): Promise<ProjectWithRelations>;
  /** Target must be an active Employee or Supervisor — no direct-report restriction. Never creates a
   * Team Lead relationship or a `projectRole` value as a side effect. */
  addProjectMember(viewer: User, projectId: string, userId: string): Promise<ProjectWithRelations>;
  /** Removes only the `project_members` row — any Primary/Additional Team Lead authority the same
   * person holds is entirely unaffected. */
  removeProjectMember(viewer: User, projectId: string, userId: string): Promise<ProjectWithRelations>;
  /** Phase 4 QA fix — the directory for the Additional Team Lead / Project Member pickers.
   * Deliberately NOT `assignableStaffFor`/`listAssignableStaff` (team-scoped for its own existing
   * uses — Company staff assignment, Workstream Lead/Team — and correctly stays that way). Every
   * active Employee/Supervisor, unscoped by reporting line, matching the locked "no direct-report
   * restriction" requirement; the UI filters by role itself (Supervisors for the TL picker, everyone
   * for the Member picker). Returns `[]` for an Employee caller (can never reach these pickers
   * anyway). Read-only directory data — the actual authorization decision is independently
   * enforced by `addProjectTeamLead`/`addProjectMember` above, not by this method. */
  listProjectStaffingCandidates(viewer: User): Promise<User[]>;

  /** Part 19/20 — configurable Trash retention; automatic physical purge is never scheduled by
   * this codebase (see `ProjectTrashSettings`'s own doc comment for the dependency-audit finding). */
  getTrashSettings(viewer: User): Promise<ProjectTrashSettings>;
  setTrashRetentionDays(viewer: User, days: number | null): Promise<ProjectTrashSettings>;

  /** Phase 6A (CD-215) — every accessible (`can_access_project`) recorded contract period for this
   * Project, in no particular guaranteed order (callers needing "current" should use
   * `getCurrentProjectContractPeriod` from `src/lib/data/contract-periods.ts`, never re-derive it
   * inline). Read-only; never widens Project visibility beyond the existing boundary. */
  listProjectContractPeriods(viewer: User, projectId: string): Promise<ProjectContractPeriod[]>;
  /**
   * Phase 6A (CD-215) — Admin/superadmin-only. Records the FIRST period known to the new
   * contract-history subsystem for a Project that doesn't already have one — never a proof that
   * this was the client's historically-first-ever contract (a legacy Project's "Client Since" may
   * be years earlier than its first truthfully-recorded period; that gap is intentional, never
   * fabricated). `periodEnd` is always computed server-side as December 31 of `periodStart`'s
   * year — never accepted from the caller. Zero effect on Templates/Services/Activities/Tasks/
   * checklists/staffing/Partner Brand/Tags/Project Group/lifecycle status — metadata only. Renewal
   * (recording a SUCCESSOR period) is explicitly Phase 6B/CD-216 — not implemented here.
   */
  createInitialProjectContractPeriod(viewer: User, projectId: string, periodStart: string): Promise<ProjectContractPeriod>;
}

/** Threaded Project discussion — see `ProjectComment`. A comment's target (Project-root/Task/
 * Document) is fixed at creation and enforced server-side; `listComments` takes an explicit target
 * so callers never accidentally fetch a Project's entire comment set to show on a Task/Document
 * panel (or vice versa). */
export interface ProjectCommentTarget {
  projectId: string;
  taskId?: string | null;
  documentId?: string | null;
}
export interface ProjectCommentsProvider {
  listComments(viewer: User, target: ProjectCommentTarget): Promise<ProjectComment[]>;
  createComment(viewer: User, target: ProjectCommentTarget, body: string, parentCommentId: string | null): Promise<ProjectComment>;
  updateComment(viewer: User, commentId: string, body: string): Promise<ProjectComment>;
  deleteComment(viewer: User, commentId: string): Promise<void>;
}

/** Project Issues — see `ProjectIssue`; never conflated with a blocked Task. */
export interface ProjectIssueInput {
  title: string;
  description: string | null;
  workstreamId: string | null;
  activityId: string | null;
  taskId: string | null;
  assignedToId: string | null;
}
export interface ProjectIssuesProvider {
  listIssues(viewer: User, projectId: string): Promise<ProjectIssue[]>;
  createIssue(viewer: User, projectId: string, input: ProjectIssueInput): Promise<ProjectIssue>;
  updateIssueDetails(viewer: User, issueId: string, input: ProjectIssueInput): Promise<ProjectIssue>;
  setIssueStatus(
    viewer: User,
    issueId: string,
    status: ProjectIssue["status"],
    resolution?: string | null
  ): Promise<ProjectIssue>;
}
