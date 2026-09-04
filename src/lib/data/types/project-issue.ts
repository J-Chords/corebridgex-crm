export type ProjectIssueStatus = "open" | "in-progress" | "resolved" | "cancelled";

/**
 * A real Project-level concern — never conflated with a blocked Task. May affect the whole
 * Project, one Service (`workstreamId`), one Task, or nothing specific yet. Deliberately its own
 * status enum, never reusing Project's or Task's.
 */
export interface ProjectIssue {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: ProjectIssueStatus;
  createdById: string;
  createdByName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  workstreamId: string | null;
  /** Requires `workstreamId` to also be set — an Activity is only meaningful within its own
   * Service. Validated server-side against `workstream_activities`. */
  activityId: string | null;
  activityName: string | null;
  taskId: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
