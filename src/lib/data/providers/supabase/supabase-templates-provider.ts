import type {
  TemplatesProvider,
  TemplateWithTasks,
  TemplateTaskWithChecklist,
  ApplyTemplateInput,
  ApplyTemplateResult,
} from "../templates-provider";
import type { Template, TemplateTask, TemplateChecklistItem, ServiceLine, RecurrenceFrequency, Role } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Templates provider (Phase 7D). Reference library, not role-scoped — mirrors the
 * mock exactly (no permission check inside this provider; "who can apply a template" is gated at
 * the consumer side by `canManageWorkstreams`, unchanged). No in-app template editor exists, so
 * this only ever reads.
 */

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  service_line_id: string | null;
  recurrence_frequency: RecurrenceFrequency | null;
  recurrence_custom_interval_days: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    serviceLineId: row.service_line_id,
    recurrenceFrequency: row.recurrence_frequency,
    recurrenceCustomIntervalDays: row.recurrence_custom_interval_days,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hydrate(templates: Template[]): Promise<TemplateWithTasks[]> {
  if (templates.length === 0) return [];
  const supabase = createClient();
  const templateIds = templates.map((t) => t.id);
  const serviceLineIds = Array.from(new Set(templates.map((t) => t.serviceLineId).filter((x): x is string => x != null)));

  const [serviceLinesRes, taskRowsRes] = await Promise.all([
    serviceLineIds.length
      ? supabase.from("service_lines").select("id, name").in("id", serviceLineIds)
      : Promise.resolve({ data: [] as ServiceLine[] }),
    supabase.from("template_tasks").select("*").in("template_id", templateIds).order("position"),
  ]);
  if ("error" in taskRowsRes && taskRowsRes.error) throw new Error(taskRowsRes.error.message);

  const serviceLines = (serviceLinesRes.data ?? []) as ServiceLine[];
  const taskRows = (taskRowsRes.data ?? []) as {
    id: string;
    template_id: string;
    title: string;
    description: string;
    default_owner_role: Role | null;
    due_days_after_start: number | null;
    expected_minutes: number | null;
    position: number;
  }[];

  const taskIds = taskRows.map((t) => t.id);
  const checklistRes = taskIds.length
    ? await supabase.from("template_checklist_items").select("*").in("template_task_id", taskIds).order("position")
    : { data: [] as { id: string; template_task_id: string; description: string; position: number }[] };
  const checklistRows = (checklistRes.data ?? []) as { id: string; template_task_id: string; description: string; position: number }[];

  const tasks: TemplateTask[] = taskRows.map((t) => ({
    id: t.id,
    templateId: t.template_id,
    title: t.title,
    description: t.description,
    defaultOwnerRole: t.default_owner_role,
    dueDaysAfterStart: t.due_days_after_start,
    expectedMinutes: t.expected_minutes,
    position: t.position,
  }));
  const checklistItems: TemplateChecklistItem[] = checklistRows.map((c) => ({
    id: c.id,
    templateTaskId: c.template_task_id,
    description: c.description,
    position: c.position,
  }));

  return templates.map((template) => {
    const serviceLine = template.serviceLineId ? (serviceLines.find((sl) => sl.id === template.serviceLineId) ?? null) : null;
    const templateTasks: TemplateTaskWithChecklist[] = tasks
      .filter((t) => t.templateId === template.id)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        ...t,
        checklistItems: checklistItems.filter((c) => c.templateTaskId === t.id).sort((a, b) => a.position - b.position),
      }));
    return { ...template, serviceLine, tasks: templateTasks };
  });
}

export const supabaseTemplatesProvider: TemplatesProvider = {
  async listTemplates() {
    const supabase = createClient();
    const { data, error } = await supabase.from("templates").select("*").order("name");
    if (error) throw new Error(error.message);
    return hydrate((data ?? []).map(toTemplate));
  },

  async getTemplate(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.from("templates").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await hydrate([toTemplate(data)]);
    return hydrated ?? null;
  },

  async applyTemplate(_viewer, input: ApplyTemplateInput): Promise<ApplyTemplateResult> {
    const supabase = createClient();

    if (input.projectId) {
      // Project-aware path — reuses create_workstream's own role-based authorization (Superadmin/
      // Supervisor/Employee) via apply_service_template_to_project, never the looser
      // Company-only Supervisor-or-Superadmin check the legacy RPC below still uses unchanged.
      const { data, error } = await supabase.rpc("apply_service_template_to_project", {
        p_template_id: input.templateId,
        p_project_id: input.projectId,
        p_lead_user_id: input.leadUserId,
        p_team_user_ids: input.teamUserIds,
        p_start_date: input.startDate,
        p_activity_ids: input.activityIds ?? [],
      });
      if (error) throw new Error(error.message);
      const result = data as { workstreamId: string; status: "created" | "merged" };
      return { workstreamId: result.workstreamId, status: result.status };
    }

    const { data, error } = await supabase.rpc("apply_template", {
      target_template_id: input.templateId,
      p_company_id: input.companyId,
      p_name: input.name,
      p_lead_user_id: input.leadUserId,
      p_team_user_ids: input.teamUserIds,
      p_start_date: input.startDate,
    });
    if (error) throw new Error(error.message);
    return { workstreamId: data as string, status: "created" };
  },
};
