import type { ClientReportSchedulesProvider } from "../client-report-schedules-provider";
import type { ClientReportSchedule } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Client Report Schedules provider (Phase 9F). Every mutation is a thin wrapper
 * around the create/update/delete/run-now RPCs (20260821150000_client_report_schedules.sql) — no
 * direct INSERT/UPDATE/DELETE grant on `client_report_schedules` for `authenticated`. Background
 * due-schedule processing happens entirely server-side via pg_cron; there is nothing for this
 * provider to poll or drive.
 */

interface ScheduleRow {
  id: string;
  project_id: string;
  created_by: string;
  active: boolean;
  weekday: number;
  local_time: string;
  timezone: string;
  next_run_at: string;
  last_run_at: string | null;
  last_report_id: string | null;
  created_at: string;
  updated_at: string;
}

function toSchedule(row: ScheduleRow): ClientReportSchedule {
  return {
    id: row.id,
    projectId: row.project_id,
    createdBy: row.created_by,
    active: row.active,
    weekday: row.weekday,
    localTime: row.local_time.slice(0, 5),
    timezone: row.timezone,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastReportId: row.last_report_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ReportableProjectRow {
  project_id: string;
  project_name: string;
  company_id: string;
  company_name: string;
}

export const supabaseClientReportSchedulesProvider: ClientReportSchedulesProvider = {
  async listSchedules() {
    const supabase = createClient();
    // RLS (client_report_schedules_select: has_reporting_review_access()) already scopes this to
    // org-wide-for-a-reviewer / nothing-for-anyone-else — no TS-side pre-check needed.
    const { data, error } = await supabase.from("client_report_schedules").select("*").order("next_run_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ScheduleRow[]).map(toSchedule);
  },

  async listSchedulableProjects() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_client_report_schedule_projects");
    if (error) throw new Error(error.message);
    return ((data ?? []) as ReportableProjectRow[]).map((row) => ({
      projectId: row.project_id,
      projectName: row.project_name,
      companyId: row.company_id,
      companyName: row.company_name,
    }));
  },

  async createSchedule(_viewer, input) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_client_report_schedule", {
      p_project_id: input.projectId,
      p_weekday: input.weekday,
      p_local_time: input.localTime,
      p_timezone: input.timezone,
    });
    if (error) throw new Error(error.message);
    return toSchedule(data as ScheduleRow);
  },

  async updateSchedule(_viewer, id, input) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_client_report_schedule", {
      p_schedule_id: id,
      p_weekday: input.weekday,
      p_local_time: input.localTime,
      p_timezone: input.timezone,
      p_active: input.active,
    });
    if (error) throw new Error(error.message);
    return toSchedule(data as ScheduleRow);
  },

  async deleteSchedule(_viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_client_report_schedule", { p_schedule_id: id });
    if (error) throw new Error(error.message);
  },

  async runScheduleNow(_viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.rpc("run_client_report_schedule_now", { p_schedule_id: id });
    if (error) throw new Error(error.message);
  },
};
