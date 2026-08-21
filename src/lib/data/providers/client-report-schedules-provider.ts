import type { User, ClientReportSchedule, ClientReportScheduleInput } from "../types";

/** A minimal, reporting-scoped Project reference — never Task/Time/member/contact data. */
export interface ReportableProjectRef {
  projectId: string;
  projectName: string;
  companyId: string;
  companyName: string;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement — Phase 9F recurring Client
 * Report schedules. Every mutation is reporting-reviewer/Superadmin-only, org-wide
 * (`canManageClientReportSchedules`). Phase 9 final integrity hotfix: schedule management is an
 * orthogonal, organization-wide Client Reporting capability — creating a schedule requires the
 * capability plus "this is a real, non-internal Client Project," never ordinary operational
 * `canAccessProject`. `runScheduleNow` MUST use the exact same generation path the background
 * runner uses (Section 39) — never a second, divergent implementation.
 */
export interface ClientReportSchedulesProvider {
  /** Every schedule the viewer may manage — org-wide for a reporting reviewer/Superadmin, empty otherwise. */
  listSchedules(viewer: User): Promise<ClientReportSchedule[]>;
  /**
   * The narrow, capability-gated Project directory the Schedules UI's picker uses — every non-
   * internal Client Project, organization-wide, regardless of the viewer's own operational
   * assignment. Never Task/Time/member/contact data. Empty for a non-reviewer.
   */
  listSchedulableProjects(viewer: User): Promise<ReportableProjectRef[]>;
  createSchedule(viewer: User, input: ClientReportScheduleInput): Promise<ClientReportSchedule>;
  updateSchedule(viewer: User, id: string, input: ClientReportScheduleInput & { active: boolean }): Promise<ClientReportSchedule>;
  deleteSchedule(viewer: User, id: string): Promise<void>;
  /** Generates a Draft right now for this schedule's computed period, using the SAME generation
   * function the background due-runner uses — idempotent for the same computed range. */
  runScheduleNow(viewer: User, id: string): Promise<void>;
}
