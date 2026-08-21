import type { ClientReportProvider, GenerateClientReportInput } from "../client-report-provider";
import type {
  ClientReport,
  ClientReportComment,
  ClientReportDepartmentSection,
  ClientReportHistoryEvent,
  TaskStatus,
  User,
} from "../../types";
import { computeWeeklyReportSections, type WeeklyReportDailyUpdateEntryInput } from "../../client-report-weekly";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Client Reports provider (Phase 7E, evolved Phase 9D). `generateReport`'s
 * cross-contributor evidence (Tasks + aggregated Time + confirmed Daily Update narrative) comes
 * from the hardened `get_client_report_weekly_evidence` RPC (Phase 9D hotfix) rather than direct
 * browser SELECTs against `time_entries`/`daily_updates` — those tables' RLS is deliberately
 * owner/team-scoped, not Project-scoped, so an ordinary SELECT would only ever see the CALLING
 * user's own Time Entries on a shared Task, silently under-counting a coworker's legitimate time on
 * that same Task/date. The RPC performs its own independent `can_access_project` authorization
 * check and returns only pre-aggregated, identity-stripped evidence (see the migration's own doc
 * comment for the exact minimum-evidence contract) — `time_entries_select`/`daily_updates_select`
 * themselves are unchanged. Activity/Department catalog rows and the staff-name safety-net list stay
 * ordinary RLS-scoped SELECTs (no cross-contributor concern there), same as before. Every other
 * state transition is a thin RPC wrapper. The name-free/anonymization boundary is unchanged: line
 * items never carry a name, only a Task's own title/description or a screened confirmed Daily Update
 * narrative — staff identity (`generatedByName`/comments/history) stays on the row for internal
 * audit use only, never surfaced by the client-facing print/export view.
 */

interface ReportRow {
  id: string;
  project_id: string | null;
  company_id: string;
  company_label: string;
  brand_id: string;
  brand_label: string;
  range_label: ClientReport["rangeLabel"];
  range_start: string;
  range_end: string;
  status: ClientReport["status"];
  departments: ClientReportDepartmentSection[];
  daily_visit_minutes: number | null;
  schedule_id: string | null;
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
    projectId: row.project_id,
    companyId: row.company_id,
    companyLabel: row.company_label,
    brandId: row.brand_id,
    brandLabel: row.brand_label,
    rangeLabel: row.range_label,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    status: row.status,
    departments: row.departments,
    dailyVisitMinutes: row.daily_visit_minutes,
    scheduleId: row.schedule_id,
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

/** One `"generation-warning"` history event per warning (Phase 9D) — same shape/reasoning as the
 * mock provider's own `buildGenerationWarningEvents`: the smallest backward-compatible way to
 * surface a generation-time note to whoever reviews the Draft later, reusing the already-migrated
 * `history` jsonb column. Never staff-name content by construction (it names a Task, never a
 * person), and never printed/exported (`ClientReportHistory` is already `print:hidden`). */
function buildGenerationWarningEvents(viewer: User, warnings: string[]): ClientReportHistoryEvent[] {
  const now = new Date().toISOString();
  return warnings.map((message) => ({
    id: crypto.randomUUID(),
    type: "generation-warning" as const,
    actorId: viewer.id,
    actorName: viewer.fullName,
    createdAt: now,
    message,
  }));
}

interface WeeklyEvidenceTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  statusChangedAt: string | null;
  activityId: string | null;
}
interface WeeklyEvidenceResponse {
  tasks: WeeklyEvidenceTask[];
  timeEvidence: { taskId: string; date: string; minutes: number }[];
  dailyUpdateEvidence: { taskId: string; date: string; details: string }[];
  visitEvidence: { date: string; minutes: number }[];
}

/**
 * Phase 9D hotfix — gathers Tasks + cross-contributor-aggregated Time + confirmed Daily Update
 * narrative for this Project from the hardened `get_client_report_weekly_evidence` RPC (see this
 * file's own top-of-file doc comment for why a plain browser SELECT can't do this safely), then
 * layers on ordinary RLS-scoped catalog/staff-name-safety-net queries exactly like before, and hands
 * everything to the same pure `computeWeeklyReportSections`, which owns the actual qualifying-Task
 * rule, aggregation, narrative precedence, and anti-double-counting contract — see that module's own
 * doc comment. Mirrors `mock-client-report-provider.ts`'s own `generateWeeklyDepartments` in shape,
 * differing only in where the Task/Time/Daily-Update evidence itself comes from.
 */
async function generateWeeklyDepartments(
  projectId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{ departments: ClientReportDepartmentSection[]; warnings: string[]; dailyVisitMinutes: number | null }> {
  const supabase = createClient();

  // Postgres has no notion of "the browser's timezone" — the RPC buckets Time Entries into local
  // work dates via `AT TIME ZONE`, so the browser's own detected IANA zone is passed explicitly,
  // the SQL-side equivalent of the TypeScript `dateKeyFromTimestamp` rule used everywhere else.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: evidence, error: evidenceError } = await supabase.rpc("get_client_report_weekly_evidence", {
    p_project_id: projectId,
    p_range_start: rangeStart,
    p_range_end: rangeEnd,
    p_timezone: timezone,
  });
  if (evidenceError) throw new Error(evidenceError.message);
  const { tasks: taskRowsData, timeEvidence, dailyUpdateEvidence, visitEvidence } = evidence as WeeklyEvidenceResponse;

  const dailyUpdateEntries: WeeklyReportDailyUpdateEntryInput[] = dailyUpdateEvidence.map((ev) => ({
    date: ev.date,
    sourceTaskId: ev.taskId,
    details: ev.details,
  }));

  const [activityRes, staffRes] = await Promise.all([
    (async () => {
      const activityIds = Array.from(new Set(taskRowsData.map((t) => t.activityId).filter((x): x is string => x != null)));
      return activityIds.length
        ? supabase.from("activities").select("id, name, department_id, position").in("id", activityIds)
        : { data: [] as { id: string; name: string; department_id: string; position: number }[], error: null };
    })(),
    // Name-scan safety net only (see client-report-weekly.ts) — not a new access boundary; this is
    // the same RLS-scoped visibility the generating user already has everywhere else.
    supabase.from("profiles").select("full_name"),
  ]);
  if (activityRes.error) throw new Error(activityRes.error.message);
  if (staffRes.error) throw new Error(staffRes.error.message);
  const activities = (activityRes.data ?? []) as { id: string; name: string; department_id: string; position: number }[];
  const knownStaffNames = ((staffRes.data ?? []) as { full_name: string }[]).map((p) => p.full_name);

  const departmentIds = Array.from(new Set(activities.map((a) => a.department_id)));
  const { data: deptRows, error: deptError } = departmentIds.length
    ? await supabase.from("departments").select("id, name, position").in("id", departmentIds)
    : { data: [] as { id: string; name: string; position: number }[], error: null };
  if (deptError) throw new Error(deptError.message);
  const departmentRows = (deptRows ?? []) as { id: string; name: string; position: number }[];

  const { departments, warnings, dailyVisitMinutes } = computeWeeklyReportSections({
    tasks: taskRowsData,
    timeEvidence,
    dailyUpdateEntries,
    visitEvidence,
    activities: activities.map((a) => ({ id: a.id, name: a.name, departmentId: a.department_id, position: a.position })),
    departments: departmentRows,
    knownStaffNames,
    rangeStart,
    rangeEnd,
  });
  return { departments, warnings, dailyVisitMinutes };
}

export const supabaseClientReportProvider: ClientReportProvider = {
  async generateReport(viewer, input: GenerateClientReportInput) {
    const supabase = createClient();
    // Cross-contributor evidence comes from the hardened get_client_report_weekly_evidence RPC
    // (see generateWeeklyDepartments's own doc comment) — only the final write goes through
    // `generate_client_report`, a separate SECURITY DEFINER RPC that independently validates
    // Project access and derives Company/brand from the Project itself server-side (never trusting
    // a client-supplied company_id).
    const { departments, warnings, dailyVisitMinutes } = await generateWeeklyDepartments(input.projectId, input.rangeStart, input.rangeEnd);
    const history = buildGenerationWarningEvents(viewer, warnings);

    const { data, error } = await supabase.rpc("generate_client_report", {
      p_project_id: input.projectId,
      p_range_label: input.rangeLabel,
      p_range_start: input.rangeStart,
      p_range_end: input.rangeEnd,
      p_departments: departments,
      p_history: history,
      p_daily_visit_minutes: dailyVisitMinutes,
    });
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

  async updateDraftWording(_viewer, id, edits) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_client_report_draft_wording", { target_report_id: id, p_line_edits: edits });
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
