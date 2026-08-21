/**
 * Phase 9F — a recurring WEEKLY Client Report Draft schedule for one Project. Produces an ordinary
 * Draft (never auto-finalized — Section 29's own locked rule) that lands in the reviewer Review
 * Queue exactly like a manually-generated one. Management is reporting-reviewer/Superadmin-only,
 * org-wide (`canManageClientReportSchedules`) — see `run_one_client_report_schedule` for the exact
 * generation rules (Task description/title narrative only, never Daily Update, never contributor
 * identity).
 */
export interface ClientReportSchedule {
  id: string;
  projectId: string;
  createdBy: string;
  active: boolean;
  /** 0=Sunday..6=Saturday, matching `Date.getDay()`. */
  weekday: number;
  /** HH:MM, local to `timezone`. */
  localTime: string;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastReportId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientReportScheduleInput {
  projectId: string;
  weekday: number;
  localTime: string;
  timezone: string;
}
