import type { WorkstreamsProvider, WorkstreamWithRelations } from "../workstreams-provider";
import type { Activity, Brand, Company, RecurrenceFrequency, ServiceLine, Workstream, WorkstreamStatus } from "../../types";
import { computeWorkstreamBudget } from "../../time-budget";
import { computeWorkstreamRecurrence } from "../../recurrence";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";

/**
 * Real Supabase Workstreams provider (Phase 7). RLS (`workstreams_select`/`_insert`/`_update`,
 * `can_access_workstream`) is the real access boundary — mirrors `canAccessWorkstream` exactly,
 * including the Internal/Non-billable company's always-visible workstream. This file's job is
 * purely row <-> `WorkstreamWithRelations` mapping, same flat-fetch-then-JS-join style as the
 * Companies provider, for the same reason (avoids fragile multi-relationship embed strings).
 */

interface WorkstreamRow {
  id: string;
  name: string;
  description: string | null;
  company_id: string;
  project_id: string | null;
  service_line_id: string | null;
  brand_id: string;
  lead_user_id: string;
  status: WorkstreamStatus;
  start_date: string | null;
  end_date: string | null;
  recurrence_frequency: RecurrenceFrequency | null;
  recurrence_anchor_date: string | null;
  recurrence_custom_interval_days: number | null;
  previous_occurrence_workstream_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toWorkstream(row: WorkstreamRow): Workstream {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    companyId: row.company_id,
    projectId: row.project_id,
    serviceLineId: row.service_line_id,
    brandId: row.brand_id,
    leadUserId: row.lead_user_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    recurrenceFrequency: row.recurrence_frequency,
    recurrenceAnchorDate: row.recurrence_anchor_date,
    recurrenceCustomIntervalDays: row.recurrence_custom_interval_days,
    previousOccurrenceWorkstreamId: row.previous_occurrence_workstream_id,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function hydrate(workstreams: Workstream[]): Promise<WorkstreamWithRelations[]> {
  if (workstreams.length === 0) return [];
  const supabase = createClient();
  const ids = workstreams.map((w) => w.id);
  const companyIds = Array.from(new Set(workstreams.map((w) => w.companyId)));
  const brandIds = Array.from(new Set(workstreams.map((w) => w.brandId)));
  const serviceLineIds = Array.from(new Set(workstreams.map((w) => w.serviceLineId).filter((x): x is string => x != null)));
  const leadIds = Array.from(new Set(workstreams.map((w) => w.leadUserId)));

  const [companiesRes, brandsRes, serviceLinesRes, membersRes, activityLinksRes, tasksRes, timeEntriesRes, successorsRes] =
    await Promise.all([
      supabase.from("companies").select("*").in("id", companyIds),
      supabase.from("brands").select("id, name").in("id", brandIds),
      serviceLineIds.length ? supabase.from("service_lines").select("id, name").in("id", serviceLineIds) : Promise.resolve({ data: [] }),
      supabase.from("workstream_members").select("workstream_id, user_id").in("workstream_id", ids),
      supabase.from("workstream_activities").select("workstream_id, activity_id").in("workstream_id", ids),
      supabase.from("tasks").select("id, workstream_id, status, expected_minutes").in("workstream_id", ids),
      Promise.resolve({ data: [] as { task_id: string; duration_minutes: number | null; billable: boolean }[] }),
      supabase.from("workstreams").select("id, previous_occurrence_workstream_id").in("previous_occurrence_workstream_id", ids),
    ]);

  const companies = (companiesRes.data ?? []) as {
    id: string; name: string; status: string; brand_id: string; primary_contact_id: string | null;
    contract_start_date: string | null; renewal_date: string | null; active: boolean; created_at: string;
  }[];
  const brands = (brandsRes.data ?? []) as Brand[];
  const serviceLines = (serviceLinesRes.data ?? []) as ServiceLine[];
  const members = (membersRes.data ?? []) as { workstream_id: string; user_id: string }[];
  const memberIds = Array.from(new Set(members.map((m) => m.user_id)));
  const allUserIds = Array.from(new Set([...leadIds, ...memberIds]));
  // Not a plain `profiles` select — `profiles_select` RLS only ever exposes self/your own direct
  // reports, which is too narrow here (e.g. an Employee viewing a Workstream their Supervisor
  // leads). See profile-directory.ts for the real access boundary.
  const users = await resolveProfileDirectory(allUserIds);

  const activityLinks = (activityLinksRes.data ?? []) as { workstream_id: string; activity_id: string }[];
  const activityIds = Array.from(new Set(activityLinks.map((l) => l.activity_id)));
  const activitiesRes = activityIds.length
    ? await supabase.from("activities").select("*").in("id", activityIds)
    : { data: [] as { id: string; department_id: string; name: string; position: number; default_task_titles: string[] }[] };
  const activities = ((activitiesRes.data ?? []) as { id: string; department_id: string; name: string; position: number; default_task_titles: string[] }[]).map(
    (a): Activity => ({ id: a.id, departmentId: a.department_id, name: a.name, position: a.position, defaultTaskTitles: a.default_task_titles })
  );

  const tasks = (tasksRes.data ?? []) as { id: string; workstream_id: string; status: string; expected_minutes: number | null }[];
  const taskIds = tasks.map((t) => t.id);
  const entriesRes = taskIds.length
    ? await supabase.from("time_entries").select("task_id, duration_minutes, billable").in("task_id", taskIds)
    : { data: [] as { task_id: string; duration_minutes: number | null; billable: boolean }[] };
  const entries = (entriesRes.data ?? timeEntriesRes.data ?? []) as { task_id: string; duration_minutes: number | null; billable: boolean }[];
  const successors = (successorsRes.data ?? []) as { previous_occurrence_workstream_id: string | null }[];

  const today = todayDateString();

  return workstreams.map((workstream) => {
    const companyRow = companies.find((c) => c.id === workstream.companyId);
    if (!companyRow) throw new Error(`Workstream ${workstream.id} references unknown company ${workstream.companyId}`);
    const company: Company = {
      id: companyRow.id,
      name: companyRow.name,
      status: companyRow.status as Company["status"],
      brandId: companyRow.brand_id,
      primaryContactId: companyRow.primary_contact_id,
      contractStartDate: companyRow.contract_start_date,
      renewalDate: companyRow.renewal_date,
      active: companyRow.active,
      createdAt: companyRow.created_at,
    };
    const brand = brands.find((b) => b.id === workstream.brandId);
    if (!brand) throw new Error(`Workstream ${workstream.id} references unknown brand ${workstream.brandId}`);
    const serviceLine = workstream.serviceLineId ? (serviceLines.find((sl) => sl.id === workstream.serviceLineId) ?? null) : null;
    const lead = users.find((u) => u.id === workstream.leadUserId);
    if (!lead) throw new Error(`Workstream ${workstream.id} references unknown lead ${workstream.leadUserId}`);
    const teamIds = members.filter((m) => m.workstream_id === workstream.id).map((m) => m.user_id);
    const team = users.filter((u) => teamIds.includes(u.id));
    const enabledActivityIds = activityLinks.filter((l) => l.workstream_id === workstream.id).map((l) => l.activity_id);
    const workstreamActivities = activities.filter((a) => enabledActivityIds.includes(a.id));

    const workstreamTasks = tasks.filter((t) => t.workstream_id === workstream.id);
    const taskCount = workstreamTasks.length;
    const doneTaskCount = workstreamTasks.filter((t) => t.status === "done").length;
    const progressPercent = taskCount === 0 ? 0 : Math.round((doneTaskCount / taskCount) * 100);

    const expectedMinutes = workstreamTasks.some((t) => t.expected_minutes != null)
      ? workstreamTasks.reduce((sum, t) => sum + (t.expected_minutes ?? 0), 0)
      : null;
    const wsTaskIds = new Set(workstreamTasks.map((t) => t.id));
    const wsEntries = entries.filter((e) => wsTaskIds.has(e.task_id) && e.duration_minutes !== null);
    const billableMinutes = wsEntries.filter((e) => e.billable).reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
    const nonBillableMinutes = wsEntries.filter((e) => !e.billable).reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
    const budget = computeWorkstreamBudget({
      expectedMinutes,
      actualMinutes: billableMinutes + nonBillableMinutes,
      billableMinutes,
      nonBillableMinutes,
    });

    const hasSuccessor = successors.some((s) => s.previous_occurrence_workstream_id === workstream.id);
    const recurrence = computeWorkstreamRecurrence(
      workstream.recurrenceFrequency
        ? {
            frequency: workstream.recurrenceFrequency,
            anchorDate: workstream.recurrenceAnchorDate ?? workstream.startDate ?? today,
            customIntervalDays: workstream.recurrenceCustomIntervalDays,
          }
        : null,
      workstream.startDate,
      hasSuccessor,
      today
    );

    return {
      ...workstream,
      company,
      serviceLine,
      brand,
      lead,
      team,
      activities: workstreamActivities,
      taskCount,
      doneTaskCount,
      progressPercent,
      budget,
      recurrence,
    };
  });
}

async function syncTeam(workstreamId: string, userIds: string[]) {
  const supabase = createClient();
  await supabase.from("workstream_members").delete().eq("workstream_id", workstreamId);
  if (userIds.length > 0) {
    await supabase.from("workstream_members").insert(userIds.map((userId) => ({ workstream_id: workstreamId, user_id: userId })));
  }
}

async function syncActivities(workstreamId: string, activityIds: string[]) {
  const supabase = createClient();
  await supabase.from("workstream_activities").delete().eq("workstream_id", workstreamId);
  if (activityIds.length > 0) {
    const { error } = await supabase
      .from("workstream_activities")
      .insert(activityIds.map((activityId) => ({ workstream_id: workstreamId, activity_id: activityId })));
    if (error) throw new Error(error.message);
  }
}

export const supabaseWorkstreamsProvider: WorkstreamsProvider = {
  async listWorkstreams(_viewer, filters) {
    const supabase = createClient();
    let query = supabase.from("workstreams").select("*").order("name");
    if (filters?.companyId) query = query.eq("company_id", filters.companyId);
    if (filters?.projectId) query = query.eq("project_id", filters.projectId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return hydrate((data ?? []).map(toWorkstream));
  },

  async getWorkstream(_viewer, id) {
    // Same empty-id guard as supabaseCompaniesProvider.getCompany — a caller mid-render can pass
    // "" before its own dependency (e.g. a Task's workstreamId) has loaded; treat that as
    // "not found yet" rather than sending "" into a uuid column comparison.
    if (!id) return null;
    const supabase = createClient();
    const { data, error } = await supabase.from("workstreams").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await hydrate([toWorkstream(data)]);
    return hydrated ?? null;
  },

  async createWorkstream(_viewer, input) {
    const supabase = createClient();
    // A plain `.insert().select()` (PostgREST's INSERT...RETURNING) requires the brand-new row to
    // also pass workstreams_select's can_access_workstream(id) — for a non-superadmin self-leading
    // a new Service, that check queries the very row being inserted, which Postgres's own command-
    // visibility rules can never let it see within the same statement. create_workstream performs
    // the insert (and the team/activities follow-up writes) inside one SECURITY DEFINER RPC instead,
    // returning the finished row directly — see the migration's own header comment for the full
    // root-cause writeup. The RPC re-implements workstreams_insert's exact authorization itself
    // (Employee: canAccessProject + self-lead only, no team; Supervisor/Superadmin: unrestricted).
    const { data, error } = await supabase.rpc("create_workstream", {
      p_name: input.name,
      p_description: input.description,
      p_company_id: input.companyId,
      p_project_id: input.projectId ?? null,
      p_service_line_id: input.serviceLineId,
      p_lead_user_id: input.leadUserId,
      p_team_user_ids: input.teamUserIds,
      p_activity_ids: input.activityIds,
      p_status: input.status,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_recurrence_frequency: input.recurrenceFrequency,
      p_recurrence_anchor_date: input.recurrenceFrequency ? input.recurrenceAnchorDate : null,
      p_recurrence_custom_interval_days: input.recurrenceFrequency === "custom" ? input.recurrenceCustomIntervalDays : null,
      p_previous_occurrence_workstream_id: input.previousOccurrenceWorkstreamId ?? null,
    });
    if (error) throw new Error(error.message);

    const [hydrated] = await hydrate([toWorkstream(data)]);
    return hydrated;
  },

  async updateWorkstream(_viewer, id, input) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workstreams")
      .update({
        name: input.name,
        description: input.description,
        service_line_id: input.serviceLineId,
        lead_user_id: input.leadUserId,
        status: input.status,
        start_date: input.startDate,
        end_date: input.endDate,
        recurrence_frequency: input.recurrenceFrequency,
        recurrence_anchor_date: input.recurrenceFrequency ? input.recurrenceAnchorDate : null,
        recurrence_custom_interval_days: input.recurrenceFrequency === "custom" ? input.recurrenceCustomIntervalDays : null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await syncTeam(id, input.teamUserIds);
    await syncActivities(id, input.activityIds);

    const [hydrated] = await hydrate([toWorkstream(data)]);
    return hydrated;
  },
};
