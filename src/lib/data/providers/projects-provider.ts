import type {
  Project,
  ProjectComment,
  ProjectGroup,
  ProjectIssue,
  ProjectStatus,
  ProjectTemplate,
  ProjectTemplateApplyStep,
  ProjectTemplateServiceConfig,
  ProjectTrashSettings,
  User,
} from "../types";

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
  /** The real, actual user who created this Project — distinct from `owner` (see `createdById` on
   * `Project` itself). Resolved through the same safe profile-directory as `owner`/`members`. */
  createdBy: User;
  /** Every operational Project member — resolved through the same safe profile-directory
   * architecture as Task/Workstream relations (never a plain `profiles` select) — each carrying its
   * own optional, Project-scoped `projectRole` label (never a global role). */
  members: (User & { projectRole: string | null })[];
  memberCount: number;
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
  tags: string[];
  memberUserIds: string[];
  /** Create-only — ignored by `updateProject`. Optional; materializes the Template's referenced
   * Services/Activities onto the new Project via the existing canonical `create_workstream` path. */
  templateId?: string | null;
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
  /** Company master contract/renewal fields — distinct from the Project's own `startDate`/
   * `endDate`/`completionDate` below, never conflated (see docs/project-level-product-
   * architecture.md's "Contract/renewal information" section). */
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
  templateId?: string | null;
}

/**
 * What a "Renew Project" call carries forward from the source Project into a brand-new one under
 * the SAME Company — never mutating/deleting the source. `workstreamIdsToCarryForward` is an
 * explicit, reviewable subset of the source Project's own Services (see docs/current-project-
 * state.md's Phase 8E notes for exactly what does/doesn't copy with each carried Service).
 */
export interface ProjectRenewalInput {
  name: string;
  contractStartDate: string | null;
  contractMonths: number;
  contractEndDate: string | null;
  ownerId: string;
  memberUserIds: string[];
  workstreamIdsToCarryForward: string[];
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement. Phase 8A was a read-only
 * surface; Phase 8E adds Superadmin-only creation, editing, and annual renewal.
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
  /** Creates a new Project under the same Company as `sourceProjectId`, carrying forward only the
   * explicitly selected current configuration — see `ProjectRenewalInput`. The source Project is
   * never modified. */
  renewProject(viewer: User, sourceProjectId: string, input: ProjectRenewalInput): Promise<ProjectWithRelations>;

  /**
   * Project Level Stage C — lifecycle status transitions, Admin-only. Never covers "trash" (use
   * `trashProject`) and never restores out of trash (use `restoreProject`) — status-select is
   * never a substitute for the explicit destructive/restorative action. `reason` is required by
   * the underlying RPC for "on-hold"/"cancelled" and ignored otherwise.
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

  /** Part 11 — data-only, Project-scoped label; never a global role, never an authorization input. */
  setProjectMemberRole(viewer: User, projectId: string, userId: string, projectRole: string | null): Promise<void>;

  /** Part 19/20 — configurable Trash retention; automatic physical purge is never scheduled by
   * this codebase (see `ProjectTrashSettings`'s own doc comment for the dependency-audit finding). */
  getTrashSettings(viewer: User): Promise<ProjectTrashSettings>;
  setTrashRetentionDays(viewer: User, days: number | null): Promise<ProjectTrashSettings>;
}

/**
 * Project Templates — Admin-managed presets that BUNDLE existing Service Templates/recipes (the
 * pre-existing `templates`/`template_tasks`/`template_checklist_items` architecture — see
 * `TemplatesProvider`) onto a Project. Never a second recurrence/default-Task/checklist system:
 * every bundled entry references an existing `templates.id`, and applying materializes that
 * recipe's own recurrence/Tasks/checklists via `TemplatesProvider.applyTemplate`'s Project-aware
 * path (see `docs/project-level-product-architecture.md`'s Template architecture section).
 */
export interface ProjectTemplatesProvider {
  listTemplates(viewer: User): Promise<ProjectTemplate[]>;
  /** The Template's own current Service Template/Activity configuration — read alongside the
   * template list when managing/selecting one. */
  getTemplateServices(viewer: User, templateId: string): Promise<ProjectTemplateServiceConfig[]>;
  createTemplate(viewer: User, name: string, description: string | null): Promise<ProjectTemplate>;
  updateTemplate(viewer: User, templateId: string, name: string, description: string | null, active: boolean): Promise<ProjectTemplate>;
  /** Replace-set — the Admin submits the Template's full desired Service Template selection each
   * time. Each id must be an existing `templates.id` with its own Service Line configured. */
  setTemplateServices(viewer: User, templateId: string, serviceTemplateIds: string[]): Promise<void>;
  /** Replace-set for one bundled Service Template's Activities — validated to belong to that
   * Service Template's own Service Line. */
  setTemplateActivities(viewer: User, templateId: string, serviceTemplateId: string, activityIds: string[]): Promise<void>;
  /**
   * Applies this whole bundle to an already-existing Project ("Project -> Services -> Apply
   * Template"). Idempotent per Service Line: a Service the Project already has is never
   * duplicated — only its missing selected Activities are merged in. The resolved lead for every
   * newly-materialized Service is the Project's own real owner (never fabricated, never
   * caller-supplied) — same convention Create-Project-with-Template already uses.
   */
  applyToProject(viewer: User, projectTemplateId: string, projectId: string): Promise<ProjectTemplateApplyStep[]>;
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
