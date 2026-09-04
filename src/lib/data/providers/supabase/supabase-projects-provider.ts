import type { ProjectsProvider, ProjectWithRelations, ProjectTaskSummary, ProjectInput, ClientProjectInput, ProjectRenewalInput } from "../projects-provider";
import type { Project, ProjectGroup, ProjectStatus, ProjectTrashSettings } from "../../types";
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
  completion_date: string | null;
  start_date: string | null;
  end_date: string | null;
  project_group_id: string | null;
  tags: string[];
  status_reason: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  trashed_at: string | null;
  pre_trash_status: ProjectStatus | null;
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
    completionDate: row.completion_date,
    startDate: row.start_date,
    endDate: row.end_date,
    projectGroupId: row.project_group_id,
    tags: row.tags ?? [],
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    statusChangedById: row.status_changed_by,
    trashedAt: row.trashed_at,
    preTrashStatus: row.pre_trash_status,
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
  const creatorIds = Array.from(new Set(projects.map((p) => p.createdById)));

  const [companiesRes, memberLinksRes, workstreamsRes] = await Promise.all([
    supabase.from("companies").select("id, name, is_internal").in("id", companyIds),
    supabase.from("project_members").select("project_id, user_id, project_role").in("project_id", projectIds),
    supabase.from("workstreams").select("id, name, project_id, service_line_id").in("project_id", projectIds),
  ]);
  if (companiesRes.error) throw new Error(companiesRes.error.message);
  if (memberLinksRes.error) throw new Error(memberLinksRes.error.message);
  if (workstreamsRes.error) throw new Error(workstreamsRes.error.message);

  const companies = (companiesRes.data ?? []) as { id: string; name: string; is_internal: boolean }[];
  const memberLinks = (memberLinksRes.data ?? []) as { project_id: string; user_id: string; project_role: string | null }[];
  const workstreams = (workstreamsRes.data ?? []) as { id: string; name: string; project_id: string | null; service_line_id: string | null }[];
  const allProfileIds = Array.from(new Set([...ownerIds, ...creatorIds, ...memberLinks.map((m) => m.user_id)]));
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
    const createdBy = profiles.find((u) => u.id === project.createdById);
    if (!createdBy) throw new Error(`Project ${project.id} references unknown creator ${project.createdById}`);
    const projectMemberLinks = memberLinks.filter((m) => m.project_id === project.id);
    const members = projectMemberLinks
      .map((link) => {
        const u = profiles.find((user) => user.id === link.user_id);
        return u ? { ...u, projectRole: link.project_role } : null;
      })
      .filter((u): u is (typeof profiles)[number] & { projectRole: string | null } => u !== null);

    const projectWorkstreamIds = workstreamIdsByProject.get(project.id) ?? [];
    const services = workstreams
      .filter((w) => w.project_id === project.id)
      .map((w) => ({ id: w.id, name: w.name, serviceLineId: w.service_line_id }));
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
      isInternal: companyRow.is_internal,
      owner,
      createdBy,
      members,
      memberCount: members.length,
      workstreamCount: projectWorkstreamIds.length,
      services,
      tasks: taskSummary,
      progressPercent,
    };
  });
}

async function syncProjectMembers(projectId: string, userIds: string[]) {
  const supabase = createClient();
  await supabase.from("project_members").delete().eq("project_id", projectId);
  if (userIds.length > 0) {
    await supabase.from("project_members").insert(userIds.map((userId) => ({ project_id: projectId, user_id: userId })));
  }
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

  async createProject(_viewer, input: ProjectInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_project", {
      p_company_id: input.companyId,
      p_name: input.name,
      p_owner_id: input.ownerId,
      p_contract_start_date: input.contractStartDate,
      p_contract_months: input.contractMonths,
      p_contract_end_date: input.contractEndDate,
      p_completion_date: input.completionDate,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_description: input.description,
      p_project_group_id: input.projectGroupId,
      p_tags: input.tags,
      p_member_user_ids: input.memberUserIds,
      p_template_id: input.templateId ?? null,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  // The ONE normal "New Project" workflow for a brand-new client — delegates entirely to the
  // `create_client_project` RPC, which creates the Company (+ optional primary contact) and the
  // Project inside a single Postgres function body: genuinely atomic (a raised exception anywhere
  // rolls the whole transaction back, including the Company insert), never a client-side
  // multi-step call sequence that could leave an orphaned Company on partial failure.
  async createClientProject(_viewer, input: ClientProjectInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_client_project", {
      p_name: input.name,
      p_brand_id: input.brandId,
      p_contract_start_date: input.contractStartDate,
      p_renewal_date: input.renewalDate,
      p_contact_name: input.contactName,
      p_contact_email: input.contactEmail,
      p_contact_phone: input.contactPhone,
      p_owner_id: input.ownerId,
      p_completion_date: input.completionDate,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_description: input.description,
      p_project_group_id: input.projectGroupId,
      p_tags: input.tags,
      p_member_user_ids: input.memberUserIds,
      p_template_id: input.templateId ?? null,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  // Ordinary editing (no new Services, no status change) is a plain update + members resync — RLS
  // (`projects_update`/`project_members_write`) is already Superadmin-only, and a superadmin's own
  // `is_superadmin()` short-circuit never re-queries the row being written, so this doesn't hit the
  // RETURNING-time RLS-visibility bug class create_workstream/create_task's own RPCs were built to
  // avoid — an RPC here would be pure ceremony for a case that's already safe. Status lifecycle
  // never goes through this path — see setProjectStatus/trashProject/restoreProject below.
  async updateProject(_viewer, id, input: ProjectInput) {
    const supabase = createClient();
    const { data: current, error: currentError } = await supabase
      .from("projects")
      .select("owner_id")
      .eq("id", id)
      .single();
    if (currentError) throw new Error(currentError.message);

    const { data, error } = await supabase
      .from("projects")
      .update({
        name: input.name,
        owner_id: input.ownerId ?? current.owner_id,
        contract_start_date: input.contractStartDate,
        contract_months: input.contractMonths,
        contract_end_date: input.contractEndDate,
        completion_date: input.completionDate,
        start_date: input.startDate,
        end_date: input.endDate,
        description: input.description,
        project_group_id: input.projectGroupId,
        tags: input.tags,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await syncProjectMembers(id, input.memberUserIds);

    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  async setProjectStatus(_viewer, id, status, reason) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("set_project_status", {
      target_project_id: id,
      new_status: status,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  async trashProject(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("trash_project", { target_project_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  async restoreProject(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("restore_project", { target_project_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  async setProjectMemberRole(_viewer, projectId, userId, projectRole) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_project_member_role", {
      target_project_id: projectId,
      target_user_id: userId,
      p_project_role: projectRole,
    });
    if (error) throw new Error(error.message);
  },

  async getTrashSettings() {
    const supabase = createClient();
    const { data, error } = await supabase.from("project_trash_settings").select("retention_days, updated_at").eq("id", true).single();
    if (error) throw new Error(error.message);
    return { retentionDays: data.retention_days, updatedAt: data.updated_at } as ProjectTrashSettings;
  },

  async setTrashRetentionDays(_viewer, days) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("set_project_trash_retention", { p_retention_days: days });
    if (error) throw new Error(error.message);
    return { retentionDays: data.retention_days, updatedAt: data.updated_at } as ProjectTrashSettings;
  },

  async listProjectGroups() {
    const supabase = createClient();
    const { data, error } = await supabase.from("project_groups").select("id, name").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as ProjectGroup[];
  },

  async createProjectGroup(_viewer, name) {
    const supabase = createClient();
    const { data, error } = await supabase.from("project_groups").insert({ name: name.trim() }).select("id, name").single();
    if (error) throw new Error(error.message);
    return data as ProjectGroup;
  },

  async renewProject(_viewer, sourceProjectId, input: ProjectRenewalInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("renew_project", {
      p_source_project_id: sourceProjectId,
      p_name: input.name,
      p_contract_start_date: input.contractStartDate,
      p_contract_months: input.contractMonths,
      p_contract_end_date: input.contractEndDate,
      p_owner_id: input.ownerId,
      p_member_user_ids: input.memberUserIds,
      p_workstream_ids_to_carry: input.workstreamIdsToCarryForward,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },
};
