import type { TemplatesProvider, TemplateWithTasks, ApplyTemplateInput } from "../templates-provider";
import type { Template } from "../../types";
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

export const mockTemplatesProvider: TemplatesProvider = {
  async listTemplates() {
    return db.templates.map(toTemplateWithTasks);
  },

  async getTemplate(_viewer, id) {
    const template = db.templates.find((t) => t.id === id);
    return template ? toTemplateWithTasks(template) : null;
  },

  async applyTemplate(viewer, input: ApplyTemplateInput) {
    const template = db.templates.find((t) => t.id === input.templateId);
    if (!template) throw new Error("Template not found.");
    const templateWithTasks = toTemplateWithTasks(template);

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

    for (const templateTask of templateWithTasks.tasks) {
      const dueDate =
        templateTask.dueDaysAfterStart != null
          ? addDaysToDateString(input.startDate, templateTask.dueDaysAfterStart)
          : null;
      await mockTasksProvider.createTask(viewer, {
        title: templateTask.title,
        description: templateTask.description,
        workstreamId: workstream.id,
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
        checklistItems: templateTask.checklistItems.map((ci) => ({ description: ci.description })),
        templateId: templateTask.id,
      });
    }

    return { workstreamId: workstream.id };
  },
};
