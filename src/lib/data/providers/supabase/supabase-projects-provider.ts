import type {
  ProjectsProvider,
  ProjectWithRelations,
  ProjectTaskSummary,
  ProjectInput,
  ClientProjectInput,
  ProjectTemplateSelection,
} from "../projects-provider";
import type { Project, ProjectGroup, ProjectStatus, ProjectTrashSettings } from "../../types";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";
import { hydrateWorkstreamRows, type WorkstreamRow } from "./supabase-workstreams-provider";
import { isSuperadmin } from "../../permissions";

/** Phase 3 (CD-208) — the shape `create_project`/`create_client_project`/`apply_project_templates`
 * expect for their `p_templates jsonb` parameter. See `ProjectTemplateSelection`. */
function toTemplatesJson(templates: ProjectTemplateSelection[] | undefined) {
  return (templates ?? []).map((t) => ({
    serviceLineId: t.serviceLineId,
    activityIds: t.activityIds,
    leadUserId: t.leadUserId,
  }));
}

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
  archived_at: string | null;
  start_date: string | null;
  end_date: string | null;
  project_group_id: string | null;
  partner_brand_id: string | null;
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
    archivedAt: row.archived_at,
    startDate: row.start_date,
    endDate: row.end_date,
    projectGroupId: row.project_group_id,
    partnerBrandId: row.partner_brand_id,
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

  const partnerBrandIds = Array.from(new Set(projects.map((p) => p.partnerBrandId).filter((x): x is string => x != null)));

  const [companiesRes, memberLinksRes, workstreamsRes, brandsRes] = await Promise.all([
    supabase.from("companies").select("id, name, is_internal").in("id", companyIds),
    supabase.from("project_members").select("project_id, user_id, project_role").in("project_id", projectIds),
    supabase.from("workstreams").select("id, name, project_id, service_line_id").in("project_id", projectIds),
    partnerBrandIds.length ? supabase.from("brands").select("id, name").in("id", partnerBrandIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (companiesRes.error) throw new Error(companiesRes.error.message);
  if (memberLinksRes.error) throw new Error(memberLinksRes.error.message);
  if (workstreamsRes.error) throw new Error(workstreamsRes.error.message);
  if (brandsRes.error) throw new Error(brandsRes.error.message);

  const companies = (companiesRes.data ?? []) as { id: string; name: string; is_internal: boolean }[];
  const memberLinks = (memberLinksRes.data ?? []) as { project_id: string; user_id: string; project_role: string | null }[];
  const workstreams = (workstreamsRes.data ?? []) as { id: string; name: string; project_id: string | null; service_line_id: string | null }[];
  const partnerBrands = (brandsRes.data ?? []) as { id: string; name: string }[];
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
    // Section 23/24 — six-status model: "done" was renamed to "completed", and "canceled" is a new
    // CLOSED status that must never count as open or overdue (raw string column, not the narrower
    // TaskStatus type, so this can't just reuse the typed isTaskClosed helper).
    const isClosedStatus = (status: string) => status === "completed" || status === "canceled";
    const doneCount = projectTasks.filter((t) => t.status === "completed").length;
    const closedCount = projectTasks.filter((t) => isClosedStatus(t.status)).length;
    const overdueCount = projectTasks.filter((t) => !isClosedStatus(t.status) && t.due_date != null && t.due_date < today).length;
    const taskSummary: ProjectTaskSummary = {
      totalCount: projectTasks.length,
      doneCount,
      openCount: projectTasks.length - closedCount,
      overdueCount,
    };
    const progressPercent = taskSummary.totalCount === 0 ? 0 : Math.round((doneCount / taskSummary.totalCount) * 100);
    const partnerBrand = project.partnerBrandId ? (partnerBrands.find((b) => b.id === project.partnerBrandId) ?? null) : null;

    return {
      ...project,
      companyName: companyRow.name,
      isInternal: companyRow.is_internal,
      owner,
      partnerBrand,
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
      p_partner_brand_id: input.partnerBrandId,
      p_templates: toTemplatesJson(input.templates),
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
      p_partner_brand_id: input.partnerBrandId ?? input.brandId,
      p_templates: toTemplatesJson(input.templates),
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  // Phase 3 (CD-208) — routed through the secure `update_project_record` RPC instead of a direct
  // table `.update()`. `projects_update` RLS stays Superadmin-only (never widened to Supervisor —
  // see CD-208 section 25); a Supervisor-owner's edit now goes through this SECURITY DEFINER
  // function instead, which enforces field-level protection (name/owner/Partner Brand) itself,
  // never trusting whatever the client sends. Member sync stays Admin-only and unchanged (CD-208
  // section 29 — Team Lead gains no new Member-staffing rights in Phase 3) — the RPC never touches
  // `project_members`, so a Supervisor caller simply can't reach `syncProjectMembers` below. Status
  // lifecycle never goes through this path — see setProjectStatus/trashProject/restoreProject.
  async updateProject(viewer, id, input: ProjectInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_project_record", {
      p_project_id: id,
      p_name: input.name,
      p_owner_id: input.ownerId,
      p_contract_start_date: input.contractStartDate,
      p_contract_months: input.contractMonths,
      p_contract_end_date: input.contractEndDate,
      p_description: input.description,
      p_project_group_id: input.projectGroupId,
      p_tags: input.tags,
      p_partner_brand_id: input.partnerBrandId,
    });
    if (error) throw new Error(error.message);

    if (isSuperadmin(viewer)) {
      await syncProjectMembers(id, input.memberUserIds);
    }

    const [hydrated] = await hydrate([toProject(data)]);
    return hydrated;
  },

  async applyProjectTemplates(_viewer, projectId, templates) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("apply_project_templates", {
      p_project_id: projectId,
      p_templates: toTemplatesJson(templates),
    });
    if (error) throw new Error(error.message);
    return hydrateWorkstreamRows((data ?? []) as WorkstreamRow[]);
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

  // Phase 3 (CD-208) section 30 — routed through the narrow create_project_group RPC (Admin or
  // Supervisor) rather than the direct-table insert (still Admin-only at the RLS layer,
  // project_groups_write_admin, unchanged).
  async createProjectGroup(_viewer, name) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_project_group", { p_name: name });
    if (error) throw new Error(error.message);
    return data as ProjectGroup;
  },
};
