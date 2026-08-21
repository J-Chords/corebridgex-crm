import type {
  ManualTimeEntryInput,
  TimeEntriesProvider,
  TimeEntryWithTask,
  TimeEntryWithUser,
  TimeEntryWithUserAndTask,
} from "../time-entries-provider";
import type { TimeEntry, TimeEntryCorrection, User, Role } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Time Entries provider (Phase 7). Every mutation is a thin wrapper around the
 * `start_timer`/`stop_timer`/`pause_timer`/`resume_timer`/`create_manual_time_entry`/
 * `correct_time_entry` RPCs (20260814090003_time_entries.sql) — there is no direct INSERT/UPDATE
 * grant on `time_entries`/`time_entry_corrections` for `authenticated`, so a raw `.update()` here
 * would simply fail at the database. Reads are plain RLS-gated SELECTs, joined in JS.
 */

interface TimeEntryRow {
  id: string;
  task_id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  billable: boolean;
  paused_for_resume: boolean;
  continues_from_entry_id: string | null;
}

function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    billable: row.billable,
    pausedForResume: row.paused_for_resume,
    continuesFromEntryId: row.continues_from_entry_id,
  };
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  supervisor_id: string | null;
  created_at: string;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    active: row.active,
    supervisorId: row.supervisor_id,
    assignedCompanyIds: [],
    // Not authoritative — see profile-directory.ts's own note for the same convention.
    reportingReviewAccess: false,
    createdAt: row.created_at,
  };
}

async function correctionCounts(entryIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (entryIds.length === 0) return counts;
  const supabase = createClient();
  const { data, error } = await supabase.from("time_entry_corrections").select("time_entry_id").in("time_entry_id", entryIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    counts.set(row.time_entry_id, (counts.get(row.time_entry_id) ?? 0) + 1);
  }
  return counts;
}

async function tasksById(taskIds: string[]) {
  const supabase = createClient();
  const ids = Array.from(new Set(taskIds));
  if (ids.length === 0) return new Map<string, { id: string; title: string; companyId: string; expectedMinutes: number | null }>();
  const { data, error } = await supabase.from("tasks").select("id, title, company_id, expected_minutes").in("id", ids);
  if (error) throw new Error(error.message);
  const map = new Map<string, { id: string; title: string; companyId: string; expectedMinutes: number | null }>();
  for (const t of data ?? []) {
    map.set(t.id, { id: t.id, title: t.title, companyId: t.company_id, expectedMinutes: t.expected_minutes });
  }
  return map;
}

async function actualMinutesByTask(taskIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  const ids = Array.from(new Set(taskIds));
  if (ids.length === 0) return totals;
  const supabase = createClient();
  const { data, error } = await supabase.from("time_entries").select("task_id, duration_minutes").in("task_id", ids).not("duration_minutes", "is", null);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    totals.set(row.task_id, (totals.get(row.task_id) ?? 0) + (row.duration_minutes ?? 0));
  }
  return totals;
}

async function withUser(entries: TimeEntry[]): Promise<TimeEntryWithUser[]> {
  if (entries.length === 0) return [];
  const supabase = createClient();
  const userIds = Array.from(new Set(entries.map((e) => e.userId)));
  const [usersRes, counts] = await Promise.all([
    supabase.from("profiles").select("*").in("id", userIds),
    correctionCounts(entries.map((e) => e.id)),
  ]);
  if (usersRes.error) throw new Error(usersRes.error.message);
  const users = (usersRes.data ?? []).map(toUser);
  return entries.map((entry) => {
    const user = users.find((u) => u.id === entry.userId);
    if (!user) throw new Error(`Time entry ${entry.id} references unknown user ${entry.userId}`);
    return { ...entry, user, correctionCount: counts.get(entry.id) ?? 0 };
  });
}

async function withTask(entries: TimeEntry[]): Promise<TimeEntryWithTask[]> {
  if (entries.length === 0) return [];
  const [tasks, counts, actualByTask] = await Promise.all([
    tasksById(entries.map((e) => e.taskId)),
    correctionCounts(entries.map((e) => e.id)),
    actualMinutesByTask(entries.map((e) => e.taskId)),
  ]);
  return entries.map((entry) => {
    const task = tasks.get(entry.taskId);
    if (!task) throw new Error(`Time entry ${entry.id} references unknown task ${entry.taskId}`);
    return {
      ...entry,
      correctionCount: counts.get(entry.id) ?? 0,
      task: { ...task, actualMinutes: actualByTask.get(entry.taskId) ?? 0 },
    };
  });
}

async function withUserAndTask(entries: TimeEntry[]): Promise<TimeEntryWithUserAndTask[]> {
  const [withUserResults, withTaskResults] = await Promise.all([withUser(entries), withTask(entries)]);
  return entries.map((entry, i) => ({ ...withUserResults[i], ...withTaskResults[i] }));
}

export const supabaseTimeEntriesProvider: TimeEntriesProvider = {
  async listTimeEntriesForTask(_viewer, taskId) {
    const supabase = createClient();
    const { data, error } = await supabase.from("time_entries").select("*").eq("task_id", taskId).order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    return withUser((data ?? []).map(toTimeEntry));
  },

  async listMyTimeEntries(viewer) {
    const supabase = createClient();
    const { data, error } = await supabase.from("time_entries").select("*").eq("user_id", viewer.id).order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    return withTask((data ?? []).map(toTimeEntry));
  },

  async listTimeEntriesForDate(_viewer, date) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .gte("start_time", `${date}T00:00:00`)
      .lt("start_time", `${date}T23:59:59.999`)
      .order("start_time", { ascending: false });
    if (error) throw new Error(error.message);
    return withUserAndTask((data ?? []).map(toTimeEntry));
  },

  async getRunningTimer(viewer) {
    const supabase = createClient();
    const { data, error } = await supabase.from("time_entries").select("*").eq("user_id", viewer.id).is("duration_minutes", null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await withTask([toTimeEntry(data)]);
    return hydrated ?? null;
  },

  async getPausedTimer(viewer) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", viewer.id)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.paused_for_resume) return null;
    const [hydrated] = await withTask([toTimeEntry(data)]);
    return hydrated ?? null;
  },

  async startTimer(_viewer, taskId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("start_timer", { target_task_id: taskId });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUser([toTimeEntry(data as TimeEntryRow)]);
    return hydrated;
  },

  async stopTimer(_viewer, timeEntryId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("stop_timer", { target_entry_id: timeEntryId });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUser([toTimeEntry(data as TimeEntryRow)]);
    return hydrated;
  },

  async pauseTimer(_viewer, timeEntryId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("pause_timer", { target_entry_id: timeEntryId });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUser([toTimeEntry(data as TimeEntryRow)]);
    return hydrated;
  },

  async resumeTimer(_viewer, pausedEntryId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("resume_timer", { paused_entry_id: pausedEntryId });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUser([toTimeEntry(data as TimeEntryRow)]);
    return hydrated;
  },

  async createManualEntry(_viewer, taskId, input: ManualTimeEntryInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_manual_time_entry", {
      target_task_id: taskId,
      p_start_time: input.startTime,
      p_end_time: input.endTime,
      p_duration_minutes: input.durationMinutes,
      p_notes: input.notes,
      p_billable: input.billable,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUser([toTimeEntry(data as TimeEntryRow)]);
    return hydrated;
  },

  async correctTimeEntry(_viewer, timeEntryId, correctedDurationMinutes, reason) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("correct_time_entry", {
      target_entry_id: timeEntryId,
      corrected_duration_minutes: correctedDurationMinutes,
      reason,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUser([toTimeEntry(data as TimeEntryRow)]);
    return hydrated;
  },

  async listCorrectionsForTimeEntry(_viewer, timeEntryId) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("time_entry_corrections")
      .select("*")
      .eq("time_entry_id", timeEntryId)
      .order("corrected_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(
      (row): TimeEntryCorrection => ({
        id: row.id,
        timeEntryId: row.time_entry_id,
        employeeUserId: row.employee_user_id,
        previousDurationMinutes: row.previous_duration_minutes,
        correctedDurationMinutes: row.corrected_duration_minutes,
        reason: row.reason,
        correctedById: row.corrected_by,
        correctedByName: row.corrected_by_name,
        correctedAt: row.corrected_at,
      })
    );
  },
};
