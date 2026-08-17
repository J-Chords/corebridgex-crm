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

export interface ApplyTemplateInput {
  templateId: string;
  companyId: string;
  /** Trimmed workstream name — the caller (ApplyTemplateDialog) owns suggesting/editing this. */
  name: string;
  leadUserId: string;
  teamUserIds: string[];
  startDate: string;
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
  /**
   * Creates the workstream, its team, every template task, and each task's checklist items as
   * one unit — never partially applied. Templates carry no Activity concept of their own, so the
   * new workstream always starts with zero configured Activities (never a fallback to the full
   * Service catalog).
   */
  applyTemplate(viewer: User, input: ApplyTemplateInput): Promise<{ workstreamId: string }>;
}
