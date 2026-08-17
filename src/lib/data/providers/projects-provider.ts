import type { Project, User } from "../types";

/** Task-completion rollup for a Project's own Tasks (Project -> Workstreams -> Tasks) — computed
 * on read from the current Task status model, never a second, separately-tracked progress engine. */
export interface ProjectTaskSummary {
  totalCount: number;
  doneCount: number;
  openCount: number;
  overdueCount: number;
}

/** Project joined with the read-shape a list/detail screen actually needs — not a raw schema row. */
export interface ProjectWithRelations extends Project {
  companyName: string;
  owner: User;
  memberCount: number;
  workstreamCount: number;
  tasks: ProjectTaskSummary;
  /** 0-100, derived from `tasks` (doneCount / totalCount) — never persisted. */
  progressPercent: number;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement. Phase 8A is a read-only
 * surface — Project creation/edit is deliberately out of scope this slice (see
 * docs/current-project-state.md's Phase 8A notes), so only reads exist here for now.
 */
export interface ProjectsProvider {
  listProjects(viewer: User): Promise<ProjectWithRelations[]>;
  getProject(viewer: User, id: string): Promise<ProjectWithRelations | null>;
}
