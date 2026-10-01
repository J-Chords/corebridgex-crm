"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  GanttChart,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProject, useProjectGroups } from "@/lib/data/hooks/use-projects";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompany, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useCompanyNotes } from "@/lib/data/hooks/use-notes";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import { projectsProvider, projectIssuesProvider } from "@/lib/data/providers";
import { DEFAULT_TASK_FILTERS, filterTasks, groupTasksBy } from "@/lib/data/hooks/use-task-filters";
import { isAssigneeColumnRedundantForViewer, isTaskClosed, isTaskOverdue } from "@/lib/data/task-display";
import {
  operationalProjectIdentity,
  isProjectActiveForNewWork,
  projectNotActiveMessage,
} from "@/lib/data/project-display";
import {
  canConfigureWorkstreamActivities,
  canManageProjects,
  canManageProjectRecord,
  canManageWorkstreams,
  isEmployee,
} from "@/lib/data/permissions";
import { AddServiceActivitiesDialog } from "@/components/workstreams/add-service-activities-dialog";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { SafeMarkdown } from "@/lib/markdown-lite";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import type { ClientContact, ProjectIssue, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { cn } from "@/lib/utils";
import { todayDateOnly, parseDateOnly, formatDateOnly, startOfWeekMonday, startOfMonth, addDays } from "@/lib/planner-dates";
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
import { ServiceAvatar } from "@/components/workstreams/service-avatar";
import { AddProjectServiceDialog } from "@/components/projects/add-project-service-dialog";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { WorkstreamLifecycleMenu } from "@/components/workstreams/workstream-lifecycle-menu";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectStatusControl, ProjectLifecycleMenu } from "@/components/projects/project-status-control";
import { ProjectCommentsSection } from "@/components/projects/project-comments-section";
import { ProjectIssuesSection } from "@/components/projects/project-issues-section";
import { ProjectDocumentsSection } from "@/components/projects/project-documents-section";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskTimeline } from "@/components/tasks/task-timeline";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { SharedNotesSection } from "@/components/notes/shared-notes-section";
import { ProjectTimeTeam } from "@/components/projects/project-time-team";
import { ClientReportsTable } from "@/components/client-reports/client-reports-table";
import { GenerateClientReportDialog } from "@/components/client-reports/generate-client-report-dialog";
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
// MVP Simplification Pass (boss feedback) — Documents+Reports merged into one "Reports" tab
// (generation workspace + already-generated report/document library, together); Issues+Comments
// merged into one "Comments" tab (canonical discussion + issue-style reporting/history, together).
type TabKey = "overview" | "services" | "tasks" | "members" | "comments" | "time" | "reports";
type TaskView = "list" | "board" | "timeline";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Templates" },
  { key: "tasks", label: "Tasks" },
  { key: "members", label: "Members" },
  { key: "comments", label: "Comments" },
  { key: "time", label: "Time" },
  { key: "reports", label: "Reports" },
];

/**
 * CD-207 Project Overview redesign — a single clickable KPI tile. Reused for every KPI except
 * Due (which needs its own period selector alongside the count — see `DueKpiTile`). A real
 * `<button>`, not a `<Card>` with a synthetic onClick, so it's keyboard-operable and gets a
 * visible focus ring for free.
 */
function KpiTile({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="text-2xl font-semibold leading-none">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

type DuePeriod = "today" | "week" | "month";
const DUE_PERIOD_OPTIONS: { key: DuePeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/**
 * The Due KPI tile — same look as `KpiTile`, but carries a compact Today/Week/Month period
 * selector as a SEPARATE sibling control next to the count button (not nested inside it), so the
 * period pills can never accidentally trigger tile navigation and need no stopPropagation.
 */
function DueKpiTile({
  value,
  period,
  onPeriodChange,
  onClick,
}: {
  value: number;
  period: DuePeriod;
  onPeriodChange: (period: DuePeriod) => void;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-lg border bg-card p-3">
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-start gap-1 rounded outline-none text-left focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="text-2xl font-semibold leading-none">{value}</span>
        <span className="text-xs text-muted-foreground">Due</span>
      </button>
      <div className="flex items-center gap-1 pt-1">
        {DUE_PERIOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={period === option.key}
            onClick={() => onPeriodChange(option.key)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              period === option.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * CD-162 post-manual-QA pass — one Project Services list row, extracted so the active list and the
 * "Archived Services" disclosure below it render identically (only the data differs). The 3-dot
 * `WorkstreamLifecycleMenu` (Edit/Archive/Remove, Admin-only, self-hides for anyone else) replaces
 * the previous "Configure Activities" text link's spot — Configure Activities stays as its own
 * inline action since it's a materially different, more frequent capability (Team Lead can reach it
 * too, unlike Edit/Archive/Remove). Product Owner refinement pass — compact card-list hybrid: each
 * row is its own bordered/tinted container (not one big enclosing Card) so Services read as
 * clearly separated, scannable units without becoming a bulky card grid.
 */
function ServiceRow({
  workstream,
  project,
  user,
  openTaskCount,
  onConfigureActivities,
  onEdit,
  onManageStaffing,
  onChanged,
}: {
  workstream: WorkstreamWithRelations;
  project: NonNullable<ReturnType<typeof useProject>["project"]>;
  user: import("@/lib/data/types").User;
  openTaskCount: number;
  onConfigureActivities: () => void;
  onEdit: () => void;
  onManageStaffing: () => void;
  onChanged: () => void;
}) {
  const activityCount = workstream.activities.length;
  const projectManageContext = {
    ownerId: project.ownerId,
    additionalTeamLeadUserIds: project.additionalTeamLeads.map((u) => u.id),
  };
  const canConfigure = isProjectActiveForNewWork(project.status) && canConfigureWorkstreamActivities(user, projectManageContext);
  // Phase 4 — a Team Lead (Primary or Additional) who isn't Admin has no access to the full
  // Admin-only Edit dialog (WorkstreamLifecycleMenu stays gated by canManageWorkstreams, unchanged)
  // but can still restaff a Service they manage through this narrower, staffing-only entry point.
  const canManageStaffingOnly =
    isProjectActiveForNewWork(project.status) &&
    !canManageWorkstreams(user) &&
    canManageProjectRecord(user, projectManageContext);

  const serviceName = workstreamDisplayHeading(workstream.name);

  return (
    <div className="group rounded-lg bg-card ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-within:bg-muted/40">
      <Link
        href={`/dashboard/workstreams/${workstream.id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ServiceAvatar
            serviceKey={workstream.serviceLineId ?? workstream.id}
            serviceName={serviceName}
            size="sm"
            className="shrink-0"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-foreground group-hover:underline">{serviceName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {workstream.lead.fullName} · {activityCount} activit{activityCount === 1 ? "y" : "ies"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{openTaskCount} Open</Badge>
            <WorkstreamStatusBadge status={workstream.status} />
          </div>
          <div className="flex items-center gap-1.5 sm:border-l sm:pl-4">
            {canConfigure && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onConfigureActivities();
                }}
              >
                <SlidersHorizontal /> View Activities
              </Button>
            )}
            {canManageStaffingOnly && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onManageStaffing();
                }}
              >
                Manage Staffing
              </Button>
            )}
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <WorkstreamLifecycleMenu workstream={workstream} onChanged={onChanged} onEdit={onEdit} />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

/**
 * CD-207 — the single Administrative Details card, same structure for every role (Admin/Team
 * Lead/Employee). Consolidates the former separately-gated "Project Details" (public) and
 * "Administrative Details" (Admin-only) cards into one, with zero field loss — every field below
 * was already unconditionally fetched for every role (`useCompany`/`useCompanyLookups` run
 * regardless of viewer), so only the *read-only render* gate widens to all roles; the edit
 * affordances (header Edit button, "+ Add contact", per-contact "Edit") stay `canManageProjects`
 * only, unchanged from before.
 */
function AdministrativeDetailsCard({
  project,
  projectGroups,
  company,
  clientContacts,
  canEdit,
  onEditCompany,
  onAddContact,
  onEditContact,
}: {
  project: ProjectWithRelations;
  projectGroups: { id: string; name: string }[];
  company: CompanyWithRelations | null;
  clientContacts: ClientContact[];
  canEdit: boolean;
  onEditCompany: () => void;
  onAddContact: () => void;
  onEditContact: (contact: ClientContact) => void;
}) {
  // Boss-Aligned Project Status Restoration — two intentionally distinct dates, never shown under
  // one label, and never lost just because the CURRENT status has since moved on. "Completed On"
  // (`completionDate`, stamped once, never overwritten by a later transition) is shown whenever
  // it's genuinely set, regardless of current status. "Archived On" / "Previously Archived On"
  // (`archivedAt`, always the latest Archive) work the same way, just re-labeled depending on
  // whether the Project is CURRENTLY Archived or has since moved elsewhere. "Client Since" (from
  // `contractStartDate`, never fabricated) reads as a client-relationship fact while the client is
  // genuinely still engaged (Active/On Hold).
  const detailItems = [
    project.projectGroupId && { label: "Project Group", value: projectGroups.find((g) => g.id === project.projectGroupId)?.name },
    project.startDate && { label: "Start date", value: formatDate(project.startDate) },
    project.endDate && { label: "End date", value: formatDate(project.endDate) },
    (project.status === "active" || project.status === "on-hold") &&
      project.contractStartDate && { label: "Client Since", value: formatDate(project.contractStartDate) },
    project.completionDate && { label: "Completed On", value: formatDate(project.completionDate) },
    project.status === "archived"
      ? project.archivedAt && { label: "Archived On", value: formatDate(project.archivedAt) }
      : project.archivedAt && { label: "Previously Archived On", value: formatDate(project.archivedAt) },
  ].filter((x): x is { label: string; value: string | undefined } => !!x);
  const hasMoreDetails = detailItems.length > 0 || project.tags.length > 0;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Administrative Details</CardTitle>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onEditCompany}>
            <Pencil /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {project.description && (
          <SafeMarkdown text={project.description} className="text-sm text-muted-foreground [&_p]:m-0" />
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Owner</span>
            <span className="text-sm">{project.owner.fullName}</span>
          </div>
          {detailItems.map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{item.label}</span>
              <span className="text-sm">{item.value}</span>
            </div>
          ))}
        </div>
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="neutral">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {!hasMoreDetails && !project.description && (
          <p className="text-sm text-muted-foreground">No additional Project details have been added.</p>
        )}

        {company && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Account Status</span>
                <CompanyStatusBadge status={company.status} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Partner Brand</span>
                {/* Phase 3 (CD-208) — Project-specific, independent of the Company's own Brand. */}
                <span className="text-sm">{project.partnerBrand?.name ?? "No brand set"}</span>
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
                {canEdit && (
                  <button type="button" onClick={onAddContact} className="text-xs text-muted-foreground hover:underline">
                    + Add contact
                  </button>
                )}
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
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onEditContact(contact)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Created by</span>
          <span className="text-sm">{project.createdBy.fullName}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Phase 13B (redesigned, Reference 1's visual language) — the Project workspace is the primary
 * Employee/Supervisor operational entry point for Client work, deliberately NOT duplicated by a
 * separate Client route (rejected — see docs/phase-13-client-history-audit.md Section 21).
 * CD-207 — Administrative Details (Contacts + Company metadata, read-only) is visible to every
 * role on this page; only its edit controls (header Edit, "+ Add contact", per-contact Edit) stay
 * `canManageProjects`-gated. Company edit/admin routes remain Superadmin-only for actual mutation.
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
  const router = useRouter();
  const pathname = usePathname();
  const { workstreams, isLoading: workstreamsLoading, refresh: refreshWorkstreams } = useWorkstreams({ projectId: project.id });
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks({ workstreamIds: workstreams.map((w) => w.id) });
  const { company, contacts: clientContacts, refresh: refreshCompany } = useCompany(project.companyId);
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [editContact, setEditContact] = useState<ClientContact | "new" | null>(null);
  const { notes } = useCompanyNotes(project.companyId);
  const { runningTimer } = useRunningTimer();
  const { assignableStaff } = useCompanyLookups();
  const { groups: projectGroups } = useProjectGroups();
  // CD-162 post-manual-QA pass — Archived (status "cancelled") Project Services stay fully
  // accessible (their own Tasks/Time/Comments history is never hidden — see `useTasks` above, which
  // deliberately keeps reading from the unfiltered `workstreams`), but no longer clutter the normal
  // active Services list, KPI counts, or the "Add Service" duplicate-prevention check. A Service
  // whose earlier instance was archived is not "still active," so its Service Line becomes free to
  // add again — this is a duplicate-*active*-service rule, not a duplicate-ever rule.
  const activeWorkstreams = useMemo(() => workstreams.filter((w) => w.status !== "cancelled"), [workstreams]);
  const archivedWorkstreams = useMemo(() => workstreams.filter((w) => w.status === "cancelled"), [workstreams]);
  const activeServiceLineIds = useMemo(
    () => Array.from(new Set(activeWorkstreams.map((w) => w.serviceLine?.id).filter((id): id is string => !!id))),
    [activeWorkstreams]
  );
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
  // Final V1 Regression correction — the lazy initializer above only ever runs once, so it can't
  // react to the URL changing later (browser Back/Forward, or a fresh link pasted into the same tab
  // without a remount). This keeps `tab` honest against `?tab=` any time the URL changes out from
  // under this component, not just on first load.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const next = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overview";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab((current) => (current === next ? current : next));
  }, [searchParams]);
  // The one handler every tab button calls — updates the visible tab immediately AND pushes a real
  // history entry (not `replace`) so browser Back/Forward restores the tab that was actually on
  // screen, and the URL always matches what's visible (refresh/shared-link fidelity).
  function handleTabChange(key: TabKey) {
    setTab(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [generateReportOpen, setGenerateReportOpen] = useState(false);
  // Project Final Integration Correction — "Configure Activities" on an already-attached Service
  // reuses the existing `AddServiceActivitiesDialog` (previously only reachable from the Task form's
  // now-removed inline flow) — offers only this Service's remaining, not-yet-enabled catalog
  // Activities, never requires re-adding the Service itself.
  const [configureActivitiesFor, setConfigureActivitiesFor] = useState<WorkstreamWithRelations | null>(null);
  const [editingWorkstream, setEditingWorkstream] = useState<WorkstreamWithRelations | null>(null);
  // Phase 4 — the narrow "staffing only" entry point for an authorized Project Team Lead who isn't
  // Admin (Admin keeps using editingWorkstream's full edit dialog above).
  const [staffingWorkstream, setStaffingWorkstream] = useState<WorkstreamWithRelations | null>(null);
  const [showArchivedServices, setShowArchivedServices] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskView, setTaskView] = useState<TaskView>(() => {
    const viewParam = searchParams.get("view");
    return viewParam === "list" || viewParam === "board" || viewParam === "timeline" ? viewParam : "list";
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskDefaultStatus, setCreateTaskDefaultStatus] = useState<TaskStatus | undefined>(undefined);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>(() => project.members.map((m) => m.id));
  const [savingMembers, setSavingMembers] = useState(false);
  // Phase 4 — Additional Team Leads. Mirrors the Members bulk-MultiSelect-plus-Save pattern above
  // (reuses the existing UI shape rather than inventing a new one), but gated by
  // canManageProjectRecord (Admin OR an authorized Project Team Lead), not Admin-only, and diffed
  // against the new incremental add/remove RPCs rather than a bulk replace (Additional TLs are a
  // dedicated relation, never folded into memberUserIds).
  const [additionalTeamLeadIds, setAdditionalTeamLeadIds] = useState<string[]>(() =>
    project.additionalTeamLeads.map((u) => u.id)
  );
  const [savingTeamLeads, setSavingTeamLeads] = useState(false);
  // Phase 4 — incremental, TL-usable single Member add (separate from the Admin-only bulk
  // MultiSelect+Save above, which stays untouched). `addMemberCandidate` is the pending pick.
  const [addMemberCandidate, setAddMemberCandidate] = useState<string[]>([]);
  const [savingAddMember, setSavingAddMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  // Phase 4 QA fix — the Additional Team Lead / Project Member pickers need every active
  // Employee/Supervisor, unscoped by reporting line (the locked "no direct-report restriction"
  // requirement) — deliberately NOT `assignableStaff` (team-scoped for its own existing uses:
  // Company staff assignment, Workstream Lead/Team, which stay correctly restricted).
  const [staffingCandidates, setStaffingCandidates] = useState<import("@/lib/data/types").User[]>([]);
  useEffect(() => {
    let cancelled = false;
    projectsProvider.listProjectStaffingCandidates(user).then((result) => {
      if (!cancelled) setStaffingCandidates(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);
  // Project Final Pre-Acceptance Correction — Project Role/Responsibility editing. Reuses the
  // already-hosted `project_role` column + `set_project_member_role` RPC (Admin-only server-side)
  // via the existing `projectsProvider.setProjectMemberRole` method — no new migration/provider.
  const [editingRoleFor, setEditingRoleFor] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  // Boss-Aligned Project Status Restoration — a non-Active client workspace (On Hold/Completed/
  // Canceled/Archived) never receives new operational work until it's returned to Active.
  // Centralized here so every entry point that creates a Task (the header button below, and each
  // status group's own "+" in the Tasks tab) is guarded the same way, with a clear explanation
  // rather than a silently-missing/disabled control.
  function openCreateTask(defaultStatus?: TaskStatus) {
    if (!isProjectActiveForNewWork(project.status)) {
      toastManager.add({ description: projectNotActiveMessage(project.status) });
      return;
    }
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
  // Boss Feedback Alignment, Section 3 — `tasks` is already the viewer's own correctly-scoped set
  // (Superadmin: every Task on this Project; Supervisor: only their managed team's; Employee: only
  // what canAccessTask already allows them). openCount used to read the raw, UNSCOPED
  // `project.tasks.openCount` (a real data-visibility bug for Team Lead — it silently showed
  // org-wide counts, not their own scope) — now derived from this same already-fetched,
  // already-scoped array instead, closing that gap while keeping Admin's number identical (Admin's
  // scope already covers every Task on the Project either way).
  const openCount = tasks.filter((t) => !isTaskClosed(t.status)).length;

  const myTasks = useMemo(
    () => tasks.filter((t) => !isTaskClosed(t.status) && t.assignees.some((a) => a.id === user.id)),
    [tasks, user.id]
  );

  // CD-207 — Attention KPI: unique (deduplicated) Tasks that are overdue OR Waiting. A single
  // filter pass over one array guarantees a Task that's both overdue and Waiting is counted once,
  // never twice. Phase 5 (CD-214) locked this as the canonical Attention definition app-wide — see
  // `needs-attention-strip.tsx`'s matching rule.
  const attentionScope = isEmployee(user) ? myTasks : tasks;
  const attentionCount = attentionScope.filter((t) => isTaskOverdue(t) || t.status === "waiting").length;

  // CD-207 — Due KPI: incomplete, non-overdue Tasks due within the selected period. Reuses the
  // same local-calendar-date semantics as My Day's own Week/Month views (`planner-dates.ts`) —
  // never a new date-comparison scheme, and never `isTaskOverdue`'s own internal UTC-slice
  // "today" (out of this phase's scope — see CD-193).
  const [duePeriod, setDuePeriod] = useState<DuePeriod>("today");
  const dueCount = useMemo(() => {
    const scoped = isEmployee(user) ? myTasks : tasks;
    const todayDate = parseDateOnly(todayDateOnly());
    let startKey = formatDateOnly(todayDate);
    let endKey = startKey;
    if (duePeriod === "week") {
      const weekStart = startOfWeekMonday(todayDate);
      startKey = formatDateOnly(weekStart);
      endKey = formatDateOnly(addDays(weekStart, 6));
    } else if (duePeriod === "month") {
      const monthStart = startOfMonth(todayDate);
      startKey = formatDateOnly(monthStart);
      endKey = formatDateOnly(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
    }
    return scoped.filter(
      (t) => !isTaskClosed(t.status) && t.dueDate != null && !isTaskOverdue(t) && t.dueDate >= startKey && t.dueDate <= endKey
    ).length;
  }, [tasks, myTasks, user, duePeriod]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberIds(project.members.map((m) => m.id));
  }, [project.members]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdditionalTeamLeadIds(project.additionalTeamLeads.map((u) => u.id));
  }, [project.additionalTeamLeads]);

  // Phase 4 — diffs the MultiSelect's new selection against the currently-known Additional TLs and
  // calls the narrow add/remove RPCs for exactly what changed (never a bulk replace — this is a
  // dedicated relation, not memberUserIds).
  async function handleSaveTeamLeads() {
    const before = new Set(project.additionalTeamLeads.map((u) => u.id));
    const after = new Set(additionalTeamLeadIds);
    const toAdd = additionalTeamLeadIds.filter((id) => !before.has(id));
    const toRemove = [...before].filter((id) => !after.has(id));
    setSavingTeamLeads(true);
    try {
      for (const userId of toAdd) {
        await projectsProvider.addProjectTeamLead(user, project.id, userId);
      }
      for (const userId of toRemove) {
        await projectsProvider.removeProjectTeamLead(user, project.id, userId);
      }
      refreshProject();
      toastManager.add({ description: "Team Leads updated" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update Team Leads." });
    } finally {
      setSavingTeamLeads(false);
    }
  }

  // Phase 4 — the narrow, TL-usable single Member add (Admin's own bulk MultiSelect+Save below is
  // separate and untouched).
  async function handleAddMember() {
    const userId = addMemberCandidate[0];
    if (!userId) return;
    setSavingAddMember(true);
    try {
      await projectsProvider.addProjectMember(user, project.id, userId);
      setAddMemberCandidate([]);
      refreshProject();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't add member." });
    } finally {
      setSavingAddMember(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingMemberId(userId);
    try {
      await projectsProvider.removeProjectMember(user, project.id, userId);
      refreshProject();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't remove member." });
    } finally {
      setRemovingMemberId(null);
    }
  }

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
        partnerBrandId: project.partnerBrandId,
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

  // Phase 3/4 (CD-208) section 32/39 — Admin always; a Team Lead only when they are literally this
  // Project's owner OR one of its Additional Team Leads (canManageProjectRecord already covers
  // every branch). `projectForManage` adapts the full ProjectWithRelations' resolved
  // `additionalTeamLeads: User[]` into the thin `additionalTeamLeadUserIds: string[]` shape every
  // permission helper expects, mirroring `memberUserIds`'s own convention.
  const projectForManage = { ...project, additionalTeamLeadUserIds: project.additionalTeamLeads.map((u) => u.id) };
  const canAddService = canManageProjectRecord(user, projectForManage);
  const canManageStaffing = canManageProjectRecord(user, projectForManage) && isProjectActiveForNewWork(project.status);

  // Phase 4 QA fix — candidate pools sourced from `staffingCandidates` (every active
  // Employee/Supervisor, unscoped by reporting line — see its own fetch above), never
  // `assignableStaff` (team-scoped, correctly so for Company staff assignment/Workstream Lead-Team,
  // which stay unaffected and still use `assignableStaff` directly elsewhere in this file).
  const teamLeadCandidates = staffingCandidates.filter(
    (s) => s.active && s.role === "supervisor" && s.id !== project.ownerId
  );
  const memberCandidates = staffingCandidates.filter(
    (s) => s.active && (s.role === "employee" || s.role === "supervisor") && !memberIds.includes(s.id)
  );

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/projects" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to projects
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* MVP Gap Closure (boss feedback) — the Company/Project heading read as visually weaker
              than Task Detail's own; the two H1s were already the identical text-2xl/font-semibold,
              the actual cause was this avatar rendering at the "default" (32px) size while Task
              Detail and Service Detail both use "sm" (24px) next to their own H1 — a bigger icon
              directly beside an equal-sized heading makes the heading read as the smaller element
              by comparison. Matching the same "sm" size used everywhere else restores the heading
              as the clearly dominant element, with no font-size change needed anywhere. */}
          <CompanyProjectAvatar
            companyId={project.companyId}
            companyName={project.companyName}
            size="sm"
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
          {!isProjectActiveForNewWork(project.status) ? (
            <span className="text-xs text-muted-foreground">{projectNotActiveMessage(project.status)}</span>
          ) : (
            activeWorkstreams.length > 0 && (
              <Button size="sm" onClick={() => openCreateTask()} data-shortcut="new-task">
                <Plus /> New Task
              </Button>
            )
          )}
          {canManageProjectRecord(user, projectForManage) && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          )}
          <ProjectLifecycleMenu project={project} onChanged={refreshProject} />
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key)}
            className={
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors " +
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
          {/* CD-207 — ONE shared 5-tile KPI row for every role (Admin/Team Lead/Employee), never a
              role-branched shell. Open Tasks/Attention/Due narrow to "my own work" (`myTasks`) only
              for Employees — already the correctly-scoped, most personally-relevant figure for that
              role. Every tile navigates via `handleTabChange` (never raw `setTab`), so the visible
              tab and the URL can never drift apart. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <KpiTile label="Templates" value={activeWorkstreams.length} onClick={() => handleTabChange("services")} />
            <KpiTile
              label="Open Tasks"
              value={isEmployee(user) ? myTasks.length : openCount}
              onClick={() => handleTabChange("tasks")}
            />
            <KpiTile label="Attention" value={attentionCount} onClick={() => handleTabChange("tasks")} />
            <DueKpiTile value={dueCount} period={duePeriod} onPeriodChange={setDuePeriod} onClick={() => handleTabChange("tasks")} />
            <KpiTile label="Members" value={project.members.length} onClick={() => handleTabChange("members")} />
          </div>

          {/* CD-207 — the single Administrative Details card, same structure for every role. Only
              its edit affordances (header Edit, "+ Add contact", per-contact Edit) stay
              `canManageProjects`-gated; the read-only data underneath is visible to everyone. */}
          <AdministrativeDetailsCard
            project={project}
            projectGroups={projectGroups}
            company={company}
            clientContacts={clientContacts}
            canEdit={canManageProjectRecord(user, projectForManage)}
            onEditCompany={() => setEditCompanyOpen(true)}
            onAddContact={() => setEditContact("new")}
            onEditContact={(contact) => setEditContact(contact)}
          />
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
            {/* Task Level Phase 2, Section 17 — aligned to the shared Task viewing model
                (List/Board/Timeline), same as the global Tasks page. List stays the default
                everywhere; Timeline is this Project's own Task Gantt (real startDate/dueDate only). */}
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <Button
                size="sm"
                variant={taskView === "list" ? "secondary" : "ghost"}
                aria-pressed={taskView === "list"}
                onClick={() => setTaskView("list")}
              >
                <ListIcon /> List
              </Button>
              <Button
                size="sm"
                variant={taskView === "board" ? "secondary" : "ghost"}
                aria-pressed={taskView === "board"}
                onClick={() => setTaskView("board")}
              >
                <LayoutGrid /> Board
              </Button>
              <Button
                size="sm"
                variant={taskView === "timeline" ? "secondary" : "ghost"}
                aria-pressed={taskView === "timeline"}
                onClick={() => setTaskView("timeline")}
              >
                <GanttChart /> Timeline
              </Button>
            </div>
          </div>

          {tasksLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading tasks…</p>
          ) : taskView === "board" ? (
            <TaskBoard user={user} tasks={filteredTasks} onChanged={refreshTasks} runningTaskId={runningTaskId} />
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
            {!isProjectActiveForNewWork(project.status) ? (
              <span className="text-xs text-muted-foreground">{projectNotActiveMessage(project.status)}</span>
            ) : (
              canAddService &&
              company && (
                <Button size="sm" onClick={() => setAddServiceOpen(true)}>
                  <Plus /> Add Template
                </Button>
              )
            )}
          </div>
          {!workstreamsLoading && activeWorkstreams.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No templates yet for this project.
            </div>
          )}
          <div className="flex flex-col gap-2">
            {activeWorkstreams.map((workstream) => (
              <ServiceRow
                key={workstream.id}
                workstream={workstream}
                project={project}
                user={user}
                openTaskCount={tasks.filter((t) => t.workstreamId === workstream.id && !isTaskClosed(t.status)).length}
                onConfigureActivities={() => setConfigureActivitiesFor(workstream)}
                onEdit={() => setEditingWorkstream(workstream)}
                onManageStaffing={() => setStaffingWorkstream(workstream)}
                onChanged={refreshWorkstreams}
              />
            ))}
          </div>

          {/* CD-162 post-manual-QA pass — Archived (status "cancelled") Templates stay fully
              reachable (Reactivate lives in the same lifecycle menu) but default-collapsed, so a
              Project with archived history doesn't clutter the normal active Templates view. */}
          {archivedWorkstreams.length > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowArchivedServices((v) => !v)}
                className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={"size-4 transition-transform duration-200" + (showArchivedServices ? "" : " -rotate-90")}
                  aria-hidden="true"
                />
                Archived Templates ({archivedWorkstreams.length})
              </button>
              {showArchivedServices && (
                <div className="flex flex-col gap-2 opacity-75">
                  {archivedWorkstreams.map((workstream) => (
                    <ServiceRow
                      key={workstream.id}
                      workstream={workstream}
                      project={project}
                      user={user}
                      openTaskCount={tasks.filter((t) => t.workstreamId === workstream.id && !isTaskClosed(t.status)).length}
                      onConfigureActivities={() => setConfigureActivitiesFor(workstream)}
                      onEdit={() => setEditingWorkstream(workstream)}
                      onManageStaffing={() => setStaffingWorkstream(workstream)}
                      onChanged={refreshWorkstreams}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <>
        {/* Phase 4 — Project Leadership: Primary Team Lead (projects.owner_id, Admin-only to
            change — see the header Edit button / Administrative Details) plus Additional Team
            Leads (project_team_leads), each with the exact same normal Project-management
            authority as the Primary TL. Visible to everyone with read access; the MultiSelect/Save
            controls only render for an authorized manager (Admin or Primary/Additional TL) on an
            Active Project. */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-base">Project Leadership</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <Avatar className="size-7 ring-2 ring-card">
                <AvatarFallback className="text-xs">{initials(project.owner.fullName)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{project.owner.fullName} (Primary Team Lead)</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[project.owner.role]}</span>
              </div>
            </div>
            {canManageStaffing && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                  Additional Team Leads
                </span>
                <MultiSelect
                  options={teamLeadCandidates.map((s) => ({ id: s.id, label: s.fullName, sublabel: s.email }))}
                  value={additionalTeamLeadIds}
                  onChange={setAdditionalTeamLeadIds}
                  placeholder="No Additional Team Leads"
                  searchPlaceholder="Search Team Leads…"
                  aria-label="Additional Team Leads"
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={savingTeamLeads} onClick={handleSaveTeamLeads}>
                    {savingTeamLeads ? "Saving…" : "Save Team Leads"}
                  </Button>
                </div>
              </div>
            )}
            {!canManageStaffing && (
              <div className="flex flex-col gap-1">
                {project.additionalTeamLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Additional Team Leads.</p>
                ) : (
                  project.additionalTeamLeads.map((tl) => (
                    <div key={tl.id} className="flex items-center gap-2.5">
                      <Avatar className="size-7 ring-2 ring-card">
                        <AvatarFallback className="text-xs">{initials(tl.fullName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{tl.fullName}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
            {/* Phase 4 — the narrow, TL-usable single-add control (Admin's own bulk MultiSelect
                above stays untouched and Admin-only). */}
            {canManageStaffing && !canManageProjects(user) && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <MultiSelect
                  options={memberCandidates.map((s) => ({ id: s.id, label: s.fullName, sublabel: s.email }))}
                  value={addMemberCandidate}
                  onChange={(ids) => setAddMemberCandidate(ids.slice(-1))}
                  placeholder="Add a member…"
                  searchPlaceholder="Search people…"
                  aria-label="Add a Project member"
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={savingAddMember || addMemberCandidate.length === 0} onClick={handleAddMember}>
                    {savingAddMember ? "Adding…" : "Add member"}
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
                      <div className="flex shrink-0 items-center gap-2.5">
                        {canManageProjects(user) && !isEditingRole && (
                          <button
                            type="button"
                            onClick={() => startEditingRole(member.id, member.projectRole)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            {member.projectRole ? "Edit responsibility" : "+ Add responsibility"}
                          </button>
                        )}
                        {canManageStaffing && (
                          <button
                            type="button"
                            disabled={removingMemberId === member.id}
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                          >
                            {removingMemberId === member.id ? "Removing…" : "Remove"}
                          </button>
                        )}
                      </div>
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
        </>
      )}

      {tab === "comments" && (
        // MVP Gap Closure (boss feedback) — Comments is the ONE active Project communication
        // concept now; Issues is no longer a second active product alongside it. Canonical
        // Comments first, then Historical Issues (read-only, renders nothing if a Project has no
        // Issue records) and legacy read-only Notes, both purely for historical reference.
        <div className="flex flex-col gap-4">
          <ProjectCommentsSection target={commentsTarget} />
          <ProjectIssuesSection issues={issues} workstreams={workstreams.map((w) => ({ id: w.id, name: w.name }))} />
          {/* Step 4 — Comments is now the one normal place for new Project discussion/context;
              legacy Notes stay visible for reference (never destructively deleted) but strictly
              read-only, so no new legacy Note can be authored from the normal V1 Project UI. */}
          <SharedNotesSection notes={notes} readOnly title="Legacy Notes" />
        </div>
      )}

      {tab === "time" && <ProjectTimeTeam user={user} tasks={tasks} />}

      {tab === "reports" && (
        // MVP Simplification Pass (boss feedback) — Reports is now the single place for both
        // generating a new report and reaching everything already produced for this Project.
        // Generation stays pre-scoped to this Project/Client via `defaultProjectId` so the user
        // never re-picks what they're already looking at; generation authorization is exactly the
        // same, unwidened, unnarrowed `clientReportProvider.generateReport` path the global Reports
        // page already uses. Uploaded files stay fully intact, just secondary to the report library.
        <div className="flex flex-col gap-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Generate a Client Report</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-md text-sm text-muted-foreground">
                Covers {project.companyName}&apos;s tracked work and confirmed Daily Updates for this Project over
                whichever period you choose.
              </p>
              <Button size="lg" onClick={() => setGenerateReportOpen(true)}>
                <Plus /> Generate Report
              </Button>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
              Reports generated for this Project
            </span>
            <ClientReportsTable
              reports={projectReports}
              isLoading={false}
              emptyMessage="No Client Reports generated for this Project yet — use the button above."
            />
          </div>
          <ProjectDocumentsSection projectId={project.id} />
        </div>
      )}

      {company && (
        <AddProjectServiceDialog
          open={addServiceOpen}
          onOpenChange={setAddServiceOpen}
          company={company}
          projectId={project.id}
          existingServiceLineIds={activeServiceLineIds}
          onSaved={() => {
            refreshWorkstreams();
            refreshProject();
          }}
        />
      )}

      {company && editingWorkstream && (
        <WorkstreamFormDialog
          open={Boolean(editingWorkstream)}
          onOpenChange={(open) => !open && setEditingWorkstream(null)}
          mode="edit"
          company={company}
          projectId={project.id}
          workstream={editingWorkstream}
          onSaved={refreshWorkstreams}
        />
      )}

      {/* Phase 4 — the narrow staffing-only dialog for an authorized Project Team Lead who isn't
          Admin (see ServiceRow's canManageStaffingOnly / "Manage Staffing" button above). */}
      {company && staffingWorkstream && (
        <WorkstreamFormDialog
          open={Boolean(staffingWorkstream)}
          onOpenChange={(open) => !open && setStaffingWorkstream(null)}
          mode="edit"
          staffingOnly
          company={company}
          projectId={project.id}
          workstream={staffingWorkstream}
          onSaved={refreshWorkstreams}
        />
      )}

      <GenerateClientReportDialog
        open={generateReportOpen}
        onOpenChange={setGenerateReportOpen}
        defaultProjectId={project.id}
      />

      {configureActivitiesFor && (
        <AddServiceActivitiesDialog
          open={configureActivitiesFor !== null}
          onOpenChange={(next) => !next && setConfigureActivitiesFor(null)}
          workstream={configureActivitiesFor}
          onSaved={refreshWorkstreams}
        />
      )}

      {company && canManageProjectRecord(user, projectForManage) && (
        <CompanyFormDialog
          open={editCompanyOpen}
          onOpenChange={setEditCompanyOpen}
          mode="edit"
          company={company}
          onSaved={refreshCompany}
        />
      )}

      {company && canManageProjectRecord(user, projectForManage) && editContact !== null && (
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

      {activeWorkstreams.length > 0 && (
        <TaskFormDialog
          open={createTaskOpen}
          onOpenChange={setCreateTaskOpen}
          mode="create"
          // Section 22 — only ever preselect when there's exactly one Service to pick from; with
          // more than one, the field starts empty so the user must actively choose (never a silent
          // workstreams[0] default that could put a Task under the wrong Service). CD-162 —
          // an archived Service is never a valid target for a new Task, so only `activeWorkstreams`
          // count here.
          defaultWorkstreamId={activeWorkstreams.length === 1 ? activeWorkstreams[0].id : undefined}
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

      {canManageProjectRecord(user, projectForManage) && (
        <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" project={project} onSaved={refreshProject} />
      )}
    </div>
  );
}
