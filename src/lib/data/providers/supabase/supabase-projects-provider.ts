import type { ProjectsProvider, ProjectWithRelations, ProjectTaskSummary } from "../projects-provider";
import type { Project, ProjectStatus } from "../../types";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";

/**
 * Real Supabase Projects provider (Phase 8A). Read-only — no create/update method exists on the
 * interface yet (Project creation/edit is deliberately out of scope this slice). RLS
 * (`projects_select`, `can_access_project`) is the real access boundary. Flat-fetch-then-JS-join,
 * same pattern as every other real provider in this project. Owner names resolve through
 * `resolveProfileDirectory` (never a plain `profiles` select), since `profiles_select`'s own RLS
 * is too narrow for an Employee project-member to see a Supervisor owner's row directly.
 */

interface ProjectRow {
  id: string;
  company_id: string;
  name: string;
  owner_id: string;
  status: ProjectStatus;
  contract_start_date: string | null;
  contract_months: number;
  contract_end_date: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    ownerId: row.owner_id,
    status: row.status,
    contractStartDate: row.contract_start_date,
    contractMonths: row.contract_months,
    contractEndDate: row.contract_end_date,
    description: row.description,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hydrate(projects: Project[]): Promise<ProjectWithRelations[]> {
  if (projects.length === 0) return [];
  const supabase = createClient();
  const projectIds = projects.map((p) => p.id);
  const companyIds = Array.from(new Set(projects.map((p) => p.companyId)));
  const ownerIds = Array.from(new Set(projects.map((p) => p.ownerId)));

  const [companiesRes, memberLinksRes, workstreamsRes] = await Promise.all([
    supabase.from("companies").select("id, name").in("id", companyIds),
    supabase.from("project_members").select("project_id, user_id").in("project_id", projectIds),
    supabase.from("workstreams").select("id, project_id").in("project_id", projectIds),
  ]);
  if (companiesRes.error) throw new Error(companiesRes.error.message);
  if (memberLinksRes.error) throw new Error(memberLinksRes.error.message);
  if (workstreamsRes.error) throw new Error(workstreamsRes.error.message);

  const companies = (companiesRes.data ?? []) as { id: string; name: string }[];
  const memberLinks = (memberLinksRes.data ?? []) as { project_id: string; user_id: string }[];
  const workstreams = (workstreamsRes.data ?? []) as { id: string; project_id: string | null }[];
  const allProfileIds = Array.from(new Set([...ownerIds, ...memberLinks.map((m) => m.user_id)]));
  const profiles = await resolveProfileDirectory(allProfileIds);

  const workstreamIds = workstreams.map((w) => w.id);
  const tasksRes = workstreamIds.length
    ? await supabase.from("tasks").select("workstream_id, status, due_date").in("workstream_id", workstreamIds)
    : { data: [] as { workstream_id: string; status: string; due_date: string | null }[], error: null };
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  const tasks = (tasksRes.data ?? []) as { workstream_id: string; status: string; due_date: string | null }[];

  const workstreamIdsByProject = new Map<string, string[]>();
  for (const w of workstreams) {
    if (!w.project_id) continue;
    const list = workstreamIdsByProject.get(w.project_id) ?? [];
    list.push(w.id);
    workstreamIdsByProject.set(w.project_id, list);
  }

  const today = new Date().toISOString().slice(0, 10);

  return projects.map((project) => {
    const companyRow = companies.find((c) => c.id === project.companyId);
    if (!companyRow) throw new Error(`Project ${project.id} references unknown company ${project.companyId}`);
    const owner = profiles.find((u) => u.id === project.ownerId);
    if (!owner) throw new Error(`Project ${project.id} references unknown owner ${project.ownerId}`);
    const memberIds = memberLinks.filter((m) => m.project_id === project.id).map((m) => m.user_id);
    const members = profiles.filter((u) => memberIds.includes(u.id));

    const projectWorkstreamIds = workstreamIdsByProject.get(project.id) ?? [];
    const projectTasks = tasks.filter((t) => projectWorkstreamIds.includes(t.workstream_id));
    const doneCount = projectTasks.filter((t) => t.status === "done").length;
    const overdueCount = projectTasks.filter((t) => t.status !== "done" && t.due_date != null && t.due_date < today).length;
    const taskSummary: ProjectTaskSummary = {
      totalCount: projectTasks.length,
      doneCount,
      openCount: projectTasks.length - doneCount,
      overdueCount,
    };
    const progressPercent = taskSummary.totalCount === 0 ? 0 : Math.round((doneCount / taskSummary.totalCount) * 100);

    return {
      ...project,
      companyName: companyRow.name,
      owner,
      members,
      memberCount: members.length,
      workstreamCount: projectWorkstreamIds.length,
      tasks: taskSummary,
      progressPercent,
    };
  });
}

export const supabaseProjectsProvider: ProjectsProvider = {
  async listProjects() {
    const supabase = createClient();
    const { data, error } = await supabase.from("projects").select("*").order("name");
    if (error) throw new Error(error.message);
    return hydrate((data ?? []).map(toProject));
  },

  async getProject(_viewer, id) {
    if (!id) return null;
    const supabase = createClient();
    const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated ?? null;
  },
};
