import type { Project, ProjectStatus, User } from "../types";

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
  /** Every operational Project member — resolved through the same safe profile-directory
   * architecture as Task/Workstream relations (never a plain `profiles` select). */
  members: User[];
  memberCount: number;
  workstreamCount: number;
  /** Every Service (Workstream) under this Project — light name-only reference, Phase 8E's Project
   * list "Service summary" reads from this instead of re-fetching the full Services tab. */
  services: ProjectServiceSummary[];
  tasks: ProjectTaskSummary;
  /** 0-100, derived from `tasks` (doneCount / totalCount) — never persisted. */
  progressPercent: number;
}

/** Superadmin-only Project create/edit input (Phase 8E) — `canManageProjects` is the permission gate. */
export interface ProjectInput {
  companyId: string;
  name: string;
  ownerId: string;
  status: ProjectStatus;
  contractStartDate: string | null;
  contractMonths: number;
  contractEndDate: string | null;
  description: string | null;
  memberUserIds: string[];
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
  updateProject(viewer: User, id: string, input: ProjectInput): Promise<ProjectWithRelations>;
  /** Creates a new Project under the same Company as `sourceProjectId`, carrying forward only the
   * explicitly selected current configuration — see `ProjectRenewalInput`. The source Project is
   * never modified. */
  renewProject(viewer: User, sourceProjectId: string, input: ProjectRenewalInput): Promise<ProjectWithRelations>;
}
