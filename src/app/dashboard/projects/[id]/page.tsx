"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProject, useProjectGroups } from "@/lib/data/hooks/use-projects";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompany, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useServiceLineStaffing } from "@/lib/data/hooks/use-service-membership";
import { useCompanyNotes } from "@/lib/data/hooks/use-notes";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import { projectsProvider, projectIssuesProvider } from "@/lib/data/providers";
import { DEFAULT_TASK_FILTERS, filterTasks, groupTasksBy } from "@/lib/data/hooks/use-task-filters";
import { isAssigneeColumnRedundantForViewer } from "@/lib/data/task-display";
import { operationalProjectIdentity, serviceLineDisplayName } from "@/lib/data/project-display";
import { canCreateWorkstreamInProject, canManageProjects, canManageWorkstreams, isEmployee, isSupervisor } from "@/lib/data/permissions";
import { AddServiceActivitiesDialog } from "@/components/workstreams/add-service-activities-dialog";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { PeopleInline } from "@/components/projects/people-inline";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { SafeMarkdown } from "@/lib/markdown-lite";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import type { ClientContact, ProjectIssue, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { CompanyStatusBadge } from "@/components/companies/company-status-badge";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import { ContactFormDialog } from "@/components/companies/contact-form-dialog";
import { WorkstreamStatusBadge } from "@/components/workstreams/workstream-status-badge";
import { AddProjectServiceDialog } from "@/components/projects/add-project-service-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectStatusControl } from "@/components/projects/project-status-control";
import { ProjectCommentsSection } from "@/components/projects/project-comments-section";
import { ProjectIssuesSection } from "@/components/projects/project-issues-section";
import { ProjectDocumentsSection } from "@/components/projects/project-documents-section";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { TaskTimeline } from "@/components/tasks/task-timeline";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { SharedNotesSection } from "@/components/notes/shared-notes-section";
import { ProjectTimeTeam } from "@/components/projects/project-time-team";
import { ClientReportsTable } from "@/components/client-reports/client-reports-table";
import { useClientReports } from "@/lib/data/hooks/use-client-reports";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToastManager } from "@/components/ui/toast";
import { getInitials as initials } from "@/lib/initials";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Project Level Stage C IA — Timeline tab removed entirely (the underlying `ProjectTimeline`
// component/audit data is untouched, just no longer rendered); Team renamed Members; History's own
// four sub-sections dissolved into their own top-level tabs (Context -> folded into Overview's own
// Notes panel; Completed Work dropped as a dedicated panel — redundant with Tasks' own "Done"
// status group; Client Reports -> Reports; Time & Team -> Time); Comments/Documents/Issues are new.
type TabKey = "overview" | "services" | "tasks" | "members" | "comments" | "documents" | "time" | "issues" | "reports";
type TaskView = "list" | "timeline";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "tasks", label: "Tasks" },
  { key: "members", label: "Members" },
  { key: "comments", label: "Comments" },
  { key: "documents", label: "Documents" },
  { key: "time", label: "Time" },
  { key: "issues", label: "Issues" },
  { key: "reports", label: "Reports" },
];

/** Short "Sep 8" form for a Next Due date — no year, matches the Project list's own convention. */
function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * A compact `Overdue`/`Waiting`/`Blocked` + `Next due` panel — Section 16's "Work needing
 * attention," reused for both the project-wide Admin/Team Lead view and the "my work" Employee
 * view (same shape, different counts/labels fed in — Section 12's "shared visual system, not three
 * unrelated designs"). All figures come from the Tasks already fetched on this page; nothing new
 * is queried, nothing is fabricated (Section 25) — zero of everything renders as one calm empty
 * state rather than a row of dashes (Section 17).
 */
function AttentionPanel({
  title,
  overdueCount,
  waitingCount,
  blockedCount,
  openCount,
  nextDueTask,
  onViewTasks,
}: {
  title: string;
  overdueCount: number;
  waitingCount: number;
  blockedCount: number;
  openCount?: number;
  /** Step 4 Section 7 — the next-due item's own identity, never a bare date. */
  nextDueTask: { title: string; dueDate: string } | null;
  onViewTasks: () => void;
}) {
  const nothingToShow = overdueCount === 0 && waitingCount === 0 && blockedCount === 0 && !nextDueTask;
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <button type="button" onClick={onViewTasks} className="text-sm text-muted-foreground hover:underline">
          View Tasks
        </button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {nothingToShow ? (
          <p className="text-sm text-muted-foreground">
            {openCount ? `${openCount} open, nothing overdue or blocked.` : "No upcoming work."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {overdueCount > 0 && <Badge variant="destructive">{overdueCount} overdue</Badge>}
              {waitingCount > 0 && <Badge variant="secondary">{waitingCount} waiting</Badge>}
              {blockedCount > 0 && <Badge variant="secondary">{blockedCount} blocked</Badge>}
            </div>
            {nextDueTask && (
              <p className="text-sm text-muted-foreground">
                Next due: <span className="font-medium text-foreground">{nextDueTask.title}</span> —{" "}
                {formatShortDate(nextDueTask.dueDate)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Section 15 — actual global Service Line names, a compact 3-item + overflow list, never a bare
 * count or a duplicate metric card. */
function ServicesSummaryPanel({
  workstreams,
  serviceLines,
  onViewServices,
}: {
  workstreams: { name: string; serviceLineId: string | null }[];
  serviceLines: { id: string; name: string }[];
  onViewServices: () => void;
}) {
  const names = workstreams.map((w) => serviceLineDisplayName(w, serviceLines));
  const shown = names.slice(0, 3);
  const overflow = names.length - shown.length;
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Services</CardTitle>
        <button type="button" onClick={onViewServices} className="text-sm text-muted-foreground hover:underline">
          View Services
        </button>
      </CardHeader>
      <CardContent>
        {names.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Services configured yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {shown.map((name, i) => (
              <span key={`${name}-${i}`} className="text-sm">
                {name}
              </span>
            ))}
            {overflow > 0 && <span className="text-xs text-muted-foreground">+{overflow} more</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Section 9E/10E — compact Project participants, never a giant people grid. */
function TeamPanel({
  members,
  onViewMembers,
}: {
  members: { id: string; fullName: string }[];
  onViewMembers: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Team</CardTitle>
        <button type="button" onClick={onViewMembers} className="text-sm text-muted-foreground hover:underline">
          View Members
        </button>
      </CardHeader>
      <CardContent>
        <PeopleInline people={members} emptyText="No Project members yet." />
      </CardContent>
    </Card>
  );
}

/**
 * Phase 13B (redesigned, Reference 1's visual language) — the Project workspace is the primary
 * Employee/Supervisor operational entry point for Client work, deliberately NOT duplicated by a
 * separate Client route (rejected — see docs/phase-13-client-history-audit.md Section 21).
 * Deliberately no Contacts/Company-admin-metadata/Company-edit-controls anywhere on this page —
 * that stays on the Company admin pages, Superadmin-only.
 *
 * Split into an outer loading/not-found wrapper + `LoadedProjectDetailPage`, mounted only once a
 * real Project is guaranteed — the same Rules-of-Hooks-safe pattern `TaskDrawer`/the full Task page
 * already use. Necessary here because `useCompanyNotes(project.companyId)` would otherwise run
 * with an empty id during the loading window; unlike `useCompany`/`getWorkstream`/`getTask`, the
 * Supabase Notes provider has no empty-id guard (no caller had ever passed one before), and gating
 * the mount avoids ever needing one.
 */
export default function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <ProjectDetailPageContent {...props} />
    </Suspense>
  );
}

/** `useSearchParams` requires a Suspense boundary above it — split out purely for that, same
 * pattern already established on `/dashboard/tasks` for its own `?status=`/`?assignee=` deep-link
 * seeding. Reads the optional `?tab=`/`?view=` query params so the Project Gantt (Part B) can link
 * straight to `Project → Tasks → Timeline` — normal navigation (no query params) is unaffected. */
function ProjectDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { project, isLoading, notFound, refresh } = useProject(id);

  if (!user) return null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !project) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/projects" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to projects
        </Link>
        <p className="text-sm text-muted-foreground">
          This project doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  return <LoadedProjectDetailPage user={user} project={project} refreshProject={refresh} />;
}

function LoadedProjectDetailPage({
  user,
  project,
  refreshProject,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  project: NonNullable<ReturnType<typeof useProject>["project"]>;
  refreshProject: () => void;
}) {
  const searchParams = useSearchParams();
  const { workstreams, isLoading: workstreamsLoading, refresh: refreshWorkstreams } = useWorkstreams({ projectId: project.id });
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks({ workstreamIds: workstreams.map((w) => w.id) });
  const { company, contacts: clientContacts, refresh: refreshCompany } = useCompany(project.companyId);
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [editContact, setEditContact] = useState<ClientContact | "new" | null>(null);
  const { notes } = useCompanyNotes(project.companyId);
  const { runningTimer } = useRunningTimer();
  const { assignableStaff, serviceLines } = useCompanyLookups();
  const { groups: projectGroups } = useProjectGroups();
  const serviceLineIds = useMemo(
    () => Array.from(new Set(workstreams.map((w) => w.serviceLine?.id).filter((id): id is string => !!id))),
    [workstreams]
  );
  const { staffing: globalServiceStaffing } = useServiceLineStaffing(serviceLineIds);
  const toastManager = useToastManager();
  // Phase 13C — Client Reports are org-wide-authorized (canViewClientReport), never re-derived here;
  // this only narrows an already-authorized set down to this Project's own reports.
  const { reports: allAuthorizedReports } = useClientReports();
  const projectReports = useMemo(
    () => allAuthorizedReports.filter((r) => r.projectId === project.id),
    [allAuthorizedReports, project.id]
  );

  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const refreshIssues = useCallback(async () => {
    setIssues(await projectIssuesProvider.listIssues(user, project.id));
  }, [user, project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshIssues();
  }, [refreshIssues]);
  // Stable target reference for the Comments panel — never a fresh literal per render, so
  // useProjectComments' effect doesn't re-fetch needlessly.
  const commentsTarget = useMemo(() => ({ projectId: project.id }), [project.id]);

  // Deep-link seeding — e.g. the Projects Gantt (Part B) links to
  // `/dashboard/projects/[id]?tab=tasks&view=timeline` so clicking a Project's scheduled-work bar
  // opens straight to its Task Timeline. Lazy initializer, same convention `/dashboard/tasks`
  // already uses for its own `?status=`/`?assignee=` params — normal navigation (no query params)
  // leaves `tab`/`taskView` at their existing "overview"/"list" defaults.
  const [tab, setTab] = useState<TabKey>(() => {
    const tabParam = searchParams.get("tab");
    return TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overview";
  });
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  // Project Final Integration Correction — "Configure Activities" on an already-attached Service
  // reuses the existing `AddServiceActivitiesDialog` (previously only reachable from the Task form's
  // now-removed inline flow) — offers only this Service's remaining, not-yet-enabled catalog
  // Activities, never requires re-adding the Service itself.
  const [configureActivitiesFor, setConfigureActivitiesFor] = useState<WorkstreamWithRelations | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskView, setTaskView] = useState<TaskView>(() => {
    const viewParam = searchParams.get("view");
    return viewParam === "list" || viewParam === "timeline" ? viewParam : "list";
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskDefaultStatus, setCreateTaskDefaultStatus] = useState<TaskStatus | undefined>(undefined);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>(() => project.members.map((m) => m.id));
  const [savingMembers, setSavingMembers] = useState(false);
  // Project Final Pre-Acceptance Correction — Project Role/Responsibility editing. Reuses the
  // already-hosted `project_role` column + `set_project_member_role` RPC (Admin-only server-side)
  // via the existing `projectsProvider.setProjectMemberRole` method — no new migration/provider.
  const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  function openCreateTask(defaultStatus?: TaskStatus) {
    setCreateTaskDefaultStatus(defaultStatus);
    setCreateTaskOpen(true);
  }

  const runningTaskId = runningTimer?.taskId ?? null;
  const filteredTasks = useMemo(
    () => filterTasks(tasks, { ...DEFAULT_TASK_FILTERS, search: taskSearch }),
    [tasks, taskSearch]
  );
  const taskGroups = useMemo(() => groupTasksBy(filteredTasks, "status"), [filteredTasks]);
  const showAssignee = isEmployee(user) ? !isAssigneeColumnRedundantForViewer(filteredTasks, user.id) : true;
  const projectIdentity = operationalProjectIdentity(project.companyName, project.name);
  const statusCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = { todo: 0, "in-progress": 0, blocked: 0, "waiting-on-client": 0, done: 0 };
    for (const t of tasks) counts[t.status] += 1;
    return counts;
  }, [tasks]);

// Manual Acceptance Step 3/4 — Overview role-awareness. All derived from Tasks/Services/Members
  // already fetched above; nothing new queried, nothing fabricated (Section 25). Next Due always
  // carries the Task itself (title + date), never a bare date with no item identity (Step 4
  // Section 7).
  const isTeamLead = isSupervisor(user);
  const nextDueTask = useMemo(() => {
    const withDue = tasks
      .filter((t) => t.status !== "done" && t.dueDate != null)
      .map((t) => ({ title: t.title, dueDate: t.dueDate as string }));
    return withDue.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0] ?? null;
  }, [tasks]);
  const myTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done" && t.assignees.some((a) => a.id === user.id)),
    [tasks, user.id]
  );
  const today = new Date().toISOString().slice(0, 10);
  const myOverdueCount = myTasks.filter((t) => t.dueDate != null && t.dueDate < today).length;
  const myNextDueTask = useMemo(() => {
    const withDue = myTasks.filter((t) => t.dueDate != null).map((t) => ({ title: t.title, dueDate: t.dueDate as string }));
    return withDue.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0] ?? null;
  }, [myTasks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberIds(project.members.map((m) => m.id));
  }, [project.members]);

  async function handleSaveMembers() {
    setSavingMembers(true);
    try {
      await projectsProvider.updateProject(user, project.id, {
        companyId: project.companyId,
        name: project.name,
        ownerId: project.ownerId,
        contractStartDate: project.contractStartDate,
        contractMonths: project.contractMonths,
        contractEndDate: project.contractEndDate,
        completionDate: project.completionDate,
        startDate: project.startDate,
        endDate: project.endDate,
        description: project.description,
        projectGroupId: project.projectGroupId,
        tags: project.tags,
        memberUserIds: memberIds,
      });
      refreshProject();
      toastManager.add({ description: "Members updated" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update members." });
    } finally {
      setSavingMembers(false);
    }
  }

  function startEditingRole(memberId: string, currentRole: string | null) {
    setEditingRoleFor(memberId);
    setRoleDraft(currentRole ?? "");
  }

  async function handleSaveRole(memberId: string) {
    setSavingRole(true);
    try {
      await projectsProvider.setProjectMemberRole(user, project.id, memberId, roleDraft.trim() || null);
      setEditingRoleFor(null);
      refreshProject();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update responsibility." });
    } finally {
      setSavingRole(false);
    }
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const canAddService = canCreateWorkstreamInProject(
    user,
    { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: project.members.map((m) => m.id) },
    project.members
  );

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/projects" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to projects
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CompanyProjectAvatar
            companyId={project.companyId}
            companyName={project.companyName}
            isInternal={project.isInternal}
          />
          {/* Phase 13B final boss-feedback pass — the Company name is the daily operational
              identity; the Project's own name only appears here (as a small subtitle) when it
              genuinely says something the Company name doesn't already (see
              `operationalProjectIdentity`) — never the redundant "Company name + year range" form. */}
          <div className="flex flex-col">
            <h1 className="font-heading text-2xl font-semibold leading-tight">{projectIdentity.primary}</h1>
            {projectIdentity.secondary && (
              <span className="text-sm text-muted-foreground">{projectIdentity.secondary}</span>
            )}
          </div>
          <ProjectStatusControl project={project} onChanged={refreshProject} />
        </div>
        <div className="flex items-center gap-2">
          {workstreams.length > 0 && project.status !== "trash" && (
            <Button size="sm" onClick={() => openCreateTask()} data-shortcut="new-task">
              <Plus /> New Task
            </Button>
          )}
          {canManageProjects(user) && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
              (tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          {/* B. Compact operational summary — role-conditional, 3-4 tiles, never a duplicate of the
              detail panels below (Section 5/9B/10B/11B). */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(canManageProjects(user)
              ? [
                  { label: "Services", value: workstreams.length },
                  { label: "Open Work", value: project.tasks.openCount },
                  { label: "Attention", value: project.tasks.overdueCount },
                  { label: "Team", value: project.members.length },
                ]
              : isTeamLead
                ? [
                    { label: "Open Tasks", value: project.tasks.openCount },
                    { label: "Attention", value: project.tasks.overdueCount },
                    { label: "Next Due", value: formatShortDate(nextDueTask?.dueDate ?? null) },
                    { label: "Team", value: project.members.length },
                  ]
                : [
                    { label: "My Open Work", value: myTasks.length },
                    { label: "My Attention", value: myOverdueCount },
                    { label: "Next Due", value: formatShortDate(myNextDueTask?.dueDate ?? null) },
                  ]
            ).map((item) => (
              <Card key={item.label} className="p-3">
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{item.label}</span>
                <span className="text-lg leading-tight font-semibold">{item.value}</span>
              </Card>
            ))}
          </div>

          {/* C + D. Work needing attention, and Services — one coherent grouped panel each, side
              by side at desktop width, never split into many equal-weight cards (Section 5/16). */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {canManageProjects(user) || isTeamLead ? (
              <AttentionPanel
                title="Work needing attention"
                overdueCount={project.tasks.overdueCount}
                waitingCount={statusCounts["waiting-on-client"]}
                blockedCount={statusCounts.blocked}
                openCount={project.tasks.openCount}
                nextDueTask={nextDueTask}
                onViewTasks={() => setTab("tasks")}
              />
            ) : (
              <AttentionPanel
                title="My work"
                overdueCount={myOverdueCount}
                waitingCount={myTasks.filter((t) => t.status === "waiting-on-client").length}
                blockedCount={myTasks.filter((t) => t.status === "blocked").length}
                openCount={myTasks.length}
                nextDueTask={myNextDueTask}
                onViewTasks={() => setTab("tasks")}
              />
            )}
            <ServicesSummaryPanel workstreams={workstreams} serviceLines={serviceLines} onViewServices={() => setTab("services")} />
          </div>

          {/* E + F. Team, and (Admin-only) Administrative Details — Admin gets both side by side;
              Team Lead gets Team alone; Employee gets neither (Section 9E/9F/10D/11). */}
          {canManageProjects(user) ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TeamPanel members={project.members} onViewMembers={() => setTab("members")} />
              {company && (
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle className="text-base">Administrative Details</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setEditCompanyOpen(true)}>
                      <Pencil /> Edit
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Account Status</span>
                        <CompanyStatusBadge status={company.status} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Partner Brand</span>
                        <span className="text-sm">{company.brand?.name ?? "No brand yet"}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Contract Start</span>
                        <span className="text-sm">{formatDate(company.contractStartDate)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Renewal Date</span>
                        <span className="text-sm">{formatDate(company.renewalDate)}</span>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Contacts</span>
                        <button
                          type="button"
                          onClick={() => setEditContact("new")}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          + Add contact
                        </button>
                      </div>
                      {clientContacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No contacts yet.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {clientContacts.map((contact, i) => (
                            <div key={contact.id}>
                              {i > 0 && <Separator className="my-2" />}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-col">
                                  <span className="flex items-center gap-1.5 text-sm font-medium">
                                    {contact.name}
                                    {contact.isPrimary && (
                                      <Badge variant="secondary" className="text-[10px]">
                                        Primary
                                      </Badge>
                                    )}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {[contact.title, contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setEditContact(contact)}
                                  className="text-xs text-muted-foreground hover:underline"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Created by</span>
                      <span className="text-sm">{project.createdBy.fullName}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : isTeamLead ? (
            <TeamPanel members={project.members} onViewMembers={() => setTab("members")} />
          ) : null}

          {/* Shared Project information — compact by default (Step 4 Section 8): Owner is always
              shown; Group/dates/Tags only take space when at least one actually has a value, never
              a grid of "Not set"/"—" placeholders. Read-only for everyone except via the header's
              own Admin-only Edit button. */}
          {(() => {
            const detailItems = [
              project.projectGroupId && { label: "Project Group", value: projectGroups.find((g) => g.id === project.projectGroupId)?.name },
              project.startDate && { label: "Start date", value: formatDate(project.startDate) },
              project.endDate && { label: "End date", value: formatDate(project.endDate) },
              project.completionDate && { label: "Completion date", value: formatDate(project.completionDate) },
            ].filter((x): x is { label: string; value: string | undefined } => !!x);
            const hasMoreDetails = detailItems.length > 0 || project.tags.length > 0;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Project Details</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {project.description && (
                    <SafeMarkdown text={project.description} className="text-sm text-muted-foreground [&_p]:m-0" />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Owner</span>
                    <span className="text-sm">{project.owner.fullName}</span>
                  </div>
                  {hasMoreDetails ? (
                    <>
                      {detailItems.length > 0 && (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                          {detailItems.map((item) => (
                            <div key={item.label} className="flex flex-col gap-0.5">
                              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{item.label}</span>
                              <span className="text-sm">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {project.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {project.tags.map((tag) => (
                            <Badge key={tag} variant="neutral">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No additional Project details have been added.</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {tab === "tasks" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks…"
                className="pl-8"
                aria-label="Search tasks"
              />
            </div>
            {/* Compact internal switcher — List stays the default everywhere, including here;
                Timeline is this Project's own Task Gantt (real startDate/dueDate only), never the
                global Tasks page's default. */}
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <Button
                size="sm"
                variant={taskView === "list" ? "secondary" : "ghost"}
                aria-pressed={taskView === "list"}
                onClick={() => setTaskView("list")}
              >
                List
              </Button>
              <Button
                size="sm"
                variant={taskView === "timeline" ? "secondary" : "ghost"}
                aria-pressed={taskView === "timeline"}
                onClick={() => setTaskView("timeline")}
              >
                Timeline
              </Button>
            </div>
          </div>

          {tasksLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading tasks…</p>
          ) : taskView === "timeline" ? (
            <TaskTimeline tasks={filteredTasks} onEdit={setEditingTask} onDeleted={refreshTasks} />
          ) : taskGroups.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">No tasks match this view.</Card>
          ) : (
            taskGroups.map((group) => (
              <TaskListSection
                key={group.key}
                group={group}
                groupBy="status"
                allTasks={tasks}
                runningTaskId={runningTaskId}
                isCollapsed={collapsedGroups.has(group.key)}
                onToggleCollapse={() => toggleGroup(group.key)}
                onAddTask={openCreateTask}
                context="project"
                projectIsInternal={project.isInternal}
                showAssignee={showAssignee}
                onEdit={setEditingTask}
                onDeleted={refreshTasks}
              />
            ))
          )}
        </div>
      )}

      {tab === "services" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end gap-2">
            {canAddService && company && (
              <Button size="sm" onClick={() => setAddServiceOpen(true)}>
                <Plus /> Add Service
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              {!workstreamsLoading && workstreams.length === 0 && (
                <p className="text-sm text-muted-foreground">No services yet for this project.</p>
              )}
              {workstreams.map((workstream, i) => {
                const openTaskCount = tasks.filter((t) => t.workstreamId === workstream.id && t.status !== "done").length;
                const staffing = globalServiceStaffing.find((s) => s.serviceLineId === workstream.serviceLine?.id);
                const nameFor = (userId: string) => assignableStaff.find((s) => s.id === userId)?.fullName ?? "Unknown";
                return (
                  <div key={workstream.id}>
                    {i > 0 && <Separator className="my-3" />}
                    <Link
                      href={`/dashboard/workstreams/${workstream.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md py-1 hover:underline"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                          {workstreamDisplayHeading(workstream.name, workstream.serviceLine?.name ?? null)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Project Service Lead: {workstream.lead.fullName} · {workstream.activities.length} activit
                          {workstream.activities.length === 1 ? "y" : "ies"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{openTaskCount} open</span>
                        <WorkstreamStatusBadge status={workstream.status} />
                        {canManageWorkstreams(user) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfigureActivitiesFor(workstream);
                            }}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            Configure Activities
                          </button>
                        )}
                      </div>
                    </Link>
                    {workstream.serviceLine && staffing && (staffing.teamLeadUserIds.length > 0 || staffing.employeeUserIds.length > 0) && (
                      <div className="mt-2 flex flex-col gap-0.5 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-mono text-[10px] tracking-wide uppercase">Global Service Staffing</span>
                        <span>
                          Global Team Leads:{" "}
                          {staffing.teamLeadUserIds.length > 0 ? staffing.teamLeadUserIds.map(nameFor).join(", ") : "None"}
                        </span>
                        <span>
                          Service Members:{" "}
                          {staffing.employeeUserIds.length > 0 ? staffing.employeeUserIds.map(nameFor).join(", ") : "None"}
                        </span>
                        <span className="italic">These assignments apply to this Service across all Projects.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "members" && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canManageProjects(user) && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <MultiSelect
                  options={assignableStaff.map((s) => ({ id: s.id, label: s.fullName, sublabel: s.email }))}
                  value={memberIds}
                  onChange={setMemberIds}
                  placeholder="No members"
                  searchPlaceholder="Search people…"
                  aria-label="Project members"
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={savingMembers} onClick={handleSaveMembers}>
                    {savingMembers ? "Saving…" : "Save members"}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {project.members.length === 0 && (
                <p className="text-sm text-muted-foreground">No members recorded for this project yet.</p>
              )}
              {project.members.map((member, i) => {
                const isEditingRole = editingRoleFor === member.id;
                return (
                  <div key={member.id}>
                    {i > 0 && <Separator className="my-2.5" />}
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar className="size-7 ring-2 ring-card">
                          <AvatarFallback className="text-xs">{initials(member.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="text-sm font-medium">
                            {member.fullName}
                            {member.id === project.ownerId && " (Owner)"}
                          </span>
                          <span className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
                          {!isEditingRole && member.projectRole && (
                            <span className="text-xs text-muted-foreground">Project Role: {member.projectRole}</span>
                          )}
                        </div>
                      </div>
                      {canManageProjects(user) && !isEditingRole && (
                        <button
                          type="button"
                          onClick={() => startEditingRole(member.id, member.projectRole)}
                          className="shrink-0 text-xs text-muted-foreground hover:underline"
                        >
                          {member.projectRole ? "Edit responsibility" : "+ Add responsibility"}
                        </button>
                      )}
                    </div>
                    {isEditingRole && (
                      <div className="mt-1.5 ml-9.5 flex items-center gap-1.5">
                        <Input
                          autoFocus
                          value={roleDraft}
                          onChange={(e) => setRoleDraft(e.target.value)}
                          placeholder="e.g. Payroll Reviewer (optional)"
                          className="h-7 max-w-64 text-xs"
                        />
                        <Button size="sm" variant="outline" disabled={savingRole} onClick={() => handleSaveRole(member.id)}>
                          {savingRole ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingRoleFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "comments" && (
        <div className="flex flex-col gap-4">
          <ProjectCommentsSection target={commentsTarget} />
          {/* Step 4 — Comments is now the one normal place for new Project discussion/context;
              legacy Notes stay visible for reference (never destructively deleted) but strictly
              read-only, so no new legacy Note can be authored from the normal V1 Project UI. */}
          <SharedNotesSection notes={notes} readOnly title="Legacy Notes" />
        </div>
      )}

      {tab === "documents" && <ProjectDocumentsSection projectId={project.id} />}

      {tab === "time" && <ProjectTimeTeam user={user} tasks={tasks} />}

      {tab === "issues" && (
        <ProjectIssuesSection
          projectId={project.id}
          issues={issues}
          workstreams={workstreams.map((w) => ({
            id: w.id,
            name: w.name,
            activities: w.activities.map((a) => ({ id: a.id, name: a.name })),
          }))}
          onChanged={refreshIssues}
        />
      )}

      {tab === "reports" && (
        <ClientReportsTable
          reports={projectReports}
          isLoading={false}
          emptyMessage="No Client Reports generated for this Project yet."
        />
      )}

      {company && (
        <AddProjectServiceDialog
          open={addServiceOpen}
          onOpenChange={setAddServiceOpen}
          company={company}
          projectId={project.id}
          ownerId={project.ownerId}
          existingServiceLineIds={serviceLineIds}
          onSaved={() => {
            refreshWorkstreams();
            refreshProject();
          }}
        />
      )}

      {configureActivitiesFor && (
        <AddServiceActivitiesDialog
          open={configureActivitiesFor !== null}
          onOpenChange={(next) => !next && setConfigureActivitiesFor(null)}
          workstream={configureActivitiesFor}
          onSaved={refreshWorkstreams}
        />
      )}

      {company && canManageProjects(user) && (
        <CompanyFormDialog
          open={editCompanyOpen}
          onOpenChange={setEditCompanyOpen}
          mode="edit"
          company={company}
          onSaved={refreshCompany}
        />
      )}

      {company && canManageProjects(user) && editContact !== null && (
        <ContactFormDialog
          open
          onOpenChange={(next) => !next && setEditContact(null)}
          companyId={company.id}
          contact={editContact === "new" ? undefined : editContact}
          onSaved={() => {
            setEditContact(null);
            refreshCompany();
          }}
        />
      )}

      {workstreams.length > 0 && (
        <TaskFormDialog
          open={createTaskOpen}
          onOpenChange={setCreateTaskOpen}
          mode="create"
          defaultWorkstreamId={workstreams[0].id}
          defaultStatus={createTaskDefaultStatus}
          onSaved={refreshTasks}
        />
      )}
      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={refreshTasks}
        />
      )}

      {canManageProjects(user) && (
        <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" project={project} onSaved={refreshProject} />
      )}
    </div>
  );
}
