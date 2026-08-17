import type { ClientReportStatus, DailyUpdateStatus, ReportKind, ReportStatus, User } from "./types";
import { INTERNAL_COMPANY_ID } from "./constants";

/**
 * Single source of truth for RBAC. Every screen, API route, and data-provider
 * implementation should call these instead of checking `user.role` inline.
 * When we add Supabase RLS policies later, they mirror these rules in SQL —
 * this module stays the source of truth; RLS is a defense-in-depth backstop.
 */

export function isSuperadmin(user: User): boolean {
  return user.role === "superadmin";
}

export function isSupervisor(user: User): boolean {
  return user.role === "supervisor";
}

export function isEmployee(user: User): boolean {
  return user.role === "employee";
}

/** True if `manager` is `target`'s direct supervisor, or superadmin (sees everyone's team). */
export function managesUser(manager: User, target: User): boolean {
  if (isSuperadmin(manager)) return true;
  if (manager.id === target.id) return true;
  return isSupervisor(manager) && target.supervisorId === manager.id;
}

/**
 * Company visibility gate: assignedCompanyIds is the primary scope.
 * Employee -> their own assignedCompanyIds. Supervisor -> the union of
 * assignedCompanyIds across themselves and their direct reports.
 * Superadmin -> everything, represented as the "all" sentinel so callers
 * don't need to enumerate every company id just to mean "no filter".
 */
export function visibleCompanyIds(viewer: User, allUsers: User[]): "all" | string[] {
  if (isSuperadmin(viewer)) return "all";
  if (isSupervisor(viewer)) {
    const team = allUsers.filter((u) => managesUser(viewer, u));
    return Array.from(new Set([...team.flatMap((u) => u.assignedCompanyIds), INTERNAL_COMPANY_ID]));
  }
  return Array.from(new Set([...viewer.assignedCompanyIds, INTERNAL_COMPANY_ID]));
}

export function canAccessCompany(viewer: User, companyId: string, allUsers: User[]): boolean {
  const visible = visibleCompanyIds(viewer, allUsers);
  return visible === "all" || visible.includes(companyId);
}

/** Company create/edit is restricted to supervisor + superadmin — employees are read-only. */
export function canManageCompanies(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

/** Who a viewer is allowed to assign to a company: superadmin -> anyone active, supervisor -> their own team. */
export function assignableStaffFor(viewer: User, allUsers: User[]): User[] {
  if (isSuperadmin(viewer)) return allUsers.filter((u) => u.active);
  if (isSupervisor(viewer)) return allUsers.filter((u) => u.active && managesUser(viewer, u));
  return [];
}

export function canManageTeam(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

export function canInviteUsers(user: User): boolean {
  return isSuperadmin(user);
}

export function canViewOrgCounts(user: User): boolean {
  return isSuperadmin(user);
}

/** Editing your own name/email in Settings → Profile: superadmin only. Employees/supervisors see their profile read-only — view, never edit. */
export function canEditOwnProfile(user: User): boolean {
  return isSuperadmin(user);
}

export function canViewUserReport(viewer: User, target: User): boolean {
  return managesUser(viewer, target);
}

export function canGenerateClientFacingReport(
  user: User,
  companyId: string,
  allUsers: User[]
): boolean {
  return canAccessCompany(user, companyId, allUsers);
}

/**
 * Task visibility gate. Employee -> tasks where they're an assignee AND the
 * task's company is one they can access. Supervisor -> tasks where ANY
 * assignee is on their team. Superadmin -> everything.
 */
export function canAccessTask(
  viewer: User,
  task: { assigneeIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isSupervisor(viewer)) {
    const teamIds = new Set(allUsers.filter((u) => managesUser(viewer, u)).map((u) => u.id));
    if (task.assigneeIds.some((id) => teamIds.has(id))) return true;
    // Unassigned tasks (e.g. freshly created from a template) are visible to any supervisor
    // who can access the underlying company, so they can be triaged instead of vanishing from view.
    return task.assigneeIds.length === 0 && canAccessCompany(viewer, task.companyId, allUsers);
  }
  return task.assigneeIds.includes(viewer.id) && canAccessCompany(viewer, task.companyId, allUsers);
}

/** Full-field task edit (retitle, reassign, change company, edit checklist items): supervisor/superadmin, or the employee who self-added it. */
export function canManageTasks(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

export function canEditTask(
  viewer: User,
  task: { createdById: string; selfAdded: boolean }
): boolean {
  if (canManageTasks(viewer)) return true;
  return task.selfAdded && task.createdById === viewer.id;
}

/** Progressing a task (status changes, ticking checklist items) — any assignee, or a manager. */
export function canProgressTask(viewer: User, task: { assigneeIds: string[] }): boolean {
  return canManageTasks(viewer) || task.assigneeIds.includes(viewer.id);
}

/**
 * Logging your OWN time (start/pause/resume/stop a timer, add a manual entry) — deliberately
 * narrower than `canProgressTask`, and no longer an alias of it. Being able to manage/progress a
 * task (status changes, checklist ticks, correcting *someone else's* completed time) never by
 * itself grants permission to log personal time against it — a Supervisor or Superadmin who isn't
 * an explicit assignee has no time of their own to log there; add them as an assignee if they
 * genuinely do the work. Applies identically to every role, including Employee (who this rule
 * doesn't change, since an employee's own tasks always include them as an assignee already).
 */
export function canLogTime(viewer: User, task: { assigneeIds: string[] }): boolean {
  return task.assigneeIds.includes(viewer.id);
}

/** Creating a handoff — same rule as viewing the task itself, named for readability at handoff call sites. */
export function canCreateHandoff(
  viewer: User,
  task: { assigneeIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  return canAccessTask(viewer, task, allUsers);
}

/** Who a handoff on this task can be handed to: anyone (other than the given user) who can already access it. */
export function usersWhoCanReceiveHandoff(
  task: { assigneeIds: string[]; companyId: string },
  allUsers: User[],
  excludeUserId?: string
): User[] {
  return allUsers.filter(
    (u) => u.active && u.id !== excludeUserId && canAccessTask(u, task, allUsers)
  );
}

/** Only the recipient can acknowledge their own handoff, and only once. */
export function canAcknowledgeHandoff(
  viewer: User,
  handoff: { handedToId: string; acknowledgedAt: string | null }
): boolean {
  return handoff.handedToId === viewer.id && !handoff.acknowledgedAt;
}

/**
 * Generating a report: a person report is always about yourself (no picking someone else — the
 * provider forces subjectId to the viewer regardless of what's requested), so it's unconditionally
 * allowed. A client report has no "self," so it reuses the company-visibility gate instead.
 */
export function canGenerateAccomplishmentsReport(
  viewer: User,
  kind: ReportKind,
  subjectId: string,
  allUsers: User[]
): boolean {
  if (kind === "person") return true;
  return canAccessCompany(viewer, subjectId, allUsers);
}

/**
 * The one person a report is "about": for a person report that's the subject themself; a client
 * report has no single subject-person, so the generator stands in as its owner instead.
 */
export function isAccomplishmentsReportOwner(
  viewer: User,
  report: { kind: ReportKind; subjectId: string; generatedById: string }
): boolean {
  if (report.kind === "person") return report.subjectId === viewer.id;
  return report.generatedById === viewer.id;
}

function accomplishmentsReportOwnerId(report: { kind: ReportKind; subjectId: string; generatedById: string }): string {
  return report.kind === "person" ? report.subjectId : report.generatedById;
}

/**
 * The single view gate for Accomplishments Reports — generate/view/comment/trash/restore/
 * permanent-delete all reuse this. Owners always see their own. Employees see *only* their own —
 * full stop, no exceptions, so an employee can never open another person's report by any route,
 * including typing the URL directly. Supervisors additionally see reports owned by their direct
 * reports (their "Team Reports"); superadmins see every report ("All Reports").
 */
export function canViewAccomplishmentsReport(
  viewer: User,
  report: { kind: ReportKind; subjectId: string; generatedById: string },
  allUsers: User[]
): boolean {
  if (isAccomplishmentsReportOwner(viewer, report)) return true;
  if (isEmployee(viewer)) return false;
  const owner = allUsers.find((u) => u.id === accomplishmentsReportOwnerId(report));
  return !!owner && managesUser(viewer, owner);
}

/**
 * Editing a report's own entries (ticking activities, editing detail text) or finalizing it is
 * owner-only, and only while it's still a draft. Supervisors/superadmins viewing someone else's
 * report (via canViewAccomplishmentsReport) get read-only access plus the ability to comment —
 * they must never tick/untick or rewrite another person's entries.
 */
export function canEditAccomplishmentsReportEntries(
  viewer: User,
  report: { kind: ReportKind; subjectId: string; generatedById: string; status: ReportStatus }
): boolean {
  return report.status === "draft" && isAccomplishmentsReportOwner(viewer, report);
}

/**
 * Reopening a finalized report back to draft — owner-only, regardless of role. A supervisor or
 * superadmin viewing someone else's finalized report can never reopen or edit it, no matter how
 * senior they are; their only lever is a reviewer comment, and the owner reopens and fixes it.
 */
export function canReopenAccomplishmentsReport(
  viewer: User,
  report: { kind: ReportKind; subjectId: string; generatedById: string; status: ReportStatus }
): boolean {
  return report.status === "finalized" && isAccomplishmentsReportOwner(viewer, report);
}

/**
 * Reviewer comments: supervisors (on their team's reports) and superadmins (on any report) only —
 * never the owner commenting on their own work, and never an employee, who has no reviewer role
 * here at all (matches canViewAccomplishmentsReport already excluding them from anyone else's report).
 */
export function canCommentOnAccomplishmentsReport(
  viewer: User,
  report: { kind: ReportKind; subjectId: string; generatedById: string },
  allUsers: User[]
): boolean {
  if (isEmployee(viewer)) return false;
  if (isAccomplishmentsReportOwner(viewer, report)) return false;
  return canViewAccomplishmentsReport(viewer, report, allUsers);
}

/**
 * Client Reports (the client-facing, name-safe report — a deliberately separate type/provider from
 * Accomplishments Report above, not a variant of it) — a direct structural mirror of that permission
 * set, with two differences: generating one requires supervisor/superadmin (this is a formal document
 * meant to leave the building, unlike the internal report which any employee can generate about their
 * own work), and employees have no view access at all, not even to one they'd otherwise qualify to see
 * — there's no "your own" client report an employee could own in the first place.
 */
export function canGenerateClientReport(viewer: User, companyId: string, allUsers: User[]): boolean {
  return (isSupervisor(viewer) || isSuperadmin(viewer)) && canAccessCompany(viewer, companyId, allUsers);
}

/** Gates the "Client Reports" tab/page itself, before any specific company is even picked — same role check as canGenerateClientReport, minus the per-company access check. */
export function canManageClientReports(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

/** The generator is the owner — a client report has no single subject-person to stand in for it instead. */
export function isClientReportOwner(viewer: User, report: { generatedById: string }): boolean {
  return report.generatedById === viewer.id;
}

export function canViewClientReport(viewer: User, report: { generatedById: string }, allUsers: User[]): boolean {
  if (isEmployee(viewer)) return false;
  if (isClientReportOwner(viewer, report)) return true;
  const owner = allUsers.find((u) => u.id === report.generatedById);
  return !!owner && managesUser(viewer, owner);
}

export function canEditClientReportEntries(
  viewer: User,
  report: { generatedById: string; status: ClientReportStatus }
): boolean {
  return report.status === "draft" && isClientReportOwner(viewer, report);
}

export function canReopenClientReport(
  viewer: User,
  report: { generatedById: string; status: ClientReportStatus }
): boolean {
  return report.status === "finalized" && isClientReportOwner(viewer, report);
}

export function canCommentOnClientReport(
  viewer: User,
  report: { generatedById: string },
  allUsers: User[]
): boolean {
  if (isEmployee(viewer)) return false;
  if (isClientReportOwner(viewer, report)) return false;
  return canViewClientReport(viewer, report, allUsers);
}

/** The one person a daily update is about — there's no "kind" distinction like Accomplishments Report, a daily update is always about its own userId. */
export function isDailyUpdateOwner(viewer: User, update: { userId: string }): boolean {
  return update.userId === viewer.id;
}

/** Same shape as canViewAccomplishmentsReport: owner always sees their own; employees see only their own, full stop; supervisor sees direct reports; superadmin sees everyone. */
export function canViewDailyUpdate(viewer: User, update: { userId: string }, allUsers: User[]): boolean {
  if (isDailyUpdateOwner(viewer, update)) return true;
  if (isEmployee(viewer)) return false;
  const owner = allUsers.find((u) => u.id === update.userId);
  return !!owner && managesUser(viewer, owner);
}

/** Editing an entry's detail text, or confirming — owner-only, and only while still a draft. */
export function canEditDailyUpdate(viewer: User, update: { userId: string; status: DailyUpdateStatus }): boolean {
  return update.status === "draft" && isDailyUpdateOwner(viewer, update);
}

/** Reopening a confirmed update back to draft — owner-only, regardless of role, mirroring canReopenAccomplishmentsReport. */
export function canReopenDailyUpdate(viewer: User, update: { userId: string; status: DailyUpdateStatus }): boolean {
  return update.status === "confirmed" && isDailyUpdateOwner(viewer, update);
}

/**
 * Gates the "Team Updates" nav item/page itself (Phase B). Unlike Reports, which stays visible to
 * employees scoped to just their own, Team Updates has nothing useful to show an employee — no one
 * "below" them to browse, and their own update already lives on My Day — so it's hidden entirely,
 * mirroring how canManageTasks already gates the "Tasks" nav item.
 */
export function canViewTeamUpdatesPage(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

/** Same visibility shape as `canViewDailyUpdate` — own time always visible; someone else's only to whoever manages them. */
export function canViewTimeForUser(viewer: User, targetUserId: string, allUsers: User[]): boolean {
  if (viewer.id === targetUserId) return true;
  const target = allUsers.find((u) => u.id === targetUserId);
  return !!target && managesUser(viewer, target);
}

/** Gates the "Team Time" nav item/page itself — same reasoning as `canViewTeamUpdatesPage`: nothing for an employee to browse (no one "below" them), and their own time already lives on My Day. */
export function canViewTeamTimePage(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

/**
 * Correcting a completed time entry — deliberately narrower than `canViewTimeForUser`: viewing your
 * own time is always fine, but *correcting* is a second-party check, never self-service, for anyone,
 * including a superadmin. An employee can never correct a time entry, including their own, in this
 * phase — a correction is Supervisor/Superadmin oversight of someone else's record, not a
 * self-service edit. Deliberately built from `managesUser` rather than `canManageTasks` so a
 * supervisor is scoped to their own direct reports only, never every supervisor's team.
 */
export function canCorrectTimeEntry(viewer: User, targetUserId: string, allUsers: User[]): boolean {
  if (isEmployee(viewer)) return false;
  if (viewer.id === targetUserId) return false;
  if (isSuperadmin(viewer)) return true;
  const target = allUsers.find((u) => u.id === targetUserId);
  return !!target && managesUser(viewer, target);
}

/** Editing an EXISTING workstream (status/dates/lead/team reassignment) stays supervisor +
 * superadmin only — no employee self-service. Creating a new one is broader; see
 * `canCreateWorkstream`. */
export function canManageWorkstreams(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

/**
 * Creating a NEW workstream: supervisor/superadmin unconditionally, or an Employee for a Company
 * they can already access (`canAccessCompany`) — the boss-clarified rule that an Employee may set
 * up their own operational work (Service + Activities + Tasks) without needing a
 * supervisor/superadmin to do it for them. This does not grant broader staff-assignment powers —
 * see the caller-side rule that an Employee-created workstream must name the Employee themselves
 * as its own lead.
 */
export function canCreateWorkstream(viewer: User, companyId: string, allUsers: User[]): boolean {
  if (isSupervisor(viewer) || isSuperadmin(viewer)) return true;
  return isEmployee(viewer) && canAccessCompany(viewer, companyId, allUsers);
}

/**
 * Workstream visibility gate: lead/team membership, mirroring the task visibility
 * gate's shape. The Internal/Non-billable workstream is always visible to everyone,
 * same special-casing as INTERNAL_COMPANY_ID in visibleCompanyIds.
 */
export function canAccessWorkstream(
  viewer: User,
  workstream: { leadUserId: string; teamUserIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (workstream.companyId === INTERNAL_COMPANY_ID) return true;
  if (isSupervisor(viewer)) {
    const teamIds = new Set(allUsers.filter((u) => managesUser(viewer, u)).map((u) => u.id));
    return teamIds.has(workstream.leadUserId) || workstream.teamUserIds.some((id) => teamIds.has(id));
  }
  return workstream.leadUserId === viewer.id || workstream.teamUserIds.includes(viewer.id);
}

/**
 * Project visibility gate — mirrors canAccessWorkstream's exact shape (superadmin sees all; the
 * Internal/Non-billable Company's Project is always visible; otherwise owner/member, scoped
 * through managesUser so Supervisor gets exactly "Projects they personally belong to + Projects
 * containing their own team's legitimate scope," never organization-wide). Deliberately not
 * extended with a Task-assignee-implies-access branch the way canAccessWorkstream was — Project
 * membership is meant to be the real, explicit operational relationship, seeded at backfill time
 * from every current legitimate access path. See docs/current-project-state.md's Phase 8A notes.
 */
export function canAccessProject(
  viewer: User,
  project: { companyId: string; ownerId: string; memberUserIds: string[] },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (project.companyId === INTERNAL_COMPANY_ID) return true;
  if (isSupervisor(viewer)) {
    const teamIds = new Set(allUsers.filter((u) => managesUser(viewer, u)).map((u) => u.id));
    return teamIds.has(project.ownerId) || project.memberUserIds.some((id) => teamIds.has(id));
  }
  return project.ownerId === viewer.id || project.memberUserIds.includes(viewer.id);
}
