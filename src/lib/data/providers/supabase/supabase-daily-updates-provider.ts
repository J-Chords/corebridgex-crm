import type { AddManualDailyUpdateEntryInput, DailyUpdatesProvider } from "../daily-updates-provider";
import type { DailyUpdate, DailyUpdateEntry, DailyUpdateEntrySource, TaskStatus } from "../../types";
import { STATUS_META } from "@/components/tasks/task-status-badge";
import { workstreamCompactLabel } from "../../workstream-name";
import { localDayBoundsUtc, todayDateOnly } from "@/lib/planner-dates";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Daily Updates provider (Phase 7D, evolved Phase 9C). The entry-computation/merge
 * logic (computeFreshEntries/mergeEntries) stays in TypeScript, mirroring the mock exactly — it's
 * the same flat-fetch-then-JS-join pattern this project already uses everywhere else, operating on
 * already-real Tasks/TimeEntries/TaskHandoffs/Workstreams/Projects data. The only SQL involved is
 * the `upsert_my_daily_update_draft`/`confirm_my_daily_update`/`reopen_my_daily_update`/
 * `review_daily_update` RPCs, which provide safe primitives ("create or refresh a draft, never
 * touch a confirmed row," "only a legitimate reviewer can set reviewedAt/reviewedBy").
 *
 * Work-date handling (Phase 9C hotfix): "today," and the query window for a given work date, are
 * now the viewer's LOCAL calendar day — `todayDateOnly()`/`localDayBoundsUtc()`
 * (`src/lib/planner-dates.ts`) replace the previous UTC-midnight-based `todayDateString`/
 * `dayBounds`. Time Entry/Task/Handoff timestamp storage itself is untouched (still real absolute
 * `timestamptz` instants); only how this file turns a local calendar date into the UTC instant
 * range it queries changed — a half-open interval (`>= start`, `< nextDayStart`), not an
 * end-of-day-minus-one-millisecond approximation.
 */

interface DailyUpdateRow {
  id: string;
  user_id: string;
  date: string;
  status: "draft" | "confirmed";
  entries: DailyUpdateEntry[];
  generated_at: string;
  confirmed_at: string | null;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
}

function toDailyUpdate(row: DailyUpdateRow): DailyUpdate {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    status: row.status,
    entries: row.entries,
    generatedAt: row.generated_at,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
  };
}

interface TaskDayAccumulator {
  actualMinutes: number;
  notes: string[];
  handoffs: { id: string; text: string }[];
}

/** Mirrors mock-daily-updates-provider.ts's computeFreshEntries exactly — one entry per Task
 * touched by `userId` on `date` (never one per underlying event), folding in Handoff context
 * rather than producing a separate row, and resolving the full Company → Project → Workstream →
 * Activity hierarchy plus the Task's own title. */
async function computeFreshEntries(userId: string, date: string): Promise<DailyUpdateEntry[]> {
  const supabase = createClient();
  const { startUtc, endUtc } = localDayBoundsUtc(date);

  const [timeEntriesRes, statusTouchedRes, handoffsRes] = await Promise.all([
    supabase
      .from("time_entries")
      .select("task_id, duration_minutes, notes, start_time")
      .eq("user_id", userId)
      .not("duration_minutes", "is", null)
      .gte("start_time", startUtc)
      .lt("start_time", endUtc),
    supabase
      .from("tasks")
      .select("id")
      .eq("status_changed_by", userId)
      .gte("status_changed_at", startUtc)
      .lt("status_changed_at", endUtc),
    supabase
      .from("task_handoffs")
      .select("id, task_id, handed_by_id, handed_to_id, work_done, work_remaining, created_at")
      .or(`handed_by_id.eq.${userId},handed_to_id.eq.${userId}`)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc),
  ]);
  if (timeEntriesRes.error) throw new Error(timeEntriesRes.error.message);
  if (statusTouchedRes.error) throw new Error(statusTouchedRes.error.message);
  if (handoffsRes.error) throw new Error(handoffsRes.error.message);

  const timeEntries = (timeEntriesRes.data ?? []) as { task_id: string; duration_minutes: number | null; notes: string | null; start_time: string }[];
  const statusTouchedTaskIds = ((statusTouchedRes.data ?? []) as { id: string }[]).map((t) => t.id);
  const handoffRows = (handoffsRes.data ?? []) as {
    id: string; task_id: string; handed_by_id: string; handed_to_id: string; work_done: string; work_remaining: string; created_at: string;
  }[];

  const perTask = new Map<string, TaskDayAccumulator>();
  function accumulatorFor(taskId: string): TaskDayAccumulator {
    let acc = perTask.get(taskId);
    if (!acc) {
      acc = { actualMinutes: 0, notes: [], handoffs: [] };
      perTask.set(taskId, acc);
    }
    return acc;
  }

  for (const te of timeEntries) {
    const acc = accumulatorFor(te.task_id);
    acc.actualMinutes += te.duration_minutes ?? 0;
    if (te.notes) acc.notes.push(te.notes);
  }
  for (const taskId of statusTouchedTaskIds) accumulatorFor(taskId);

  const handoffCounterpartIds = new Set<string>();
  for (const h of handoffRows) {
    const isSent = h.handed_by_id === userId;
    handoffCounterpartIds.add(isSent ? h.handed_to_id : h.handed_by_id);
  }
  const { data: handoffUsersData } = handoffCounterpartIds.size
    ? await supabase.from("profiles").select("id, full_name").in("id", Array.from(handoffCounterpartIds))
    : { data: [] as { id: string; full_name: string }[] };
  const handoffUsers = (handoffUsersData ?? []) as { id: string; full_name: string }[];

  for (const h of handoffRows) {
    const isSent = h.handed_by_id === userId;
    const counterpart = handoffUsers.find((u) => u.id === (isSent ? h.handed_to_id : h.handed_by_id));
    const counterpartName = counterpart?.full_name ?? "someone";
    const text = isSent ? `Handed off to ${counterpartName} — ${h.work_done}` : `Received from ${counterpartName} — ${h.work_remaining}`;
    const acc = accumulatorFor(h.task_id);
    acc.handoffs.push({ id: h.id, text });
  }

  const taskIds = Array.from(perTask.keys());
  if (taskIds.length === 0) return [];

  const { data: taskRows, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, company_id, workstream_id, activity_id, status")
    .in("id", taskIds);
  if (taskError) throw new Error(taskError.message);
  const tasks = (taskRows ?? []) as { id: string; title: string; company_id: string; workstream_id: string | null; activity_id: string | null; status: TaskStatus }[];

  const workstreamIds = Array.from(new Set(tasks.map((t) => t.workstream_id).filter((x): x is string => x != null)));
  const { data: workstreamRows } = workstreamIds.length
    ? await supabase.from("workstreams").select("id, name, project_id").in("id", workstreamIds)
    : { data: [] as { id: string; name: string; project_id: string | null }[] };
  const workstreams = (workstreamRows ?? []) as { id: string; name: string; project_id: string | null }[];

  const projectIds = Array.from(new Set(workstreams.map((w) => w.project_id).filter((x): x is string => x != null)));
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const projects = (projectRows ?? []) as { id: string; name: string }[];

  const companyIds = Array.from(new Set(tasks.map((t) => t.company_id)));
  const activityIds = Array.from(new Set(tasks.map((t) => t.activity_id).filter((x): x is string => x != null)));
  const [companiesRes, activitiesRes] = await Promise.all([
    companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    activityIds.length
      ? supabase.from("activities").select("id, name, department_id").in("id", activityIds)
      : Promise.resolve({ data: [] as { id: string; name: string; department_id: string }[] }),
  ]);
  const companies = (companiesRes.data ?? []) as { id: string; name: string }[];
  const activities = (activitiesRes.data ?? []) as { id: string; name: string; department_id: string }[];
  const departmentIds = Array.from(new Set(activities.map((a) => a.department_id)));
  const { data: departmentRows } = departmentIds.length
    ? await supabase.from("departments").select("id, name").in("id", departmentIds)
    : { data: [] as { id: string; name: string }[] };
  const departments = (departmentRows ?? []) as { id: string; name: string }[];

  function companyLabelFor(companyId: string): string {
    return companies.find((c) => c.id === companyId)?.name ?? "Unknown client";
  }
  function activityLabelFor(activityId: string | null): string | null {
    if (!activityId) return null;
    const activity = activities.find((a) => a.id === activityId);
    if (!activity) return null;
    const department = departments.find((d) => d.id === activity.department_id);
    return `${department?.name ?? "Other"}: ${activity.name}`;
  }

  const entries: DailyUpdateEntry[] = [];
  for (const task of tasks) {
    const acc = perTask.get(task.id);
    if (!acc) continue;
    const statusTouchedToday = statusTouchedTaskIds.includes(task.id);
    if (acc.actualMinutes === 0 && !statusTouchedToday && acc.handoffs.length === 0) continue;

    const workstream = task.workstream_id ? workstreams.find((w) => w.id === task.workstream_id) ?? null : null;
    const project = workstream?.project_id ? projects.find((p) => p.id === workstream.project_id) ?? null : null;
    const detailBits = [...acc.notes.filter(Boolean), ...acc.handoffs.map((h) => h.text)];

    entries.push({
      id: crypto.randomUUID(),
      source: "task" as DailyUpdateEntrySource,
      sourceTaskId: task.id,
      handoffIds: acc.handoffs.map((h) => h.id),
      companyId: task.company_id,
      companyLabel: companyLabelFor(task.company_id),
      projectId: project?.id ?? null,
      projectLabel: project?.name ?? null,
      workstreamId: workstream?.id ?? null,
      workstreamLabel: workstream ? workstreamCompactLabel(workstream.name) : null,
      activityId: task.activity_id,
      activityLabel: activityLabelFor(task.activity_id),
      taskLabel: task.title,
      actualMinutes: acc.actualMinutes,
      scheduledMinutes: null,
      progressStatus: task.status,
      progressLabel: STATUS_META[task.status].label,
      details: detailBits.join(" — "),
    });
  }
  return entries;
}

/** Mirrors mock-daily-updates-provider.ts's entryKey exactly. */
function entryKey(e: DailyUpdateEntry): string {
  if (e.source === "manual") return `manual:${e.id}`;
  if (e.source === "task") return `task:${e.sourceTaskId}`;
  return `${e.source}:${e.sourceTaskId}:${e.sourceHandoffId ?? ""}`;
}

/** Mirrors mock-daily-updates-provider.ts's mergeEntries exactly. */
function mergeEntries(existing: DailyUpdateEntry[], fresh: DailyUpdateEntry[]): DailyUpdateEntry[] {
  const existingByKey = new Map(existing.map((e) => [entryKey(e), e]));
  const merged = fresh.map((f) => {
    const prior = existingByKey.get(entryKey(f));
    if (!prior) return f;
    return { ...f, id: prior.id, details: prior.details, scheduledMinutes: prior.scheduledMinutes ?? null };
  });
  const freshKeys = new Set(fresh.map(entryKey));
  const freshTaskIds = new Set(fresh.filter((f) => f.source === "task").map((f) => f.sourceTaskId));
  const stillMissingFromFresh = existing.filter((e) => {
    if (freshKeys.has(entryKey(e))) return false;
    if ((e.source === "handoff-sent" || e.source === "handoff-received") && e.sourceTaskId && freshTaskIds.has(e.sourceTaskId)) {
      return false;
    }
    return true;
  });
  return [...merged, ...stillMissingFromFresh];
}

function todayDateString(): string {
  return todayDateOnly();
}

export const supabaseDailyUpdatesProvider: DailyUpdatesProvider = {
  async getMyTodayUpdate(viewer) {
    const supabase = createClient();
    const date = todayDateString();

    const { data: existingRow, error: existingError } = await supabase
      .from("daily_updates")
      .select("*")
      .eq("user_id", viewer.id)
      .eq("date", date)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existingRow && existingRow.status === "confirmed") {
      return toDailyUpdate(existingRow as DailyUpdateRow);
    }

    const fresh = await computeFreshEntries(viewer.id, date);
    const merged = existingRow ? mergeEntries((existingRow as DailyUpdateRow).entries, fresh) : fresh;

    const { data, error } = await supabase.rpc("upsert_my_daily_update_draft", { target_date: date, p_entries: merged });
    if (error) throw new Error(error.message);
    return toDailyUpdate(data as DailyUpdateRow);
  },

  async listUpdatesForDate(_viewer, date) {
    const supabase = createClient();
    const { data, error } = await supabase.from("daily_updates").select("*").eq("date", date).order("user_id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toDailyUpdate(row as DailyUpdateRow));
  },

  async updateEntryDetails(_viewer, updateId, entryId, details) {
    const supabase = createClient();
    const { data: existingRow, error: existingError } = await supabase.from("daily_updates").select("*").eq("id", updateId).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existingRow) throw new Error("Daily update not found.");
    const row = existingRow as DailyUpdateRow;
    const newEntries = row.entries.map((e) => (e.id === entryId ? { ...e, details } : e));
    const { data, error } = await supabase.rpc("upsert_my_daily_update_draft", { target_date: row.date, p_entries: newEntries });
    if (error) throw new Error(error.message);
    return toDailyUpdate(data as DailyUpdateRow);
  },

  async updateEntryScheduledMinutes(_viewer, updateId, entryId, scheduledMinutes) {
    const supabase = createClient();
    const { data: existingRow, error: existingError } = await supabase.from("daily_updates").select("*").eq("id", updateId).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existingRow) throw new Error("Daily update not found.");
    const row = existingRow as DailyUpdateRow;
    const newEntries = row.entries.map((e) => (e.id === entryId ? { ...e, scheduledMinutes } : e));
    const { data, error } = await supabase.rpc("upsert_my_daily_update_draft", { target_date: row.date, p_entries: newEntries });
    if (error) throw new Error(error.message);
    return toDailyUpdate(data as DailyUpdateRow);
  },

  async addManualEntry(_viewer, updateId, input: AddManualDailyUpdateEntryInput) {
    const supabase = createClient();
    const { data: existingRow, error: existingError } = await supabase.from("daily_updates").select("*").eq("id", updateId).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existingRow) throw new Error("Daily update not found.");
    const row = existingRow as DailyUpdateRow;

    let companyLabel = "No client";
    if (input.companyId) {
      const { data: company } = await supabase.from("companies").select("name").eq("id", input.companyId).maybeSingle();
      companyLabel = company?.name ?? "Unknown client";
    }
    let projectLabel: string | null = null;
    if (input.projectId) {
      const { data: project } = await supabase.from("projects").select("name").eq("id", input.projectId).maybeSingle();
      projectLabel = project?.name ?? null;
    }
    let activityLabel: string | null = null;
    if (input.activityId) {
      const { data: activity } = await supabase.from("activities").select("name, department_id").eq("id", input.activityId).maybeSingle();
      if (activity) {
        const { data: department } = await supabase.from("departments").select("name").eq("id", activity.department_id).maybeSingle();
        activityLabel = `${department?.name ?? "Other"}: ${activity.name}`;
      }
    }

    const manualEntry: DailyUpdateEntry = {
      id: crypto.randomUUID(),
      source: "manual",
      sourceTaskId: null,
      handoffIds: [],
      companyId: input.companyId,
      companyLabel,
      projectId: input.projectId,
      projectLabel,
      workstreamId: null,
      workstreamLabel: null,
      activityId: input.activityId,
      activityLabel,
      taskLabel: null,
      actualMinutes: input.actualMinutes,
      scheduledMinutes: input.scheduledMinutes,
      progressStatus: null,
      progressLabel: "Manual entry",
      details: input.details,
    };
    const newEntries = [...row.entries, manualEntry];
    const { data, error } = await supabase.rpc("upsert_my_daily_update_draft", { target_date: row.date, p_entries: newEntries });
    if (error) throw new Error(error.message);
    return toDailyUpdate(data as DailyUpdateRow);
  },

  async confirmUpdate(_viewer, updateId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("confirm_my_daily_update", { target_update_id: updateId });
    if (error) throw new Error(error.message);
    return toDailyUpdate(data as DailyUpdateRow);
  },

  async reopenUpdate(_viewer, updateId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("reopen_my_daily_update", { target_update_id: updateId });
    if (error) throw new Error(error.message);
    return toDailyUpdate(data as DailyUpdateRow);
  },

  async reviewUpdate(_viewer, updateId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("review_daily_update", { target_update_id: updateId });
    if (error) throw new Error(error.message);
    return toDailyUpdate(data as DailyUpdateRow);
  },
};
