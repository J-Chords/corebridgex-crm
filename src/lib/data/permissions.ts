import type { ClientReportStatus, DailyUpdateStatus, ReportKind, ReportStatus, User } from "./types";
import { INTERNAL_COMPANY_ID } from "./constants";

/**
 * Single source of truth for RBAC. Every screen, API route, and data-provider
 * implementation should call these instead of checking `user.role` inline.
 * When we add Supabase RLS policies later, they mirror these rules in SQL —
 * this module stays the source of truth; RLS is a defense-in-depth backstop.
 */

/**
 * Admin Foundation Part 4 parity hardening — mirrors the hosted is_superadmin()/is_supervisor()/
 * is_employee()'s own active check exactly (20260902090000_admin_foundation_active_status_
 * hardening.sql). Deactivating a user must revoke their role-based privileges here too, not just
 * hosted-side — mock and Supabase are two independent implementations of the same rule, kept in
 * sync deliberately (same relationship as every other mock/RLS pair in this codebase).
 */
export function isSuperadmin(user: User): boolean {
  return user.role === "superadmin" && user.active;
}

export function isSupervisor(user: User): boolean {
  return user.role === "supervisor" && user.active;
}

export function isEmployee(user: User): boolean {
  return user.role === "employee" && user.active;
}

/**
 * Phase 9E — the "Sparing Efficiency" reporting-review capability. Orthogonal to role: an Employee
 * or Supervisor with `reportingReviewAccess` gets the same Client Report review/finalize privileges
 * a Superadmin has for this one narrow feature, and a Supervisor without it gets none of them, even
 * for their own direct report's draft. Superadmin is always treated as having it (administrative
 * override) whether or not the flag itself is set. Never infer this from role/title/department/
 * email/name — only the explicit `reportingReviewAccess` field (server-authoritative; see
 * `set_reporting_review_access`) counts.
 */
export function hasReportingReviewAccess(user: User): boolean {
  return isSuperadmin(user) || user.reportingReviewAccess === true;
}

/** True if `manager` is `target`'s direct supervisor, or superadmin (sees everyone's team). */
export function managesUser(manager: User, target: User): boolean {
  if (isSuperadmin(manager)) return true;
  if (manager.id === target.id) return manager.active;
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

/** Admin Foundation — the Admin Users / Admin Services management surfaces are superadmin-only.
 * UI-facing convenience gate; the real boundary is the underlying RPC/Server Action. */
export function canManageAdminUsers(user: User): boolean {
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
 *
 * Phase 10 — `hierarchyAssigneeIds` (optional) carries the combined assignee ids of this Task's
 * ONE-HOP hierarchy relation: its parent's assignees (when this Task is a Subtask) plus its
 * Subtasks' assignees (when this Task is a parent). Being in that set grants READ visibility only —
 * enough to see "Subtask of <parent>"/"2 of 4 Subtasks done" context — never edit/progress/time-log
 * rights, which stay on the fully separate `canEditTask`/`canProgressTask`/`canLogTime` predicates.
 * Always a single hop (never recursive), since nesting is capped at one level by the data model
 * itself. Omitting the field preserves the exact pre-Phase-10 behavior for every existing call site.
 */
export function canAccessTask(
  viewer: User,
  task: { assigneeIds: string[]; companyId: string; hierarchyAssigneeIds?: string[] },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isSupervisor(viewer)) {
    const teamIds = new Set(allUsers.filter((u) => managesUser(viewer, u)).map((u) => u.id));
    if (task.assigneeIds.some((id) => teamIds.has(id))) return true;
    // Unassigned tasks (e.g. freshly created from a template) are visible to any supervisor
    // who can access the underlying company, so they can be triaged instead of vanishing from view.
    if (task.assigneeIds.length === 0 && canAccessCompany(viewer, task.companyId, allUsers)) return true;
  } else if (task.assigneeIds.includes(viewer.id) && canAccessCompany(viewer, task.companyId, allUsers)) {
    return true;
  }
  return Boolean(task.hierarchyAssigneeIds?.includes(viewer.id)) && canAccessCompany(viewer, task.companyId, allUsers);
}

/**
 * Phase 10 hierarchy-authorization hardening — pure pre-Phase-10 `canAccessTask` semantics, with NO
 * `hierarchyAssigneeIds` branch. Use this (never `canAccessTask`) as the authorization gate for any
 * MUTATION or side-effect on a Task — creating a Subtask, a Note, a Handoff, logging time, or the
 * parent time roll-up. `canAccessTask` remains the READ-only hierarchy-visibility helper for list/
 * detail screens and SELECT-shaped queries; being visible to a viewer through a parent/child
 * relationship must never, by itself, grant operating authority over that row.
 */
export function canAccessTaskDirectly(
  viewer: User,
  task: { assigneeIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isSupervisor(viewer)) {
    const teamIds = new Set(allUsers.filter((u) => managesUser(viewer, u)).map((u) => u.id));
    if (task.assigneeIds.some((id) => teamIds.has(id))) return true;
    return task.assigneeIds.length === 0 && canAccessCompany(viewer, task.companyId, allUsers);
  }
  return task.assigneeIds.includes(viewer.id) && canAccessCompany(viewer, task.companyId, allUsers);
}

/** Full-field task edit (retitle, reassign, change company, edit checklist items): supervisor/superadmin, or the employee who self-added it. */
export function canManageTasks(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

/**
 * Phase 13 final security hardening — Supervisor's own branch was previously role-global
 * (`canManageTasks(viewer)`, true for ANY Supervisor over ANY Task in the org), mirroring the same
 * bug found and fixed hosted-side in `can_edit_task` (see `20260828110000_supervisor_task_mutation_
 * scope_hardening.sql`). Narrowed to `isSupervisor(viewer) && canAccessTaskDirectly(viewer, task,
 * allUsers)` — the same mutation-safe (never hierarchy-inclusive `canAccessTask`) helper already
 * used by `canCreateHandoff`/the Notes/Time-Entry/Task providers. Superadmin and the Employee
 * self-added-creator branch are completely unchanged. `allUsers` only needs to contain the actual
 * candidates `canAccessTaskDirectly`'s own Supervisor branch needs to resolve (this Task's own
 * assignees' `supervisorId`, and — for the rare unassigned-Task case — the viewer's full team's
 * `assignedCompanyIds`) — passing `assignableStaffFor(viewer, ...)`'s own already-team-scoped
 * result works correctly here (filtering an already-team-scoped list by `managesUser` again is a
 * no-op), which is exactly what every UI call site already has on hand via `useCompanyLookups()`.
 */
export function canEditTask(
  viewer: User,
  task: { createdById: string; selfAdded: boolean; assigneeIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isSupervisor(viewer)) return canAccessTaskDirectly(viewer, task, allUsers);
  return task.selfAdded && task.createdById === viewer.id;
}

/**
 * Deleting a task — deliberately the exact same boundary as `canEditTask`, not a separate
 * role-based guess: an Employee may delete a Task only under the identical condition they may
 * already edit every field of it (self-added, still theirs). This is a UI-only convenience
 * gate — `delete_task`'s own SECURITY DEFINER RPC re-derives and enforces this itself via
 * `can_edit_task`, and additionally blocks deletion outright whenever the Task has logged time,
 * Subtasks, or attached Notes (never exposed as a permission the client can bypass by hiding UI).
 */
export function canDeleteTask(
  viewer: User,
  task: { createdById: string; selfAdded: boolean; assigneeIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  return canEditTask(viewer, task, allUsers);
}

/**
 * Progressing a task (status changes, ticking checklist items): any assignee, or a manager whose
 * own scope legitimately reaches this Task. Same Phase 13 hardening as `canEditTask` — Supervisor's
 * branch is narrowed from role-global to `canAccessTaskDirectly`; Superadmin and the plain-assignee
 * branch (which already covers Employee) are unchanged.
 */
export function canProgressTask(
  viewer: User,
  task: { assigneeIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isSupervisor(viewer)) return canAccessTaskDirectly(viewer, task, allUsers);
  return task.assigneeIds.includes(viewer.id);
}

/**
 * Phase 12B final polish — ADDING a new checklist line, deliberately narrower than `canEditTask`:
 * a direct assignee needs enough operational control to make the work executable (the Supervisor
 * forgot an item), but that must never imply title/description/context/assignee/priority/due-date
 * edit rights, or the ability to delete/rename someone else's existing checklist line (those stay
 * on `canEditTask`, unchanged). True for anyone who already has full edit rights (so Supervisor/
 * Superadmin/the self-added creator are unaffected), OR any direct assignee.
 *
 * NOT YET WIRED into `TaskChecklist`'s add-gate. The database boundary for actually adding a
 * checklist row is `checklist_items`' own RLS policy (`checklist_items_write`, `USING/WITH CHECK
 * can_edit_task(task_id)`), and the client's only existing write path (`updateTask`) touches the
 * `tasks` row first — RLS-gated by `tasks_update`'s own `can_edit_task(id)` — before it ever
 * reaches `checklist_items`. Both reject a directly-assigned-but-non-editing Employee today, so
 * this helper alone cannot yet make the feature work end-to-end against real Supabase without a
 * new narrow SECURITY DEFINER RPC (mirroring `toggle_checklist_item`'s existing `can_progress_task`-
 * gated pattern, INSERT-only, touching no other column/table) — see docs/current-project-state.md's
 * Phase 12B final-polish section for the exact proposed migration, intentionally not created yet.
 */
export function canAddTaskChecklistItem(
  viewer: User,
  task: { assigneeIds: string[]; createdById: string; selfAdded: boolean; companyId: string },
  allUsers: User[]
): boolean {
  return canEditTask(viewer, task, allUsers) || task.assigneeIds.includes(viewer.id);
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

/**
 * Creating a handoff — requires DIRECT Task access (Phase 10 hierarchy-authorization hardening):
 * being able to see a Task only because you're assigned to its parent/child must never let you
 * initiate a handoff on it.
 */
export function canCreateHandoff(
  viewer: User,
  task: { assigneeIds: string[]; companyId: string },
  allUsers: User[]
): boolean {
  return canAccessTaskDirectly(viewer, task, allUsers);
}

/** Who a handoff on this task can be handed to: anyone (other than the given user) with DIRECT
 * access to it — recipient eligibility represents legitimate independent Task access, never
 * hierarchy-only visibility (Phase 10 hierarchy-authorization hardening). */
export function usersWhoCanReceiveHandoff(
  task: { assigneeIds: string[]; companyId: string },
  allUsers: User[],
  excludeUserId?: string
): User[] {
  return allUsers.filter(
    (u) => u.active && u.id !== excludeUserId && canAccessTaskDirectly(u, task, allUsers)
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
/**
 * Client Report generation (Phase 9B locked business rule — "Employees may generate Client Report
 * drafts"). Deliberately Project-scoped, not Company-scoped: `canAccessProject` already gives an
 * Employee "Projects they personally belong to," a Supervisor "+ their team's," and Superadmin
 * everything, in one call — exactly the target matrix for generation, no per-role branching needed
 * here. Scoping by Project (not Company) is what prevents a Company with two annual Projects (e.g.
 * "...2025-2026" and "...2026-2027") from ever having both years' work mixed into one report.
 */
export function canGenerateClientReport(
  viewer: User,
  project: { companyId: string; ownerId: string; memberUserIds: string[] },
  allUsers: User[]
): boolean {
  return canAccessProject(viewer, project, allUsers);
}

/** Whether the "Team's/All Client Reports" second tab exists at all on the list page — an Employee
 * has no one "below" them to see reports for, same shape as the internal report's own My/Team split. */
export function canViewOthersClientReports(user: User): boolean {
  return isSupervisor(user) || isSuperadmin(user);
}

/** The generator is the owner — a client report has no single subject-person to stand in for it instead. */
export function isClientReportOwner(viewer: User, report: { generatedById: string }): boolean {
  return report.generatedById === viewer.id;
}

/**
 * View gate. Owner always sees their own report (this now includes an Employee viewing a Client
 * Report they themselves generated — the pre-9B version checked `isEmployee` first and returned
 * false unconditionally, which incorrectly hid an Employee-owner's own generated report from
 * themselves; owner-check now runs first). A reporting reviewer (Phase 9E — `hasReportingReviewAccess`,
 * orthogonal to role) sees every Client Report org-wide, needed for the Review Queue. Otherwise:
 * never an employee, and only a supervisor/superadmin who manages the actual owner.
 */
export function canViewClientReport(viewer: User, report: { generatedById: string }, allUsers: User[]): boolean {
  if (isClientReportOwner(viewer, report)) return true;
  if (hasReportingReviewAccess(viewer)) return true;
  if (isEmployee(viewer)) return false;
  const owner = allUsers.find((u) => u.id === report.generatedById);
  return !!owner && managesUser(viewer, owner);
}

/** Editing draft content (Save, "+ Add section/line") stays owner-only regardless of role — an
 * Employee's own generated draft is theirs to refine before anyone reviews it. Deliberately
 * separate from `canFinalizeClientReport` below: generate/edit-own-draft and finalize are two
 * different permissions now, per the Phase 9B "generate draft != finalize" split. */
export function canEditOwnClientDraft(
  viewer: User,
  report: { generatedById: string; status: ClientReportStatus }
): boolean {
  return report.status === "draft" && isClientReportOwner(viewer, report);
}

/**
 * Phase 9E — a reporting reviewer's narrower "wording only" edit lane for a Draft they do NOT own:
 * unlike `canEditOwnClientDraft` (full tree replace via `updateDraft`), this only ever permits
 * changing a line item's `details` text (see `updateDraftWording`/`update_client_report_draft_wording`)
 * — Task identity/Service/Activity/work date/Actual Duration/Service Total/Total Week Hours stay
 * factual truth, never casually rewritten by a reviewer. If those are wrong, fix the operational
 * source and regenerate a new Draft. Deliberately excludes the owner (who already has the fuller
 * `canEditOwnClientDraft` lane) so there's exactly one edit path per (viewer, report) pair, never two
 * competing ones.
 */
export function canEditClientReportWording(
  viewer: User,
  report: { generatedById: string; status: ClientReportStatus }
): boolean {
  if (report.status !== "draft") return false;
  if (isClientReportOwner(viewer, report)) return false;
  return hasReportingReviewAccess(viewer);
}

/**
 * Finalizing a true Client Report (Phase 9E — replaces the Phase 9B interim rule). Deliberately
 * capability-based, not role-based: a Superadmin may always finalize org-wide (administrative
 * override); anyone else needs the explicit `reportingReviewAccess` capability
 * (`hasReportingReviewAccess`), regardless of role — a Supervisor without it can never finalize,
 * not even a direct report's own draft (closing the Phase 9B interim rule's "Supervisor,
 * team-scoped" bypass now that a real orthogonal reviewer capability exists), and an Employee or
 * Supervisor WITH it may finalize org-wide, same as Superadmin. The underlying
 * `finalize_client_report` RPC mirrors this exactly (`has_reporting_review_access()`) and remains
 * authoritative; this is the UI-facing mirror.
 */
export function canFinalizeClientReport(
  viewer: User,
  report: { status: ClientReportStatus }
): boolean {
  if (report.status !== "draft") return false;
  return hasReportingReviewAccess(viewer);
}

/** Phase 9E — only a reporting reviewer (or Superadmin) may create/update/pause/delete recurring
 * Client Report schedules (Phase 9F). Ordinary manual generation is unaffected and open to anyone
 * `canGenerateClientReport` already allows. */
export function canManageClientReportSchedules(viewer: User): boolean {
  return hasReportingReviewAccess(viewer);
}

/**
 * Locked Phase 9B rule: a finalized true Client Report can never be reopened back to draft — it is
 * a permanently immutable historical snapshot once finalized (unlike the internal Accomplishments
 * Report, whose reopen/re-finalize cycle is unchanged). This function is kept, always returning
 * false, only so any stray call site fails closed rather than throwing on a missing import; the
 * real enforcement is the retired `reopen_client_report` RPC (execute revoked) and the removed
 * Reopen UI control.
 */
export function canReopenClientReport(): boolean {
  return false;
}

export function canCommentOnClientReport(
  viewer: User,
  report: { generatedById: string },
  allUsers: User[]
): boolean {
  if (isClientReportOwner(viewer, report)) return false;
  // A reporting reviewer (Phase 9E) may comment org-wide regardless of role — including an
  // Employee-role reviewer, who `isEmployee` would otherwise unconditionally block below.
  if (hasReportingReviewAccess(viewer)) return true;
  if (isEmployee(viewer)) return false;
  return canViewClientReport(viewer, report, allUsers);
}

/**
 * Trash/Restore are deliberately narrower than View/Comment/Finalize — being able to see a report
 * (owner, or a Supervisor managing its generator) does not imply being able to delete it. Only the
 * report's own generator, or Superadmin, may trash/restore it; a Supervisor who can legitimately
 * view/comment on/finalize a direct report's Client Report must not also get destructive control
 * over it merely because they can see it (Phase 9B hotfix; mirrors the RPCs' own predicate).
 */
export function canTrashClientReport(viewer: User, report: { generatedById: string }): boolean {
  return isClientReportOwner(viewer, report) || isSuperadmin(viewer);
}

export function canRestoreClientReport(viewer: User, report: { generatedById: string }): boolean {
  return canTrashClientReport(viewer, report);
}

/** Permanent delete is an administrative retention action, Superadmin-only always — never the
 * report's own generator, regardless of role. */
export function canPermanentlyDeleteClientReport(viewer: User): boolean {
  return isSuperadmin(viewer);
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

/**
 * Team Lead review (Phase 9C) — deliberately narrower than `canViewDailyUpdate`: being able to see
 * a submission does not imply being able to review it. Only a submitted (confirmed) update may be
 * reviewed, never a draft; **only a not-yet-reviewed submission may be reviewed** (Phase 9C hotfix
 * — one review marker per submitted snapshot, never overwritten by a second reviewer; reopening
 * clears `reviewedAt` back to null so a re-submit becomes reviewable again); nobody may review
 * their own, including a Supervisor's own submission (it stays an ordinary Employee-style
 * submission awaiting a legitimate higher reviewer, per the locked "Supervisor remains an Employee
 * operationally" rule); Superadmin may review organization-wide; a Supervisor only a genuine direct
 * report's. Mirrors `review_daily_update`'s own predicate exactly
 * (`is_superadmin() OR (is_supervisor() AND manages_user(target))`, plus the same `reviewed_at is
 * null` guard), not `canViewDailyUpdate`'s broader shape, so the two can never drift into "if I can
 * see it, I can review it."
 */
export function canReviewDailyUpdate(
  viewer: User,
  update: { userId: string; status: DailyUpdateStatus; reviewedAt: string | null },
  allUsers: User[]
): boolean {
  if (update.status !== "confirmed") return false;
  if (update.reviewedAt !== null) return false;
  if (isDailyUpdateOwner(viewer, update)) return false;
  if (isSuperadmin(viewer)) return true;
  if (!isSupervisor(viewer)) return false;
  const owner = allUsers.find((u) => u.id === update.userId);
  return !!owner && managesUser(viewer, owner);
}

/** Same visibility shape as `canViewDailyUpdate` — own time always visible; someone else's only to whoever manages them. */
export function canViewTimeForUser(viewer: User, targetUserId: string, allUsers: User[]): boolean {
  if (viewer.id === targetUserId) return true;
  const target = allUsers.find((u) => u.id === targetUserId);
  return !!target && managesUser(viewer, target);
}

/** Phase 9F — same visibility shape as `canViewTimeForUser`: a Supervisor may view a direct
 * report's Visit Entries for team reporting (Section 23), Superadmin sees everyone, an Employee
 * only their own. */
export function canViewVisitEntriesForUser(viewer: User, targetUserId: string, allUsers: User[]): boolean {
  return canViewTimeForUser(viewer, targetUserId, allUsers);
}

export function isVisitEntryOwner(viewer: User, entry: { userId: string }): boolean {
  return entry.userId === viewer.id;
}

/** Create/edit is always self-service, regardless of role — a Supervisor's "same Employee-style own
 * Visit workflow" is not manager-only (Section 23's own explicit instruction). */
export function canEditVisitEntry(viewer: User, entry: { userId: string }): boolean {
  return isVisitEntryOwner(viewer, entry);
}

/** Delete is owner OR Superadmin (Section 23's "current admin pattern") — never a Supervisor acting
 * on a direct report's Visit Entry merely because they manage them. */
export function canDeleteVisitEntry(viewer: User, entry: { userId: string }): boolean {
  return isVisitEntryOwner(viewer, entry) || isSuperadmin(viewer);
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
 * Phase 8B — the Project-aware version of `canCreateWorkstream`, used by the "+ Add Service" flow
 * inside a Project workspace: supervisor/superadmin unconditionally, or an Employee who can
 * access the Project itself (`canAccessProject`) rather than merely the underlying Company —
 * closes the "pass a Company id you happen to know" risk, since Project membership is now the
 * real operational relationship. `canCreateWorkstream` (Company-based) remains for the legacy
 * Company-page flow, which stays Supervisor/Superadmin-only in practice now that Employee no
 * longer has that page at all.
 */
export function canCreateWorkstreamInProject(
  viewer: User,
  project: { companyId: string; ownerId: string; memberUserIds: string[] },
  allUsers: User[]
): boolean {
  if (isSupervisor(viewer) || isSuperadmin(viewer)) return true;
  return isEmployee(viewer) && canAccessProject(viewer, project, allUsers);
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
 * Phase 8C — gates the "+ Add another Activity to this Service" contextual control shown during
 * global Task creation. **Confirmed dead code as of the Activity Level audit** — no component
 * anywhere calls this (the Task form's Activity picker only ever selects among already-enabled
 * Activities, never extends the set); kept only as documented legacy/compatibility, matching the
 * Product Owner's instruction not to remove it merely for cleanup. If a future "extend Activities
 * from Task creation" surface is ever rebuilt, use `canConfigureWorkstreamActivities` below instead
 * — it correctly mirrors the real `workstream_activities_write` RLS (including the Supervisor
 * Project-access check this older helper never had), not this one.
 */
export function canExtendServiceActivities(
  viewer: User,
  workstream: { leadUserId: string },
  assignableStaff: User[]
): boolean {
  if (isEmployee(viewer)) return workstream.leadUserId === viewer.id;
  return assignableStaff.some((s) => s.id === workstream.leadUserId);
}

/**
 * Activity Level, Sections 18-20 — the real narrow boundary for "may this viewer configure which
 * existing catalog Activities this Project Service uses," mirroring the hosted
 * `workstream_activities_write` RLS policy exactly (not `canManageWorkstreams`, which is broader —
 * full Service edit — and not what actually gates this specific junction table). Superadmin always;
 * Employee only if they are this Workstream's own Project Service Lead; Supervisor only if they
 * manage that Lead AND can access the Workstream's own Project. Global Team Lead/"Works In Services"
 * status is never checked here — it grants no Project-level authority (locked Service Level rule).
 */
export function canConfigureWorkstreamActivities(
  viewer: User,
  workstream: { leadUserId: string },
  allUsers: User[],
  project: { companyId: string; ownerId: string; memberUserIds: string[] } | null
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isEmployee(viewer)) return workstream.leadUserId === viewer.id;
  if (isSupervisor(viewer)) {
    const lead = allUsers.find((u) => u.id === workstream.leadUserId);
    if (!lead || !managesUser(viewer, lead)) return false;
    return project != null && canAccessProject(viewer, project, allUsers);
  }
  return false;
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

/**
 * Phase 8E — Project (the annual-contract record itself, not its Services) create/edit/renew is
 * Superadmin-only. This is Company-administration-adjacent, structural org data — deliberately
 * narrower than `canManageCompanies` (Supervisor + Superadmin): Supervisor's extra privileges over
 * Employee are team/operational privileges, never Company/contract administration, and creating a
 * Project is a different act from an Employee/Supervisor operationally creating a Service inside
 * one they already have (`canCreateWorkstreamInProject`, unaffected by this).
 */
export function canManageProjects(user: User): boolean {
  return isSuperadmin(user);
}

/**
 * Project Level Stage C — who may progress/resolve a Project Issue: its reporter, its assignee, or
 * Superadmin. Deliberately narrower than "who can view/create issues" (`canAccessProject` already
 * covers that) — mirrors `set_project_issue_status`'s own predicate exactly.
 */
export function canProgressProjectIssue(
  viewer: User,
  issue: { createdById: string; assignedToId: string | null }
): boolean {
  if (isSuperadmin(viewer)) return true;
  return issue.createdById === viewer.id || issue.assignedToId === viewer.id;
}

/** Edit an Issue's own details (title/description/assignee/links) — reporter or Superadmin only,
 * mirroring `update_project_issue_details`'s own predicate. */
export function canEditProjectIssueDetails(viewer: User, issue: { createdById: string }): boolean {
  return isSuperadmin(viewer) || issue.createdById === viewer.id;
}

/** Edit/delete own Project Comment — author, or Superadmin for delete-as-moderation only. */
export function canEditProjectComment(viewer: User, comment: { authorId: string }): boolean {
  return comment.authorId === viewer.id;
}
export function canDeleteProjectComment(viewer: User, comment: { authorId: string }): boolean {
  return comment.authorId === viewer.id || isSuperadmin(viewer);
}

/**
 * Phase 14B — Document visibility gate, mirroring the hosted `can_access_document` SQL function
 * exactly (`can_access_task` for a Task-linked Document, never `can_access_task_directly`; the
 * narrower `can_access_project` — never the broader `can_access_company` — for a Project-level one).
 * `task`/`project` are the same pre-shaped context objects `canAccessTask`/`canAccessProject`
 * themselves already require; the caller passes whichever one actually applies (a Document has
 * exactly one of the two, per `taskId`). Callers must also confirm `uploadState === "ready"` and
 * `deletedAt === null` themselves before calling this — this function is the Task/Project scope
 * check only, matching the hosted helper's own composition (state is checked separately there too).
 */
export function canAccessDocumentRecord(
  viewer: User,
  doc: {
    taskId: string | null;
    task?: { assigneeIds: string[]; companyId: string };
    project?: { companyId: string; ownerId: string; memberUserIds: string[] };
  },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (doc.taskId) return doc.task != null && canAccessTask(viewer, doc.task, allUsers);
  return doc.project != null && canAccessProject(viewer, doc.project, allUsers);
}

/**
 * Phase 14B — Document manage gate (rename/soft-delete/restore on a READY Document), mirroring the
 * hosted `can_manage_document_row` SQL function: Superadmin unconditional; Supervisor via
 * `canAccessTaskDirectly`/`canAccessProject` (never role-global, matching this session's own
 * Supervisor Task-mutation hardening); Employee only their own upload, and only while they still
 * hold DIRECT Task authority (`canAccessTaskDirectly`, never the broader `canAccessTask`) — or
 * `canAccessProject` for a Project-level Document.
 *
 * Direct-authority hotfix — the Employee branch previously reused `canAccessDocumentRecord` (which
 * composes `canAccessTask`, the READ/hierarchy-visibility helper) for its Task-linked condition.
 * That let an uploader who kept only hierarchy-only READ visibility after losing direct Task
 * authority still retain rename/delete/restore rights — a real gap, since uploading/managing a
 * Document is a mutation, not a read. Fixed to compose `canAccessTaskDirectly` directly, mirroring
 * `canEditTask`'s own established mutation-gate shape exactly. `canAccessDocumentRecord`'s own
 * `canAccessTask` composition is UNCHANGED and remains correct for VIEW — a hierarchy-visible Task's
 * attachments stay readable exactly like its other content (Notes, Task detail) already is.
 */
export function canManageDocument(
  viewer: User,
  doc: {
    uploadedById: string;
    taskId: string | null;
    task?: { assigneeIds: string[]; companyId: string };
    project?: { companyId: string; ownerId: string; memberUserIds: string[] };
  },
  allUsers: User[]
): boolean {
  if (isSuperadmin(viewer)) return true;
  if (isSupervisor(viewer)) {
    if (doc.taskId) return doc.task != null && canAccessTaskDirectly(viewer, doc.task, allUsers);
    return doc.project != null && canAccessProject(viewer, doc.project, allUsers);
  }
  if (doc.uploadedById !== viewer.id) return false;
  if (doc.taskId) return doc.task != null && canAccessTaskDirectly(viewer, doc.task, allUsers);
  return doc.project != null && canAccessProject(viewer, doc.project, allUsers);
}
