import type { TemplatesProvider, TemplateWithTasks } from "../templates-provider";
import type { Template } from "../../types";
import { db } from "./mock-db";

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
};
