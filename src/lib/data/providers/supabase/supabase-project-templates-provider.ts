import type { ProjectTemplatesProvider } from "../projects-provider";
import type { ProjectTemplate, ProjectTemplateApplyStep } from "../../types";
import { createClient } from "@/lib/supabase/client";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toTemplate(row: TemplateRow): ProjectTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseProjectTemplatesProvider: ProjectTemplatesProvider = {
  async listTemplates() {
    const supabase = createClient();
    const { data, error } = await supabase.from("project_templates").select("*").order("name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as TemplateRow[]).map(toTemplate);
  },

  async getTemplateServices(_viewer, templateId) {
    const supabase = createClient();
    const [{ data: services, error: servicesError }, { data: activities, error: activitiesError }] = await Promise.all([
      supabase
        .from("project_template_services")
        .select("service_template_id, service_line_id")
        .eq("project_template_id", templateId),
      supabase
        .from("project_template_activities")
        .select("service_template_id, activity_id")
        .eq("project_template_id", templateId),
    ]);
    if (servicesError) throw new Error(servicesError.message);
    if (activitiesError) throw new Error(activitiesError.message);
    return (services ?? []).map((s) => ({
      serviceTemplateId: s.service_template_id as string,
      serviceLineId: s.service_line_id as string,
      activityIds: (activities ?? [])
        .filter((a) => a.service_template_id === s.service_template_id)
        .map((a) => a.activity_id as string),
    }));
  },

  async createTemplate(_viewer, name, description) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_project_template", { p_name: name, p_description: description });
    if (error) throw new Error(error.message);
    return toTemplate(data as TemplateRow);
  },

  async updateTemplate(_viewer, templateId, name, description, active) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_project_template", {
      p_template_id: templateId,
      p_name: name,
      p_description: description,
      p_active: active,
    });
    if (error) throw new Error(error.message);
    return toTemplate(data as TemplateRow);
  },

  async setTemplateServices(_viewer, templateId, serviceTemplateIds) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_project_template_services", {
      p_template_id: templateId,
      p_service_template_ids: serviceTemplateIds,
    });
    if (error) throw new Error(error.message);
  },

  async setTemplateActivities(_viewer, templateId, serviceTemplateId, activityIds) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_project_template_activities", {
      p_template_id: templateId,
      p_service_template_id: serviceTemplateId,
      p_activity_ids: activityIds,
    });
    if (error) throw new Error(error.message);
  },

  async applyToProject(_viewer, projectTemplateId, projectId): Promise<ProjectTemplateApplyStep[]> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("apply_project_template", {
      p_project_template_id: projectTemplateId,
      p_project_id: projectId,
    });
    if (error) throw new Error(error.message);
    const steps = (data ?? []) as { status: "created" | "merged"; workstreamId: string; serviceLineId: string; activitiesMerged?: number }[];
    if (steps.length === 0) return [];

    const serviceLineIds = Array.from(new Set(steps.map((s) => s.serviceLineId)));
    const { data: lines, error: linesError } = await supabase.from("service_lines").select("id, name").in("id", serviceLineIds);
    if (linesError) throw new Error(linesError.message);

    return steps.map((s) => ({
      serviceLineId: s.serviceLineId,
      serviceLineName: (lines ?? []).find((l) => l.id === s.serviceLineId)?.name ?? "Service",
      // The RPC only returns the resolved Service Line, not the Service Template's own name — this
      // is Admin/preview-only display text, not authorization-relevant, so falling back here rather
      // than a second round trip is the right trade-off.
      serviceTemplateName: (lines ?? []).find((l) => l.id === s.serviceLineId)?.name ?? "Service Template",
      status: s.status,
      workstreamId: s.workstreamId,
      activitiesMerged: s.activitiesMerged,
    }));
  },
};
