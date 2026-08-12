import type { ServiceLine, Template, TemplateChecklistItem, TemplateTask, User } from "../types";

export interface TemplateTaskWithChecklist extends TemplateTask {
  checklistItems: TemplateChecklistItem[];
}

/** Template joined with the read-shape screens actually need — not a raw schema row. */
export interface TemplateWithTasks extends Template {
  serviceLine: ServiceLine | null;
  /** Ordered by position. */
  tasks: TemplateTaskWithChecklist[];
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Templates are a shared reference library, not scoped by role or team —
 * `viewer` is still threaded through for interface consistency and in case
 * a later phase scopes templates (e.g. per brand).
 */
export interface TemplatesProvider {
  listTemplates(viewer: User): Promise<TemplateWithTasks[]>;
  getTemplate(viewer: User, id: string): Promise<TemplateWithTasks | null>;
}
