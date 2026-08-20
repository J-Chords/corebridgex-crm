import type { AccomplishmentsReportProvider, GenerateReportInput } from "../accomplishments-report-provider";
import type {
  AccomplishmentsReport,
  AccomplishmentsReportActivityLine,
  AccomplishmentsReportBrandSection,
  AccomplishmentsReportComment,
  AccomplishmentsReportHistoryEvent,
  ReportKind,
} from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Accomplishments Reports provider (Phase 7E). `generateReport`'s evidence-
 * gathering/grouping logic stays in TypeScript (flat-fetch-then-JS-join, mirroring
 * gatherEvidence/buildLine/buildBrandSections in mock-accomplishments-report-provider.ts exactly)
 * — every other state transition (finalize/reopen/comment/trash/restore/permanent-delete) is a
 * thin wrapper around the matching RPC.
 */

interface ReportRow {
  id: string;
  kind: ReportKind;
  subject_user_id: string | null;
  subject_company_id: string | null;
  subject_label: string;
  range_label: AccomplishmentsReport["rangeLabel"];
  range_start: string;
  range_end: string;
  status: AccomplishmentsReport["status"];
  brand_sections: AccomplishmentsReportBrandSection[];
  history: AccomplishmentsReportHistoryEvent[];
  generated_by: string;
  generated_by_name: string;
  generated_at: string;
  finalized_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function toReport(row: ReportRow, comments: AccomplishmentsReportComment[]): AccomplishmentsReport {
  return {
    id: row.id,
    kind: row.kind,
    subjectId: (row.kind === "person" ? row.subject_user_id : row.subject_company_id) as string,
    subjectLabel: row.subject_label,
    rangeLabel: row.range_label,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    status: row.status,
    brandSections: row.brand_sections,
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

async function hydrate(rows: ReportRow[]): Promise<AccomplishmentsReport[]> {
  if (rows.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accomplishments_report_comments")
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

function dateInRange(iso: string, rangeStart: string, rangeEnd: string): boolean {
  const date = iso.slice(0, 10);
  return date >= rangeStart && date <= rangeEnd;
}

interface TaskRow {
  id: string;
  title: string;
  company_id: string;
  activity_id: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
}

interface TaskEvidence {
  task: TaskRow;
  checklistDone: { description: string }[];
  timeEntryMinutes: number;
  timeEntryNotes: string[];
  taskNotes: string[];
  statusTouched: boolean;
}

function isTouched(e: TaskEvidence): boolean {
  return e.checklistDone.length > 0 || e.timeEntryMinutes > 0 || e.statusTouched;
}

function taskFragment(e: TaskEvidence): string {
  let line = `- ${e.task.title}`;
  if (e.timeEntryMinutes > 0) line += ` (${(e.timeEntryMinutes / 60).toFixed(1)}h)`;
  const bits = [...e.timeEntryNotes, ...e.taskNotes].filter(Boolean);
  if (bits.length > 0) line += `: ${bits.join("; ")}`;
  return line;
}

/** Gathers candidate tasks + evidence for one report generation, mirroring gatherEvidence exactly.
 * For a "client" report every actor's work on that company's tasks counts; for "person" only the
 * subject's own actions do — so the two kinds fetch differently: client fetches all evidence for
 * every one of the company's tasks, person fetches only the subject's own evidence rows first and
 * derives the relevant task set from those (equivalent result, without needing every task in the
 * app visible to compute it). */
async function gatherEntries(kind: ReportKind, subjectId: string, rangeStart: string, rangeEnd: string): Promise<TaskEvidence[]> {
  const supabase = createClient();
  const rangeStartTs = `${rangeStart}T00:00:00.000Z`;
  const rangeEndTs = `${rangeEnd}T23:59:59.999Z`;

  if (kind === "client") {
    const { data: taskRows, error: taskError } = await supabase
      .from("tasks")
      .select("id, title, company_id, activity_id, status_changed_by, status_changed_at")
      .eq("company_id", subjectId);
    if (taskError) throw new Error(taskError.message);
    const tasks = (taskRows ?? []) as TaskRow[];
    if (tasks.length === 0) return [];
    const taskIds = tasks.map((t) => t.id);

    const [checklistRes, timeEntriesRes, notesRes] = await Promise.all([
      supabase.from("checklist_items").select("task_id, description, is_done, completed_at, completed_by").in("task_id", taskIds).eq("is_done", true).gte("completed_at", rangeStartTs).lte("completed_at", rangeEndTs),
      supabase.from("time_entries").select("task_id, duration_minutes, notes, start_time").in("task_id", taskIds).not("duration_minutes", "is", null).gte("start_time", rangeStartTs).lte("start_time", rangeEndTs),
      supabase.from("notes").select("task_id, body, created_at").in("task_id", taskIds).not("task_id", "is", null).gte("created_at", rangeStartTs).lte("created_at", rangeEndTs),
    ]);
    if (checklistRes.error) throw new Error(checklistRes.error.message);
    if (timeEntriesRes.error) throw new Error(timeEntriesRes.error.message);
    if (notesRes.error) throw new Error(notesRes.error.message);

    const checklist = (checklistRes.data ?? []) as { task_id: string; description: string; completed_at: string }[];
    const timeEntries = (timeEntriesRes.data ?? []) as { task_id: string; duration_minutes: number | null; notes: string | null; start_time: string }[];
    const notes = (notesRes.data ?? []) as { task_id: string; body: string; created_at: string }[];

    return tasks
      .map((task) => {
        const checklistDone = checklist.filter((c) => c.task_id === task.id && dateInRange(c.completed_at, rangeStart, rangeEnd)).map((c) => ({ description: c.description }));
        const dayTimeEntries = timeEntries.filter((te) => te.task_id === task.id && dateInRange(te.start_time, rangeStart, rangeEnd));
        const timeEntryMinutes = dayTimeEntries.reduce((sum, te) => sum + (te.duration_minutes ?? 0), 0);
        const timeEntryNotes = dayTimeEntries.map((te) => te.notes).filter((n): n is string => !!n);
        const taskNotes = notes.filter((n) => n.task_id === task.id && dateInRange(n.created_at, rangeStart, rangeEnd)).map((n) => n.body);
        const statusTouched = task.status_changed_at != null && dateInRange(task.status_changed_at, rangeStart, rangeEnd);
        return { task, checklistDone, timeEntryMinutes, timeEntryNotes, taskNotes, statusTouched };
      })
      .filter(isTouched);
  }

  // "person" — gather the subject's own evidence rows first, derive the task set from those.
  const [checklistRes, timeEntriesRes, notesRes, statusTasksRes] = await Promise.all([
    supabase.from("checklist_items").select("task_id, description, completed_at").eq("completed_by", subjectId).eq("is_done", true).gte("completed_at", rangeStartTs).lte("completed_at", rangeEndTs),
    supabase.from("time_entries").select("task_id, duration_minutes, notes, start_time").eq("user_id", subjectId).not("duration_minutes", "is", null).gte("start_time", rangeStartTs).lte("start_time", rangeEndTs),
    supabase.from("notes").select("task_id, body, created_at").eq("author_id", subjectId).not("task_id", "is", null).gte("created_at", rangeStartTs).lte("created_at", rangeEndTs),
    supabase.from("tasks").select("id, title, company_id, activity_id, status_changed_by, status_changed_at").eq("status_changed_by", subjectId).gte("status_changed_at", rangeStartTs).lte("status_changed_at", rangeEndTs),
  ]);
  if (checklistRes.error) throw new Error(checklistRes.error.message);
  if (timeEntriesRes.error) throw new Error(timeEntriesRes.error.message);
  if (notesRes.error) throw new Error(notesRes.error.message);
  if (statusTasksRes.error) throw new Error(statusTasksRes.error.message);

  const checklist = (checklistRes.data ?? []) as { task_id: string; description: string; completed_at: string }[];
  const timeEntries = (timeEntriesRes.data ?? []) as { task_id: string; duration_minutes: number | null; notes: string | null; start_time: string }[];
  const notes = (notesRes.data ?? []) as { task_id: string; body: string; created_at: string }[];
  const statusTasks = (statusTasksRes.data ?? []) as TaskRow[];

  const taskIds = Array.from(new Set([...checklist.map((c) => c.task_id), ...timeEntries.map((t) => t.task_id), ...notes.map((n) => n.task_id), ...statusTasks.map((t) => t.id)]));
  const missingIds = taskIds.filter((id) => !statusTasks.some((t) => t.id === id));
  const extraTasksRes = missingIds.length
    ? await supabase.from("tasks").select("id, title, company_id, activity_id, status_changed_by, status_changed_at").in("id", missingIds)
    : { data: [] as TaskRow[], error: null };
  if (extraTasksRes.error) throw new Error(extraTasksRes.error.message);
  const allTasks = [...statusTasks, ...((extraTasksRes.data ?? []) as TaskRow[])];

  return allTasks
    .map((task) => {
      const checklistDone = checklist.filter((c) => c.task_id === task.id && dateInRange(c.completed_at, rangeStart, rangeEnd)).map((c) => ({ description: c.description }));
      const dayTimeEntries = timeEntries.filter((te) => te.task_id === task.id && dateInRange(te.start_time, rangeStart, rangeEnd));
      const timeEntryMinutes = dayTimeEntries.reduce((sum, te) => sum + (te.duration_minutes ?? 0), 0);
      const timeEntryNotes = dayTimeEntries.map((te) => te.notes).filter((n): n is string => !!n);
      const taskNotes = notes.filter((n) => n.task_id === task.id && dateInRange(n.created_at, rangeStart, rangeEnd)).map((n) => n.body);
      const statusTouched = task.status_changed_by === subjectId && task.status_changed_at != null && dateInRange(task.status_changed_at, rangeStart, rangeEnd);
      return { task, checklistDone, timeEntryMinutes, timeEntryNotes, taskNotes, statusTouched };
    })
    .filter(isTouched);
}

async function buildBrandSections(entries: TaskEvidence[], forceIncludeBrandId: string | null): Promise<AccomplishmentsReportBrandSection[]> {
  const supabase = createClient();
  const companyIds = Array.from(new Set(entries.map((e) => e.task.company_id)));
  const { data: companyRows, error: companyError } = companyIds.length
    ? await supabase.from("companies").select("id, brand_id").in("id", companyIds)
    : { data: [] as { id: string; brand_id: string }[], error: null };
  if (companyError) throw new Error(companyError.message);
  const companiesById = new Map(((companyRows ?? []) as { id: string; brand_id: string }[]).map((c) => [c.id, c.brand_id]));

  const { data: allCompanyRows } = await supabase.from("companies").select("id, name");
  const companyNameById = new Map(((allCompanyRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  function companyLabelFor(matching: TaskEvidence[]): string {
    const names = Array.from(new Set(matching.map((e) => companyNameById.get(e.task.company_id)).filter((n): n is string => !!n)));
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  }

  function buildLine(activityId: string | null, activityName: string, brandEntries: TaskEvidence[]): AccomplishmentsReportActivityLine {
    const matching = brandEntries.filter((e) => (e.task.activity_id ?? null) === activityId);
    return {
      activityId,
      activityName,
      done: matching.length > 0,
      detail: matching.map(taskFragment).join("\n"),
      sourceTaskIds: matching.map((e) => e.task.id),
      companyLabel: companyLabelFor(matching),
    };
  }

  const byBrand = new Map<string, TaskEvidence[]>();
  for (const e of entries) {
    const brandId = companiesById.get(e.task.company_id);
    if (!brandId) continue;
    const list = byBrand.get(brandId) ?? [];
    list.push(e);
    byBrand.set(brandId, list);
  }
  if (forceIncludeBrandId && !byBrand.has(forceIncludeBrandId)) {
    byBrand.set(forceIncludeBrandId, []);
  }

  const brandIds = Array.from(byBrand.keys());
  if (brandIds.length === 0) return [];
  const { data: brandRows, error: brandError } = await supabase.from("brands").select("id, name").in("id", brandIds);
  if (brandError) throw new Error(brandError.message);
  const brands = ((brandRows ?? []) as { id: string; name: string }[]).slice().sort((a, b) => a.name.localeCompare(b.name));

  const sections: AccomplishmentsReportBrandSection[] = [];
  for (const brand of brands) {
    const brandEntries = byBrand.get(brand.id) ?? [];
    const { data: deptRows, error: deptError } = await supabase.from("departments").select("id, name").eq("brand_id", brand.id).order("position");
    if (deptError) throw new Error(deptError.message);
    const departmentIds = ((deptRows ?? []) as { id: string; name: string }[]).map((d) => d.id);
    const { data: activityRows, error: activityError } = departmentIds.length
      ? await supabase.from("activities").select("id, name, department_id").in("department_id", departmentIds).order("position")
      : { data: [] as { id: string; name: string; department_id: string }[], error: null };
    if (activityError) throw new Error(activityError.message);

    const departments = ((deptRows ?? []) as { id: string; name: string }[])
      .map((dept) => ({
        departmentId: dept.id,
        departmentName: dept.name,
        activities: ((activityRows ?? []) as { id: string; name: string; department_id: string }[])
          .filter((a) => a.department_id === dept.id)
          .map((a) => buildLine(a.id, a.name, brandEntries))
          .filter((a) => a.done),
      }))
      .filter((dept) => dept.activities.length > 0);
    const other = buildLine(null, "Other (untagged)", brandEntries);
    sections.push({ brandId: brand.id, brandName: brand.name, departments, other, otherIncluded: other.done });
  }
  return sections;
}

export const supabaseAccomplishmentsReportProvider: AccomplishmentsReportProvider = {
  async generateReport(viewer, input: GenerateReportInput) {
    const subjectId = input.kind === "person" ? viewer.id : input.subjectId;
    const supabase = createClient();

    const entries = await gatherEntries(input.kind, subjectId, input.rangeStart, input.rangeEnd);
    let forceIncludeBrandId: string | null = null;
    let subjectLabel: string;
    if (input.kind === "person") {
      subjectLabel = viewer.fullName;
    } else {
      const { data: company, error } = await supabase.from("companies").select("name, brand_id").eq("id", subjectId).single();
      if (error) throw new Error(error.message);
      subjectLabel = company.name;
      forceIncludeBrandId = company.brand_id;
    }
    const brandSections = await buildBrandSections(entries, forceIncludeBrandId);

    // Phase 9B: the evidence-gathering above is unchanged — only the final write moves off a raw
    // `.insert().select().single()` and onto `generate_accomplishments_report`, a SECURITY DEFINER
    // RPC that independently re-validates authorization (person: always self; client: ordinary
    // company access) and performs the insert itself, closing the same raw-insert/RETURNING-vs-
    // RLS-visibility inconsistency fixed for Client Reports in this same slice.
    const { data, error } = await supabase.rpc("generate_accomplishments_report", {
      p_kind: input.kind,
      p_subject_id: subjectId,
      p_subject_label: subjectLabel,
      p_range_label: input.rangeLabel,
      p_range_start: input.rangeStart,
      p_range_end: input.rangeEnd,
      p_brand_sections: brandSections,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async listReports() {
    const supabase = createClient();
    const { data, error } = await supabase.from("accomplishments_reports").select("*").is("deleted_at", null).order("generated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as ReportRow[]);
  },

  async listTrashedReports() {
    const supabase = createClient();
    const { data, error } = await supabase.from("accomplishments_reports").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as ReportRow[]);
  },

  async getReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.from("accomplishments_reports").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated ?? null;
  },

  async updateDraft(_viewer, id, brandSections) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_accomplishments_report_draft", { target_report_id: id, p_brand_sections: brandSections });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async finalizeReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("finalize_accomplishments_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async reopenReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("reopen_accomplishments_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async addComment(_viewer, id, body) {
    const supabase = createClient();
    const { error } = await supabase.rpc("add_accomplishments_report_comment", { target_report_id: id, p_body: body });
    if (error) throw new Error(error.message);
    const { data, error: fetchError } = await supabase.from("accomplishments_reports").select("*").eq("id", id).single();
    if (fetchError) throw new Error(fetchError.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async trashReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("trash_accomplishments_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async restoreReport(_viewer, id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("restore_accomplishments_report", { target_report_id: id });
    if (error) throw new Error(error.message);
    const [hydrated] = await hydrate([data as ReportRow]);
    return hydrated;
  },

  async permanentlyDeleteReport(_viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.rpc("permanently_delete_accomplishments_report", { target_report_id: id });
    if (error) throw new Error(error.message);
  },
};
