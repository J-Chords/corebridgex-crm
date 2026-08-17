import type { AddManualDailyUpdateEntryInput, DailyUpdatesProvider } from "../daily-updates-provider";
import type { DailyUpdate, DailyUpdateEntry, DailyUpdateEntrySource, TaskStatus } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Daily Updates provider (Phase 7D). The entry-computation/merge logic
 * (computeFreshEntries/mergeEntries) stays in TypeScript, mirroring the mock exactly — it's the
 * same flat-fetch-then-JS-join pattern this project already uses everywhere else, operating on
 * already-real Tasks/TimeEntries/TaskHandoffs data. The only SQL involved is the
 * `upsert_my_daily_update_draft`/`confirm_my_daily_update`/`reopen_my_daily_update` RPCs, which
 * provide a single safe "create or refresh, never touch a confirmed row" primitive.
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
  };
}

function humanizeStatus(status: TaskStatus): string {
  return status
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function dayBounds(date: string) {
  return { start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.999Z` };
}

/** Mirrors mock-daily-updates-provider.ts's computeFreshEntries exactly — one entry per event,
 * never aggregated across tasks, for `userId` on `date`. */
async function computeFreshEntries(userId: string, date: string): Promise<DailyUpdateEntry[]> {
  const supabase = createClient();
  const { start, end } = dayBounds(date);

  const [timeEntriesRes, statusTouchedRes, handoffsRes] = await Promise.all([
    supabase
      .from("time_entries")
      .select("task_id, duration_minutes, notes, start_time")
      .eq("user_id", userId)
      .not("duration_minutes", "is", null)
      .gte("start_time", start)
      .lte("start_time", end),
    supabase
      .from("tasks")
      .select("id, title, company_id, activity_id, status, status_changed_by, status_changed_at")
      .eq("status_changed_by", userId)
      .gte("status_changed_at", start)
      .lte("status_changed_at", end),
    supabase
      .from("task_handoffs")
      .select("*")
      .or(`handed_by_id.eq.${userId},handed_to_id.eq.${userId}`)
      .gte("created_at", start)
      .lte("created_at", end),
  ]);
  if (timeEntriesRes.error) throw new Error(timeEntriesRes.error.message);
  if (statusTouchedRes.error) throw new Error(statusTouchedRes.error.message);
  if (handoffsRes.error) throw new Error(handoffsRes.error.message);

  const timeEntries = (timeEntriesRes.data ?? []) as { task_id: string; duration_minutes: number | null; notes: string | null; start_time: string }[];
  const statusTouchedTasks = (statusTouchedRes.data ?? []) as {
    id: string; title: string; company_id: string; activity_id: string | null; status: TaskStatus; status_changed_by: string | null; status_changed_at: string | null;
  }[];
  const handoffRows = (handoffsRes.data ?? []) as {
    id: string; task_id: string; handed_by_id: string; handed_to_id: string; work_done: string; work_remaining: string; created_at: string;
  }[];

  const taskIdsFromTime = Array.from(new Set(timeEntries.map((te) => te.task_id)));
  const missingTaskIds = taskIdsFromTime.filter((id) => !statusTouchedTasks.some((t) => t.id === id));
  const extraTasksRes = missingTaskIds.length
    ? await supabase.from("tasks").select("id, title, company_id, activity_id, status, status_changed_by, status_changed_at").in("id", missingTaskIds)
    : { data: [] as typeof statusTouchedTasks, error: null };
  if (extraTasksRes.error) throw new Error(extraTasksRes.error.message);

  const allTasks = [...statusTouchedTasks, ...((extraTasksRes.data ?? []) as typeof statusTouchedTasks)];
  const taskHandoffTaskIds = Array.from(new Set(handoffRows.map((h) => h.task_id)));
  const handoffTasksRes = taskHandoffTaskIds.length
    ? await supabase.from("tasks").select("id, title, company_id, activity_id").in("id", taskHandoffTaskIds)
    : { data: [] as { id: string; title: string; company_id: string; activity_id: string | null }[], error: null };
  if (handoffTasksRes.error) throw new Error(handoffTasksRes.error.message);

  const companyIds = Array.from(
    new Set([...allTasks.map((t) => t.company_id), ...((handoffTasksRes.data ?? []).map((t) => t.company_id))])
  );
  const activityIds = Array.from(
    new Set([...allTasks.map((t) => t.activity_id), ...((handoffTasksRes.data ?? []).map((t) => t.activity_id))].filter((x): x is string => x != null))
  );
  const handoffUserIds = Array.from(new Set(handoffRows.map((h) => (h.handed_by_id === userId ? h.handed_to_id : h.handed_by_id))));

  const [companiesRes, activitiesRes, handoffUsersRes] = await Promise.all([
    companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    activityIds.length
      ? supabase.from("activities").select("id, name, department_id").in("id", activityIds)
      : Promise.resolve({ data: [] as { id: string; name: string; department_id: string }[] }),
    handoffUserIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", handoffUserIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const companies = (companiesRes.data ?? []) as { id: string; name: string }[];
  const activities = (activitiesRes.data ?? []) as { id: string; name: string; department_id: string }[];
  const departmentIds = Array.from(new Set(activities.map((a) => a.department_id)));
  const departmentsRes = departmentIds.length
    ? await supabase.from("departments").select("id, name").in("id", departmentIds)
    : { data: [] as { id: string; name: string }[] };
  const departments = (departmentsRes.data ?? []) as { id: string; name: string }[];
  const handoffUsers = (handoffUsersRes.data ?? []) as { id: string; full_name: string }[];

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

  const taskEntries: DailyUpdateEntry[] = allTasks
    .map((task): DailyUpdateEntry | null => {
      const dayTimeEntries = timeEntries.filter((te) => te.task_id === task.id);
      const statusTouchedToday = task.status_changed_by === userId && task.status_changed_at != null;
      const minutesLogged = dayTimeEntries.reduce((sum, te) => sum + (te.duration_minutes ?? 0), 0);
      if (minutesLogged === 0 && !statusTouchedToday) return null;
      const notes = dayTimeEntries.map((te) => te.notes).filter((n): n is string => !!n);
      const detailBits = [task.title, ...notes.filter(Boolean)];
      return {
        id: crypto.randomUUID(),
        source: "task" as DailyUpdateEntrySource,
        sourceTaskId: task.id,
        sourceHandoffId: null,
        companyId: task.company_id,
        companyLabel: companyLabelFor(task.company_id),
        activityId: task.activity_id,
        activityLabel: activityLabelFor(task.activity_id),
        minutesLogged,
        progressStatus: task.status,
        progressLabel: humanizeStatus(task.status),
        details: detailBits.join(" — "),
      };
    })
    .filter((e): e is DailyUpdateEntry => e !== null);

  const handoffEntries: DailyUpdateEntry[] = handoffRows
    .map((h): DailyUpdateEntry | null => {
      const task = (handoffTasksRes.data ?? []).find((t) => t.id === h.task_id);
      if (!task) return null;
      const isSent = h.handed_by_id === userId;
      const counterpart = handoffUsers.find((u) => u.id === (isSent ? h.handed_to_id : h.handed_by_id));
      const counterpartName = counterpart?.full_name ?? "someone";
      const detail = isSent ? h.work_done : h.work_remaining;
      return {
        id: crypto.randomUUID(),
        source: (isSent ? "handoff-sent" : "handoff-received") as DailyUpdateEntrySource,
        sourceTaskId: task.id,
        sourceHandoffId: h.id,
        companyId: task.company_id,
        companyLabel: companyLabelFor(task.company_id),
        activityId: task.activity_id,
        activityLabel: activityLabelFor(task.activity_id),
        minutesLogged: 0,
        progressStatus: null,
        progressLabel: isSent ? `Handed off to ${counterpartName}` : `Received from ${counterpartName}`,
        details: `${task.title} — ${detail}`.trim(),
      };
    })
    .filter((e): e is DailyUpdateEntry => e !== null);

  return [...taskEntries, ...handoffEntries];
}

function entryKey(e: DailyUpdateEntry): string {
  if (e.source === "manual") return `manual:${e.id}`;
  return `${e.source}:${e.sourceTaskId}:${e.sourceHandoffId ?? ""}`;
}

/** Mirrors mock-daily-updates-provider.ts's mergeEntries exactly. */
function mergeEntries(existing: DailyUpdateEntry[], fresh: DailyUpdateEntry[]): DailyUpdateEntry[] {
  const existingByKey = new Map(existing.map((e) => [entryKey(e), e]));
  const merged = fresh.map((f) => {
    const prior = existingByKey.get(entryKey(f));
    return prior ? { ...f, id: prior.id, details: prior.details } : f;
  });
  const freshKeys = new Set(fresh.map(entryKey));
  const stillMissingFromFresh = existing.filter((e) => !freshKeys.has(entryKey(e)));
  return [...merged, ...stillMissingFromFresh];
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
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
    return (data ?? []).map(toDailyUpdate);
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
      sourceHandoffId: null,
      companyId: input.companyId,
      companyLabel,
      activityId: input.activityId,
      activityLabel,
      minutesLogged: input.minutesLogged,
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
};
