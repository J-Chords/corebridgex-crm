import type {
  TemplatesProvider,
  TemplateWithTasks,
  ApplyTemplateInput,
  ApplyTemplateResult,
  TemplateBundleInput,
} from "../templates-provider";
import type { Template, TemplateChecklistItem, TemplateTask, User } from "../../types";
import { db } from "./mock-db";
import { mockWorkstreamsProvider } from "./mock-workstreams-provider";
import { mockTasksProvider } from "./mock-tasks-provider";
import { addDaysToDateString } from "../../recurrence";
import { canManageProjectRecord, isSuperadmin } from "../../permissions";

function toTemplateWithTasks(template: Template): TemplateWithTasks {
  const serviceLine = template.serviceLineId
    ? (db.serviceLines.find((sl) => sl.id === template.serviceLineId) ?? null)
    : null;

  const tasks = db.templateTasks
    .filter((tt) => tt.templateId === template.id)
    .sort((a, b) => a.position - b.position)
    .map((templateTask) => ({
      ...templateTask,
      checklistItems: db.templateChecklistItems
        .filter((ci) => ci.templateTaskId === templateTask.id)
        .sort((a, b) => a.position - b.position),
    }));

  return { ...template, serviceLine, tasks };
}

/**
 * ONE canonical "materialize a Service Template's default Tasks/checklists onto an
 * already-created Workstream" step — shared by the legacy Company-only `applyTemplate` path and
 * the Project-aware `applyServiceTemplateToProject` below, so neither duplicates this loop.
 */
export async function materializeTemplateTasks(viewer: User, templateId: string, workstreamId: string, startDate: string): Promise<void> {
  const template = db.templates.find((t) => t.id === templateId);
  if (!template) throw new Error("Service Template not found.");
  const tasks = db.templateTasks
    .filter((tt) => tt.templateId === templateId)
    .sort((a, b) => a.position - b.position);

  for (const templateTask of tasks) {
    const dueDate =
      templateTask.dueDaysAfterStart != null ? addDaysToDateString(startDate, templateTask.dueDaysAfterStart) : null;
    const checklistItems = db.templateChecklistItems
      .filter((ci) => ci.templateTaskId === templateTask.id)
      .sort((a, b) => a.position - b.position);
    await mockTasksProvider.createTask(viewer, {
      title: templateTask.title,
      description: templateTask.description,
      workstreamId,
      assigneeIds: [],
      allowUnassigned: true,
      status: "not-started",
      priority: "medium",
      // Templates only define a due-date offset (dueDaysAfterStart), never a separate start
      // offset — no legitimate data exists to populate a Start Date from, so it's left null
      // rather than derived/fabricated.
      startDate: null,
      dueDate,
      expectedMinutes: templateTask.expectedMinutes,
      checklistItems: checklistItems.map((ci) => ({ description: ci.description })),
      templateId: templateTask.id,
    });
  }
}

export interface ApplyServiceTemplateToProjectResult {
  workstreamId: string;
  status: "created" | "merged";
  serviceLineId: string;
  activitiesMerged?: number;
}

/**
 * The Project-aware canonical path (correction Section 5/6) — reuses
 * `mockWorkstreamsProvider.createWorkstream` directly (its existing Superadmin/Supervisor/Employee
 * role branches, its existing Project->Company derivation, its existing Activity-belongs-to-Service
 * validation — none of that is duplicated here), then reuses the SAME `materializeTemplateTasks`
 * helper the legacy Company-only path uses. Idempotent: if the Project already has a Workstream on
 * this Service Template's own Service Line, no second Workstream/Tasks are created — only missing
 * selected Activities are merged in.
 */
export async function applyServiceTemplateToProject(
  viewer: User,
  templateId: string,
  projectId: string,
  leadUserId: string,
  teamUserIds: string[],
  startDate: string,
  activityIds: string[]
): Promise<ApplyServiceTemplateToProjectResult> {
  const template = db.templates.find((t) => t.id === templateId);
  if (!template) throw new Error("Service Template not found.");
  if (!template.serviceLineId) {
    throw new Error("This Service Template has no Service Line configured and cannot be applied to a Project.");
  }
  // CD-218 — a deactivated Reusable Template is preserved but must never be newly applied/merged, enforced
  // here (not just by excluding it from the default picker listing) so a direct provider/RPC call
  // can't bypass it either. Mirrors the hosted apply_service_template_to_project guard exactly.
  if (!template.isActive) {
    throw new Error("This Reusable Template is inactive and can no longer be applied to new work.");
  }
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");

  // CD-217 — the create-a-new-Workstream branch below has always been protected (it delegates to
  // mockWorkstreamsProvider.createWorkstream, which enforces canManageProjectRecord for a
  // Supervisor caller), but the merge-into-an-existing-Workstream branch had NO authorization check
  // at all — any viewer (including Employee) could silently add Activities to an existing Project
  // Service merely by naming its Project/Template. Closed by checking the same canonical boundary
  // up front, before either branch runs, so both share one authorization gate instead of one being
  // implicit and the other absent. Mirrors the hosted `apply_service_template_to_project` RPC's own
  // matching fix exactly.
  const additionalTeamLeadUserIds = db.projectTeamLeads.filter((tl) => tl.projectId === project.id).map((tl) => tl.userId);
  if (!canManageProjectRecord(viewer, { ownerId: project.ownerId, additionalTeamLeadUserIds })) {
    throw new Error("You don't have permission to add a Service to that project.");
  }

  const existing = db.workstreams.find((w) => w.projectId === projectId && w.serviceLineId === template.serviceLineId);
  if (existing) {
    // Already present — never a duplicate Workstream/Tasks/checklists. Merge only the missing
    // selected Activities; everything else about the existing Service (assignments, dates, Tasks,
    // time, Comments, Documents) is left exactly as it is.
    const currentActivityIds = new Set(
      db.workstreamActivities.filter((wa) => wa.workstreamId === existing.id).map((wa) => wa.activityId)
    );
    const toAdd = activityIds.filter((aid) => !currentActivityIds.has(aid));
    db.workstreamActivities = [
      ...db.workstreamActivities,
      ...toAdd.map((activityId) => {
        const activity = db.activities.find((a) => a.id === activityId);
        return {
          workstreamId: existing.id,
          activityId,
          name: activity?.name ?? "Unknown Activity",
          description: activity?.description ?? null,
          defaultTaskTitles: activity?.defaultTaskTitles ?? [],
          position: activity?.position ?? 0,
        };
      }),
    ];
    return { workstreamId: existing.id, status: "merged", serviceLineId: template.serviceLineId, activitiesMerged: toAdd.length };
  }

  const workstream = await mockWorkstreamsProvider.createWorkstream(viewer, {
    name: template.name,
    description: template.description,
    companyId: project.companyId,
    projectId,
    serviceLineId: template.serviceLineId,
    leadUserId,
    teamUserIds,
    status: "active",
    startDate,
    endDate: null,
    recurrenceFrequency: template.recurrenceFrequency,
    recurrenceAnchorDate: template.recurrenceFrequency ? startDate : null,
    recurrenceCustomIntervalDays: template.recurrenceCustomIntervalDays,
    activityIds,
  });

  await materializeTemplateTasks(viewer, templateId, workstream.id, startDate);

  return { workstreamId: workstream.id, status: "created", serviceLineId: template.serviceLineId };
}

/** Mirrors `admin_create_template_bundle`/`admin_update_template_bundle`'s own validation exactly
 * — see that migration's comments for the reasoning behind each rule. Throws on the first
 * violation found, matching the SQL functions' own fail-fast behavior; since mock mutation only
 * ever happens after this returns cleanly (both bundle methods below validate-before-mutating, via
 * this pure function), an invalid payload can never leave partial mock state either. */
function validateBundleInput(input: TemplateBundleInput): { name: string; description: string | null } {
  const name = input.name.trim();
  if (!name) throw new Error("Reusable Template name is required.");
  const description = input.description?.trim() || null;

  const serviceLine = db.serviceLines.find((sl) => sl.id === input.serviceLineId);
  if (!serviceLine || !serviceLine.isActive) {
    throw new Error("A valid, active Service is required for a Reusable Template.");
  }

  const validFrequencies = ["weekly", "monthly", "quarterly", "yearly", "custom"] as const;
  if (input.recurrenceFrequency !== null && !validFrequencies.includes(input.recurrenceFrequency)) {
    throw new Error("Invalid recurrence frequency.");
  }
  if (input.recurrenceFrequency === "custom") {
    if (input.recurrenceCustomIntervalDays == null || input.recurrenceCustomIntervalDays <= 0) {
      throw new Error("Custom recurrence requires a positive interval in days.");
    }
  }

  const validOwnerRoles = ["superadmin", "supervisor", "employee"] as const;
  for (const task of input.tasks) {
    if (!task.title.trim()) throw new Error("Every Task requires a title.");
    if (task.dueDaysAfterStart != null && task.dueDaysAfterStart < 0) {
      throw new Error("Due offset must be zero or a positive number of days.");
    }
    if (task.expectedMinutes != null && task.expectedMinutes < 0) {
      throw new Error("Estimated time must be zero or a positive number of minutes.");
    }
    if (task.defaultOwnerRole !== null && !validOwnerRoles.includes(task.defaultOwnerRole)) {
      throw new Error("Invalid suggested owner role.");
    }
    for (const ci of task.checklistItems) {
      if (!ci.description.trim()) throw new Error("A Checklist item cannot be blank.");
    }
  }

  return { name, description };
}

export const mockTemplatesProvider: TemplatesProvider = {
  async listTemplates(_viewer, options) {
    const templates = options?.includeInactive ? db.templates : db.templates.filter((t) => t.isActive);
    return templates.map(toTemplateWithTasks);
  },

  async getTemplate(_viewer, id) {
    const template = db.templates.find((t) => t.id === id);
    return template ? toTemplateWithTasks(template) : null;
  },

  async applyTemplate(viewer, input: ApplyTemplateInput): Promise<ApplyTemplateResult> {
    if (input.projectId) {
      const result = await applyServiceTemplateToProject(
        viewer,
        input.templateId,
        input.projectId,
        input.leadUserId,
        input.teamUserIds,
        input.startDate,
        input.activityIds ?? []
      );
      return { workstreamId: result.workstreamId, status: result.status };
    }

    // Legacy Company-only path — fully unchanged behavior (no projectId, no Activities).
    const template = db.templates.find((t) => t.id === input.templateId);
    if (!template) throw new Error("Template not found.");
    if (!template.isActive) {
      throw new Error("This Reusable Template is inactive and can no longer be applied to new work.");
    }

    const workstream = await mockWorkstreamsProvider.createWorkstream(viewer, {
      name: input.name,
      description: template.description,
      companyId: input.companyId,
      serviceLineId: template.serviceLineId,
      activityIds: [],
      leadUserId: input.leadUserId,
      teamUserIds: input.teamUserIds,
      status: "active",
      startDate: input.startDate,
      endDate: null,
      recurrenceFrequency: template.recurrenceFrequency,
      recurrenceAnchorDate: template.recurrenceFrequency ? input.startDate : null,
      recurrenceCustomIntervalDays: template.recurrenceCustomIntervalDays,
    });

    await materializeTemplateTasks(viewer, input.templateId, workstream.id, input.startDate);

    return { workstreamId: workstream.id, status: "created" };
  },

  async createTemplateBundle(viewer, input) {
    if (!isSuperadmin(viewer)) throw new Error("Only an admin can create a Reusable Template.");
    const { name, description } = validateBundleInput(input);

    const now = new Date().toISOString();
    const templateId = crypto.randomUUID();
    const newTemplate: Template = {
      id: templateId,
      name,
      description,
      serviceLineId: input.serviceLineId,
      recurrenceFrequency: input.recurrenceFrequency,
      recurrenceCustomIntervalDays: input.recurrenceFrequency === "custom" ? input.recurrenceCustomIntervalDays : null,
      isActive: true,
      createdById: viewer.id,
      createdAt: now,
      updatedAt: now,
    };

    const newTasks: TemplateTask[] = [];
    const newChecklistItems: TemplateChecklistItem[] = [];
    input.tasks.forEach((task, taskIndex) => {
      const taskId = crypto.randomUUID();
      newTasks.push({
        id: taskId,
        templateId,
        title: task.title.trim(),
        description: task.description ?? "",
        defaultOwnerRole: task.defaultOwnerRole,
        dueDaysAfterStart: task.dueDaysAfterStart,
        expectedMinutes: task.expectedMinutes,
        position: taskIndex,
      });
      task.checklistItems.forEach((ci, ciIndex) => {
        newChecklistItems.push({
          id: crypto.randomUUID(),
          templateTaskId: taskId,
          description: ci.description.trim(),
          position: ciIndex,
        });
      });
    });

    // Every array is built fully in local variables above — the first `db.*` assignment below is
    // the first point any mutation happens, and by then `validateBundleInput` has already thrown
    // for any invalid payload. No partial state is ever reachable.
    db.templates = [...db.templates, newTemplate];
    db.templateTasks = [...db.templateTasks, ...newTasks];
    db.templateChecklistItems = [...db.templateChecklistItems, ...newChecklistItems];

    return toTemplateWithTasks(newTemplate);
  },

  async updateTemplateBundle(viewer, templateId, input) {
    if (!isSuperadmin(viewer)) throw new Error("Only an admin can edit a Reusable Template.");
    const existing = db.templates.find((t) => t.id === templateId);
    if (!existing) throw new Error(`Reusable Template ${templateId} not found.`);
    const { name, description } = validateBundleInput(input);

    const existingTaskIds = new Set(db.templateTasks.filter((tt) => tt.templateId === templateId).map((tt) => tt.id));

    const nextTasks: TemplateTask[] = [];
    const nextChecklistItems: TemplateChecklistItem[] = [];

    input.tasks.forEach((task, taskIndex) => {
      let taskId = task.id ?? null;
      if (taskId) {
        // A caller must not be able to reach into another Reusable Template's Task by id.
        if (!existingTaskIds.has(taskId)) throw new Error(`Task ${taskId} does not belong to this Reusable Template.`);
      } else {
        taskId = crypto.randomUUID();
      }
      nextTasks.push({
        id: taskId,
        templateId,
        title: task.title.trim(),
        description: task.description ?? "",
        defaultOwnerRole: task.defaultOwnerRole,
        dueDaysAfterStart: task.dueDaysAfterStart,
        expectedMinutes: task.expectedMinutes,
        position: taskIndex,
      });

      const existingChecklistIds = new Set(
        db.templateChecklistItems.filter((ci) => ci.templateTaskId === taskId).map((ci) => ci.id)
      );
      task.checklistItems.forEach((ci, ciIndex) => {
        let ciId = ci.id ?? null;
        if (ciId) {
          if (!existingChecklistIds.has(ciId)) throw new Error(`Checklist item ${ciId} does not belong to this Task.`);
        } else {
          ciId = crypto.randomUUID();
        }
        nextChecklistItems.push({
          id: ciId,
          templateTaskId: taskId as string,
          description: ci.description.trim(),
          position: ciIndex,
        });
      });
    });

    // Reconciliation, not recreation: retained ids are carried through unchanged above (preserving
    // tasks.templateId lineage on any already-materialized real Task), new rows get a fresh id, and
    // a row whose id never appears in `nextTasks`/`nextChecklistItems` is implicitly dropped by the
    // full-array-rebuild below — same net effect as the hosted RPC's explicit UPDATE/INSERT/DELETE,
    // since only the `id` value (never object identity) carries any lineage meaning for a mock array.
    // Every check above runs before any of these three assignments, so a thrown validation/ownership
    // error always leaves the mock db completely untouched.
    db.templates = db.templates.map((t) =>
      t.id === templateId
        ? {
            ...t,
            name,
            description,
            serviceLineId: input.serviceLineId,
            recurrenceFrequency: input.recurrenceFrequency,
            recurrenceCustomIntervalDays:
              input.recurrenceFrequency === "custom" ? input.recurrenceCustomIntervalDays : null,
            updatedAt: new Date().toISOString(),
          }
        : t
    );
    db.templateTasks = [...db.templateTasks.filter((tt) => tt.templateId !== templateId), ...nextTasks];
    db.templateChecklistItems = [
      ...db.templateChecklistItems.filter((ci) => !existingTaskIds.has(ci.templateTaskId)),
      ...nextChecklistItems,
    ];

    // Mirrors `tasks.template_id -> template_tasks(id) ON DELETE SET NULL` exactly: a Template Task
    // deliberately dropped from this edit never deletes or rewrites any already-materialized real
    // Task created from it — only that one lineage pointer goes null, same as the hosted FK would do.
    const retainedTaskIds = new Set(nextTasks.map((t) => t.id));
    const removedTaskIds = new Set([...existingTaskIds].filter((taskId) => !retainedTaskIds.has(taskId)));
    if (removedTaskIds.size > 0) {
      db.tasks = db.tasks.map((t) => (t.templateId && removedTaskIds.has(t.templateId) ? { ...t, templateId: null } : t));
    }

    const updated = db.templates.find((t) => t.id === templateId)!;
    return toTemplateWithTasks(updated);
  },

  async setTemplateActive(viewer, templateId, isActive) {
    if (!isSuperadmin(viewer)) throw new Error("Only an admin can activate or deactivate a Reusable Template.");
    const existing = db.templates.find((t) => t.id === templateId);
    if (!existing) throw new Error(`Reusable Template ${templateId} not found.`);

    db.templates = db.templates.map((t) =>
      t.id === templateId ? { ...t, isActive, updatedAt: new Date().toISOString() } : t
    );

    const updated = db.templates.find((t) => t.id === templateId)!;
    return toTemplateWithTasks(updated);
  },
};
