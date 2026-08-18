import type { TasksProvider, TaskWithRelations, TaskReuseCandidate } from "../tasks-provider";
import type { Task, TaskPriority, TaskStatus, User, Role, ChecklistItem } from "../../types";
import { assignableStaffFor } from "../../permissions";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";

/**
 * Real Supabase Tasks provider (Phase 7). RLS (`can_access_task`/`can_edit_task`/
 * `can_progress_task`) mirrors the mock's permission functions exactly and is the real boundary.
 * Status-only changes and checklist toggles are routed through the `update_task_status`/
 * `toggle_checklist_item` RPCs (never a raw `.update()`) so the Todo->In Progress auto-transition,
 * the checklist-driven Done/In-Progress auto-transition, and their notifications stay atomic and
 * consistent with A.2/A.3's actor-resolution and lifecycle rules.
 *
 * Known simplification (disclosed, not silent): `resolveAssigneeIds`'s exact scope-filtering
 * (employee forced to self; supervisor filtered to their own team) is replicated here in JS,
 * matching the mock precisely and matching what the existing Task form UI already only ever
 * offers — but unlike profiles.role/active, the RLS policy on `task_assignees` does not itself
 * re-validate that each individual assignee id is a legitimate target for the actor's role (it
 * only checks whether the actor can edit the task at all). A maliciously hand-crafted API call
 * could theoretically bypass the JS-level filtering the same way a compromised mock client could
 * bypass mockTasksProvider's own JS checks. Tightening this further (a trigger validating each
 * assignee against the actor's own scope) is a reasonable follow-up, not done in this slice.
 */

interface TaskRow {
  id: string;
  title: string;
  description: string;
  company_id: string;
  workstream_id: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  expected_minutes: number | null;
  created_by: string;
  self_added: boolean;
  template_id: string | null;
  related_contact_id: string | null;
  activity_id: string | null;
  recurrence_rule: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    companyId: row.company_id,
    workstreamId: row.workstream_id,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    expectedMinutes: row.expected_minutes,
    createdById: row.created_by,
    selfAdded: row.self_added,
    templateId: row.template_id,
    relatedContactId: row.related_contact_id,
    activityId: row.activity_id,
    recurrenceRule: row.recurrence_rule,
    statusChangedById: row.status_changed_by,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  supervisor_id: string | null;
  created_at: string;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    active: row.active,
    supervisorId: row.supervisor_id,
    assignedCompanyIds: [],
    createdAt: row.created_at,
  };
}

/** Mirrors mock-tasks-provider.ts's resolveAssigneeIds exactly — see the file-level disclosure above. */
async function resolveAssigneeIds(viewer: User, requested: string[]): Promise<string[]> {
  if (viewer.role === "employee") return [viewer.id];
  const supabase = createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  const allowed = new Set(assignableStaffFor(viewer, (data ?? []).map(toUser)).map((u) => u.id));
  const resolved = requested.filter((id) => allowed.has(id));
  return resolved.length > 0 ? resolved : [viewer.id];
}

async function hydrate(tasks: Task[]): Promise<TaskWithRelations[]> {
  if (tasks.length === 0) return [];
  const supabase = createClient();
  const ids = tasks.map((t) => t.id);
  const companyIds = Array.from(new Set(tasks.map((t) => t.companyId)));
  const workstreamIds = Array.from(new Set(tasks.map((t) => t.workstreamId)));
  const activityIds = Array.from(new Set(tasks.map((t) => t.activityId).filter((x): x is string => x != null)));
  const creatorIds = Array.from(new Set(tasks.map((t) => t.createdById)));
  const statusChangerIds = Array.from(new Set(tasks.map((t) => t.statusChangedById).filter((x): x is string => x != null)));

  const [companiesRes, workstreamsRes, assigneesRes, checklistRes] = await Promise.all([
    supabase.from("companies").select("id, name, status, brand_id, primary_contact_id, contract_start_date, renewal_date, active, created_at").in("id", companyIds),
    supabase.from("workstreams").select("id, name, project_id").in("id", workstreamIds),
    supabase.from("task_assignees").select("task_id, user_id").in("task_id", ids),
    supabase.from("checklist_items").select("*").in("task_id", ids),
  ]);

  const activitiesRes = activityIds.length
    ? await supabase.from("activities").select("id, name, department_id").in("id", activityIds)
    : { data: [] as { id: string; name: string; department_id: string }[] };
  const departmentIds = Array.from(new Set(((activitiesRes.data ?? []) as { department_id: string }[]).map((a) => a.department_id)));
  const departmentsRes = departmentIds.length
    ? await supabase.from("departments").select("id, name").in("id", departmentIds)
    : { data: [] as { id: string; name: string }[] };

  const workstreamRowsForProjects = (workstreamsRes.data ?? []) as { id: string; name: string; project_id: string | null }[];
  const projectIds = Array.from(new Set(workstreamRowsForProjects.map((w) => w.project_id).filter((x): x is string => x != null)));
  const projectsRes = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const projects = (projectsRes.data ?? []) as { id: string; name: string }[];

  const assigneeLinks = (assigneesRes.data ?? []) as { task_id: string; user_id: string }[];
  const allUserIds = Array.from(new Set([...creatorIds, ...statusChangerIds, ...assigneeLinks.map((a) => a.user_id)]));
  // Not a plain `profiles` select — `profiles_select` RLS only ever exposes self/your own direct
  // reports, which is too narrow here (e.g. an Employee viewing a Task their Supervisor created).
  // See profile-directory.ts for the real access boundary.
  const users = await resolveProfileDirectory(allUserIds);

  const companies = (companiesRes.data ?? []) as {
    id: string; name: string; status: string; brand_id: string; primary_contact_id: string | null;
    contract_start_date: string | null; renewal_date: string | null; active: boolean; created_at: string;
  }[];
  const workstreams = (workstreamsRes.data ?? []) as { id: string; name: string; project_id: string | null }[];
  const checklistRows = (checklistRes.data ?? []) as {
    id: string; task_id: string; description: string; is_done: boolean; position: number; completed_by: string | null; completed_at: string | null;
  }[];

  return tasks.map((task) => {
    const companyRow = companies.find((c) => c.id === task.companyId);
    if (!companyRow) throw new Error(`Task ${task.id} references unknown company ${task.companyId}`);
    const workstreamRow = workstreams.find((w) => w.id === task.workstreamId);
    if (!workstreamRow) throw new Error(`Task ${task.id} references unknown workstream ${task.workstreamId}`);
    const activity = (() => {
      if (!task.activityId) return null;
      const a = ((activitiesRes.data ?? []) as { id: string; name: string; department_id: string }[]).find((x) => x.id === task.activityId);
      if (!a) return null;
      const d = ((departmentsRes.data ?? []) as { id: string; name: string }[]).find((x) => x.id === a.department_id);
      return { id: a.id, name: a.name, departmentName: d?.name ?? "" };
    })();
    const assigneeIds = assigneeLinks.filter((a) => a.task_id === task.id).map((a) => a.user_id);
    const assignees = users.filter((u) => assigneeIds.includes(u.id));
    const checklistItems: ChecklistItem[] = checklistRows
      .filter((ci) => ci.task_id === task.id)
      .sort((a, b) => a.position - b.position)
      .map((ci) => ({
        id: ci.id,
        taskId: ci.task_id,
        description: ci.description,
        isDone: ci.is_done,
        position: ci.position,
        completedById: ci.completed_by,
        completedAt: ci.completed_at,
      }));
    const createdBy = users.find((u) => u.id === task.createdById);
    if (!createdBy) throw new Error(`Task ${task.id} references unknown creator ${task.createdById}`);
    const statusChangedBy = task.statusChangedById ? (users.find((u) => u.id === task.statusChangedById) ?? null) : null;

    const total = checklistItems.length;
    const done = checklistItems.filter((ci) => ci.isDone).length;
    const progressPercent = total === 0 ? 0 : Math.round((done / total) * 100);

    return {
      ...task,
      company: {
        id: companyRow.id,
        name: companyRow.name,
        status: companyRow.status as never,
        brandId: companyRow.brand_id,
        primaryContactId: companyRow.primary_contact_id,
        contractStartDate: companyRow.contract_start_date,
        renewalDate: companyRow.renewal_date,
        active: companyRow.active,
        createdAt: companyRow.created_at,
      },
      workstream: {
        id: workstreamRow.id,
        name: workstreamRow.name,
        projectId: workstreamRow.project_id,
        projectName: workstreamRow.project_id ? (projects.find((p) => p.id === workstreamRow.project_id)?.name ?? null) : null,
      },
      activity,
      assignees,
      checklistItems,
      createdBy,
      statusChangedBy,
      progressPercent,
    };
  });
}

export const supabaseTasksProvider: TasksProvider = {
  async listTasks() {
    const supabase = createClient();
    const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return hydrate((data ?? []).map(toTask));
  },

  async getTask(_viewer, id) {
    // Same empty-id guard as supabaseCompaniesProvider.getCompany/supabaseWorkstreamsProvider.getWorkstream.
    if (!id) return null;
    const supabase = createClient();
    const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await hydrate([toTask(data)]);
    return hydrated ?? null;
  },

  async createTask(_viewer, input) {
    const supabase = createClient();
    // A plain `.insert().select()` (PostgREST's INSERT...RETURNING) requires the brand-new row to
    // also pass tasks_select's can_access_task(id) — for an Employee's own self-added task, that
    // check requires an EXISTING task_assignees row, which can't exist yet (assignees were always a
    // separate, later insert); for Supervisor its own fallback branch self-referentially queries
    // `tasks` for the very row being returned, hitting the identical Postgres same-command
    // visibility gap as the Workstream case above. create_task performs the insert, assignee
    // resolution, checklist rows, and the creation notification inside one SECURITY DEFINER RPC
    // instead, returning the finished row directly — see the migration's own header comment for the
    // full root-cause writeup. Assignee scope (self-only for Employee, own team for Supervisor, any
    // active user for Superadmin, silent fallback to self) is enforced inside the RPC itself now,
    // not in this file.
    const { data, error } = await supabase.rpc("create_task", {
      p_title: input.title,
      p_description: input.description,
      p_workstream_id: input.workstreamId,
      p_activity_id: input.activityId ?? null,
      p_assignee_ids: input.assigneeIds,
      p_allow_unassigned: input.allowUnassigned ?? false,
      p_status: input.status,
      p_priority: input.priority,
      p_due_date: input.dueDate,
      p_expected_minutes: input.expectedMinutes ?? null,
      p_template_id: input.templateId ?? null,
      p_checklist_items: input.checklistItems.map((item) => item.description),
    });
    if (error) throw new Error(error.message);

    const [hydrated] = await hydrate([toTask(data)]);
    return hydrated;
  },

  async updateTask(viewer, id, input) {
    const supabase = createClient();
    const { data: previousAssigneeRows } = await supabase.from("task_assignees").select("user_id").eq("task_id", id);
    const previousAssigneeIds = (previousAssigneeRows ?? []).map((r) => r.user_id);
    const assigneeIds = await resolveAssigneeIds(viewer, input.assigneeIds);

    const { data, error } = await supabase
      .from("tasks")
      .update({
        title: input.title,
        description: input.description,
        workstream_id: input.workstreamId,
        priority: input.priority,
        due_date: input.dueDate,
        expected_minutes: input.expectedMinutes ?? null,
        activity_id: input.activityId ?? null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("task_assignees").delete().eq("task_id", id);
    if (assigneeIds.length > 0) {
      await supabase.from("task_assignees").insert(assigneeIds.map((userId) => ({ task_id: id, user_id: userId })));
    }

    const keepIds = new Set(input.checklistItems.filter((i) => i.id).map((i) => i.id));
    const { data: existingChecklist } = await supabase.from("checklist_items").select("id").eq("task_id", id);
    const idsToDelete = (existingChecklist ?? []).map((r) => r.id).filter((existingId) => !keepIds.has(existingId));
    if (idsToDelete.length > 0) {
      await supabase.from("checklist_items").delete().in("id", idsToDelete);
    }
    for (const [index, item] of input.checklistItems.entries()) {
      if (item.id) {
        await supabase.from("checklist_items").update({ description: item.description, position: index }).eq("id", item.id);
      } else {
        await supabase.from("checklist_items").insert({ task_id: id, description: item.description, position: index });
      }
    }

    const newlyAssignedIds = assigneeIds.filter((uid) => !previousAssigneeIds.includes(uid));
    if (newlyAssignedIds.length > 0) {
      await supabase.rpc("notify_task_assignment_changed", { target_task_id: id, newly_assigned_ids: newlyAssignedIds });
    }
    if (input.status !== data.status) {
      const { data: statusUpdated, error: statusError } = await supabase.rpc("update_task_status", {
        target_task_id: id,
        new_status: input.status,
      });
      if (statusError) throw new Error(statusError.message);
      const [hydrated] = await hydrate([toTask(statusUpdated as TaskRow)]);
      return hydrated;
    }

    const [hydrated] = await hydrate([toTask(data)]);
    return hydrated;
  },

  async updateTaskStatus(_viewer, id, status) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_task_status", { target_task_id: id, new_status: status });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toTask(data as TaskRow)]);
    return hydrated;
  },

  async toggleChecklistItem(_viewer, _taskId, itemId, isDone) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("toggle_checklist_item", { target_item_id: itemId, p_is_done: isDone });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([toTask(data as TaskRow)]);
    return hydrated;
  },

  async listPastTasksForActivity(_viewer, activityId, excludeTaskId): Promise<TaskReuseCandidate[]> {
    const supabase = createClient();
    let query = supabase
      .from("tasks")
      .select("id, title, description, company_id, status_changed_at, updated_at, company:companies(name)")
      .eq("activity_id", activityId)
      .eq("status", "done")
      .order("status_changed_at", { ascending: false })
      .limit(5);
    if (excludeTaskId) query = query.neq("id", excludeTaskId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as {
      id: string; title: string; description: string; status_changed_at: string | null; updated_at: string;
      company: { name: string } | { name: string }[] | null;
    }[];
    const ids = rows.map((r) => r.id);
    const checklistRes = ids.length
      ? await supabase.from("checklist_items").select("task_id, description, position").in("task_id", ids).order("position")
      : { data: [] as { task_id: string; description: string; position: number }[] };
    const checklist = (checklistRes.data ?? []) as { task_id: string; description: string; position: number }[];

    return rows.map((r) => {
      const companyName = Array.isArray(r.company) ? (r.company[0]?.name ?? "Unknown client") : (r.company?.name ?? "Unknown client");
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        companyName,
        completedAt: r.status_changed_at ?? r.updated_at,
        checklistItemDescriptions: checklist.filter((c) => c.task_id === r.id).map((c) => c.description),
      };
    });
  },
};
