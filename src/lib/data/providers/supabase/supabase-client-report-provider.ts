import type { ClientReportProvider, GenerateClientReportInput } from "../client-report-provider";
import type {
  ClientReport,
  ClientReportComment,
  ClientReportDepartmentSection,
  ClientReportHistoryEvent,
  ClientReportLineItem,
  ClientReportLineItemSource,
  DailyUpdateEntry,
} from "../../types";
import { formatMinutes } from "../../../format-minutes";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Client Reports provider (Phase 7E). `generateReport`'s evidence-gathering stays
 * in TypeScript, mirroring computeDepartmentSections/contributorsForDate/resolveDayContribution
 * in mock-client-report-provider.ts exactly — every other state transition is a thin RPC wrapper.
 * The name-free/anonymization boundary is unchanged from the mock: line items never carry a
 * name, only task title + duration (raw fallback) or the person's own reviewed Daily Update
 * `details` prose — staff identity (`generatedByName`/comments/history) stays on the row for
 * internal audit use, exactly as it does in the mock, and must never be surfaced by whatever
 * eventually produces a client-facing print/export view.
 */

interface ReportRow {
  id: string;
  company_id: string;
  company_label: string;
  brand_id: string;
  brand_label: string;
  range_label: ClientReport["rangeLabel"];
  range_start: string;
  range_end: string;
  status: ClientReport["status"];
  departments: ClientReportDepartmentSection[];
  history: ClientReportHistoryEvent[];
  generated_by: string;
  generated_by_name: string;
  generated_at: string;
  finalized_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function toReport(row: ReportRow, comments: ClientReportComment[]): ClientReport {
  return {
    id: row.id,
    companyId: row.company_id,
    companyLabel: row.company_label,
    brandId: row.brand_id,
    brandLabel: row.brand_label,
    rangeLabel: row.range_label,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    status: row.status,
    departments: row.departments,
    comments,
    history: row.history,
    generatedById: row.generated_by,
    generatedByName: row.generated_by_name,
    generatedAt: row.generated_at,
    finalizedAt: row.finalized_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hydrate(rows: ReportRow[]): Promise<ClientReport[]> {
  if (rows.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("client_report_comments")
    .select("*")
    .in("report_id", rows.map((r) => r.id))
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const commentRows = (data ?? []) as { id: string; report_id: string; author_id: string; author_name: string; body: string; created_at: string }[];
  return rows.map((row) =>
    toReport(
      row,
      commentRows
        .filter((c) => c.report_id === row.id)
        .map((c) => ({ id: c.id, authorId: c.author_id, authorName: c.author_name, body: c.body, createdAt: c.created_at }))
    )
  );
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function eachDateInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = shiftDate(d, 1)) dates.push(d);
  return dates;
}

interface RawContribution {
  activityId: string | null;
  date: string;
  minutes: number;
  details: string;
  source: ClientReportLineItemSource;
}

function toLineItem(c: RawContribution): ClientReportLineItem {
  return { id: crypto.randomUUID(), date: c.date, minutes: c.minutes, details: c.details, source: c.source };
}

function byDate(a: ClientReportLineItem, b: ClientReportLineItem): number {
  return a.date.localeCompare(b.date);
}

async function computeDepartmentSections(companyId: string, rangeStart: string, rangeEnd: string): Promise<ClientReportDepartmentSection[]> {
  const supabase = createClient();
  const rangeStartTs = `${rangeStart}T00:00:00.000Z`;
  const rangeEndTs = `${rangeEnd}T23:59:59.999Z`;

  const { data: taskRows, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, activity_id, status_changed_by, status_changed_at")
    .eq("company_id", companyId);
  if (taskError) throw new Error(taskError.message);
  const companyTasks = (taskRows ?? []) as {
    id: string; title: string; activity_id: string | null; status_changed_by: string | null; status_changed_at: string | null;
  }[];
  const taskIds = companyTasks.map((t) => t.id);

  const [timeEntriesRes, dailyUpdatesRes] = await Promise.all([
    taskIds.length
      ? supabase.from("time_entries").select("task_id, user_id, duration_minutes, start_time").in("task_id", taskIds).not("duration_minutes", "is", null).gte("start_time", rangeStartTs).lte("start_time", rangeEndTs)
      : Promise.resolve({ data: [] as { task_id: string; user_id: string; duration_minutes: number | null; start_time: string }[], error: null }),
    supabase.from("daily_updates").select("user_id, date, status, entries").eq("status", "confirmed").gte("date", rangeStart).lte("date", rangeEnd),
  ]);
  if (timeEntriesRes.error) throw new Error(timeEntriesRes.error.message);
  if (dailyUpdatesRes.error) throw new Error(dailyUpdatesRes.error.message);

  const timeEntries = (timeEntriesRes.data ?? []) as { task_id: string; user_id: string; duration_minutes: number | null; start_time: string }[];
  const dailyUpdates = (dailyUpdatesRes.data ?? []) as { user_id: string; date: string; status: string; entries: DailyUpdateEntry[] }[];

  function contributorsForDate(date: string): Set<string> {
    const ids = new Set<string>();
    for (const task of companyTasks) {
      for (const te of timeEntries) {
        if (te.task_id === task.id && te.start_time.slice(0, 10) === date) ids.add(te.user_id);
      }
      if (task.status_changed_by && task.status_changed_at?.slice(0, 10) === date) ids.add(task.status_changed_by);
    }
    for (const update of dailyUpdates) {
      if (update.date !== date) continue;
      if (update.entries.some((e) => e.companyId === companyId)) ids.add(update.user_id);
    }
    return ids;
  }

  function resolveDayContribution(userId: string, date: string): RawContribution[] {
    const update = dailyUpdates.find((u) => u.user_id === userId && u.date === date);
    if (update) {
      return update.entries
        .filter((e) => e.companyId === companyId)
        .map((e) => ({ activityId: e.activityId, date, minutes: e.minutesLogged, details: e.details, source: "daily-update" as const }));
    }

    const items: RawContribution[] = [];
    for (const task of companyTasks) {
      const dayTimeEntries = timeEntries.filter((te) => te.task_id === task.id && te.user_id === userId && te.start_time.slice(0, 10) === date);
      const minutes = dayTimeEntries.reduce((sum, te) => sum + (te.duration_minutes ?? 0), 0);
      const statusTouched = task.status_changed_by === userId && task.status_changed_at?.slice(0, 10) === date;
      if (minutes === 0 && !statusTouched) continue;
      items.push({
        activityId: task.activity_id,
        date,
        minutes,
        details: minutes > 0 ? `${task.title} (${formatMinutes(minutes)})` : task.title,
        source: "raw",
      });
    }
    return items;
  }

  const contributions: RawContribution[] = [];
  for (const date of eachDateInRange(rangeStart, rangeEnd)) {
    for (const userId of contributorsForDate(date)) {
      contributions.push(...resolveDayContribution(userId, date));
    }
  }

  const byActivityId = new Map<string, RawContribution[]>();
  const otherContributions: RawContribution[] = [];
  for (const c of contributions) {
    if (c.activityId === null) {
      otherContributions.push(c);
      continue;
    }
    const list = byActivityId.get(c.activityId) ?? [];
    list.push(c);
    byActivityId.set(c.activityId, list);
  }

  const activityIds = Array.from(byActivityId.keys());
  const { data: activityRows, error: activityError } = activityIds.length
    ? await supabase.from("activities").select("id, name, department_id, position").in("id", activityIds)
    : { data: [] as { id: string; name: string; department_id: string; position: number }[], error: null };
  if (activityError) throw new Error(activityError.message);
  const activities = (activityRows ?? []) as { id: string; name: string; department_id: string; position: number }[];
  const departmentIds = Array.from(new Set(activities.map((a) => a.department_id)));
  const { data: deptRows, error: deptError } = departmentIds.length
    ? await supabase.from("departments").select("id, name, position").in("id", departmentIds)
    : { data: [] as { id: string; name: string; position: number }[], error: null };
  if (deptError) throw new Error(deptError.message);
  const departmentsById = new Map(((deptRows ?? []) as { id: string; name: string; position: number }[]).map((d) => [d.id, d]));

  interface DeptAccum {
    departmentId: string;
    departmentName: string;
    position: number;
    activities: { activityId: string; activityName: string; position: number; lineItems: ClientReportLineItem[] }[];
  }
  const accum = new Map<string, DeptAccum>();

  for (const [activityId, items] of byActivityId) {
    const activity = activities.find((a) => a.id === activityId);
    if (!activity) continue;
    const department = departmentsById.get(activity.department_id);
    if (!department) continue;
    let dept = accum.get(department.id);
    if (!dept) {
      dept = { departmentId: department.id, departmentName: department.name, position: department.position, activities: [] };
      accum.set(department.id, dept);
    }
    dept.activities.push({ activityId: activity.id, activityName: activity.name, position: activity.position, lineItems: items.map(toLineItem).sort(byDate) });
  }

  const departments: ClientReportDepartmentSection[] = Array.from(accum.values())
    .sort((a, b) => a.position - b.position)
    .map((d) => ({
      departmentId: d.departmentId,
      departmentName: d.departmentName,
      activities: d.activities.sort((a, b) => a.position - b.position).map(({ activityId, activityName, lineItems }) => ({ activityId, activityName, lineItems })),
    }));

  if (otherContributions.length > 0) {
    departments.push({
      departmentId: null,
      departmentName: "Other",
      activities: [{ activityId: null, activityName: "Untagged work", lineItems: otherContributions.map(toLineItem).sort(byDate) }],
    });
  }

  return departments;
}

export const supabaseClientReportProvider: ClientReportProvider = {
  async generateReport(viewer, input: GenerateClientReportInput) {
    const supabase = createClient();
    const { data: company, error: companyError } = await supabase.from("companies").select("name, brand_id").eq("id", input.companyId).single();
    if (companyError) throw new Error(companyError.message);
    const { data: brand, error: brandError } = await supabase.from("brands").select("name").eq("id", company.brand_id).single();
    if (brandError) throw new Error(brandError.message);

    const departments = await computeDepartmentSections(input.companyId, input.rangeStart, input.rangeEnd);

    const { data, error } = await supabase
      .from("client_reports")
      .insert({
        company_id: input.companyId,
        company_label: company.name,
        brand_id: company.brand_id,
        brand_label: brand.name,
        range_label: input.rangeLabel,
        range_start: input.rangeStart,
        range_end: input.rangeEnd,
        departments,
        generated_by: viewer.id,
        generated_by_name: viewer.fullName,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async listReports() {
    const supabase = createClient();
    const { data, error } = await supabase.from("client_reports").select("*").is("deleted_at", null).order("generated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as ReportRow[]);
  },

  async listTrashedReports() {
    const supabase = createClient();
    const { data, error } = await supabase.from("client_reports").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as ReportRow[]);
  },

  async getReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.from("client_reports").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated ?? null;
  },

  async updateDraft(_viewer, id, departments) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_client_report_draft", { target_report_id: id, p_departments: departments });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async finalizeReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("finalize_client_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async reopenReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("reopen_client_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async addComment(_viewer, id, body) {
    const supabase = createClient();
    const { error } = await supabase.rpc("add_client_report_comment", { target_report_id: id, p_body: body });
    if (error) throw new Error(error.message);
    const { data, error: fetchError } = await supabase.from("client_reports").select("*").eq("id", id).single();
    if (fetchError) throw new Error(fetchError.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async trashReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("trash_client_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async restoreReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("restore_client_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async permanentlyDeleteReport(_viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.rpc("permanently_delete_client_report", { target_report_id: id });
    if (error) throw new Error(error.message);
  },
};
