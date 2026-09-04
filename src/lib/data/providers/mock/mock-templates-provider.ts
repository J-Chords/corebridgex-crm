import type { TemplatesProvider, TemplateWithTasks, ApplyTemplateInput, ApplyTemplateResult } from "../templates-provider";
import type { Template, User } from "../../types";
import { db } from "./mock-db";
import { mockWorkstreamsProvider } from "./mock-workstreams-provider";
import { mockTasksProvider } from "./mock-tasks-provider";
import { addDaysToDateString } from "../../recurrence";

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
      status: "todo",
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
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");

  const existing = db.workstreams.find((w) => w.projectId === projectId && w.serviceLineId === template.serviceLineId);
  if (existing) {
    // Already present — never a duplicate Workstream/Tasks/checklists. Merge only the missing
    // selected Activities; everything else about the existing Service (assignments, dates, Tasks,
    // time, Comments, Documents) is left exactly as it is.
    const currentActivityIds = new Set(
      db.workstreamActivities.filter((wa) => wa.workstreamId === existing.id).map((wa) => wa.activityId)
    );
    const toAdd = activityIds.filter((aid) => !currentActivityIds.has(aid));
    db.workstreamActivities = [...db.workstreamActivities, ...toAdd.map((activityId) => ({ workstreamId: existing.id, activityId }))];
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

export const mockTemplatesProvider: TemplatesProvider = {
  async listTemplates() {
    return db.templates.map(toTemplateWithTasks);
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
};
