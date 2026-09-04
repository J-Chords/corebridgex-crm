import type { ProjectIssuesProvider, ProjectIssueInput } from "../projects-provider";
import type { ProjectIssue } from "../../types";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";

interface IssueRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: ProjectIssue["status"];
  created_by: string;
  assigned_to: string | null;
  workstream_id: string | null;
  activity_id: string | null;
  task_id: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

async function hydrate(rows: IssueRow[]): Promise<ProjectIssue[]> {
  if (rows.length === 0) return [];
  const supabase = createClient();
  const userIds = Array.from(new Set([...rows.map((r) => r.created_by), ...rows.flatMap((r) => (r.assigned_to ? [r.assigned_to] : []))]));
  const activityIds = Array.from(new Set(rows.flatMap((r) => (r.activity_id ? [r.activity_id] : []))));
  const [users, activitiesRes] = await Promise.all([
    resolveProfileDirectory(userIds),
    activityIds.length
      ? supabase.from("activities").select("id, name").in("id", activityIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (activitiesRes.error) throw new Error(activitiesRes.error.message);
  const activities = activitiesRes.data ?? [];
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    status: r.status,
    createdById: r.created_by,
    createdByName: users.find((u) => u.id === r.created_by)?.fullName ?? "Unknown",
    assignedToId: r.assigned_to,
    assignedToName: r.assigned_to ? (users.find((u) => u.id === r.assigned_to)?.fullName ?? "Unknown") : null,
    workstreamId: r.workstream_id,
    activityId: r.activity_id,
    activityName: r.activity_id ? (activities.find((a) => a.id === r.activity_id)?.name ?? null) : null,
    taskId: r.task_id,
    resolution: r.resolution,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export const supabaseProjectIssuesProvider: ProjectIssuesProvider = {
  async listIssues(_viewer, projectId) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("project_issues")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as IssueRow[]);
  },

  async createIssue(_viewer, projectId, input: ProjectIssueInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_project_issue", {
      target_project_id: projectId,
      p_title: input.title,
      p_description: input.description,
      p_workstream_id: input.workstreamId,
      p_task_id: input.taskId,
      p_assigned_to: input.assignedToId,
      p_activity_id: input.activityId,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as IssueRow]);
    return hydrated;
  },

  async updateIssueDetails(_viewer, issueId, input: ProjectIssueInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_project_issue_details", {
      target_issue_id: issueId,
      p_title: input.title,
      p_description: input.description,
      p_assigned_to: input.assignedToId,
      p_workstream_id: input.workstreamId,
      p_task_id: input.taskId,
      p_activity_id: input.activityId,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as IssueRow]);
    return hydrated;
  },

  async setIssueStatus(_viewer, issueId, status, resolution) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("set_project_issue_status", {
      target_issue_id: issueId,
      new_status: status,
      p_resolution: resolution ?? null,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as IssueRow]);
    return hydrated;
  },
};
