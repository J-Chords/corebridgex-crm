"use client";

import { Suspense, use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProject, useProjects } from "@/lib/data/hooks/use-projects";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompany } from "@/lib/data/hooks/use-companies";
import { useCompanyNotes } from "@/lib/data/hooks/use-notes";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import { notesProvider } from "@/lib/data/providers";
import { DEFAULT_TASK_FILTERS, filterTasks, groupTasksBy } from "@/lib/data/hooks/use-task-filters";
import { isAssigneeColumnRedundantForViewer } from "@/lib/data/task-display";
import { operationalProjectIdentity } from "@/lib/data/project-display";
import { canCreateWorkstreamInProject, canManageProjects, isEmployee } from "@/lib/data/permissions";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import type { TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { STATUS_COLOR_VAR, STATUS_META } from "@/components/tasks/task-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { WorkstreamStatusBadge } from "@/components/workstreams/workstream-status-badge";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectRenewalDialog } from "@/components/projects/project-renewal-dialog";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { TaskTimeline } from "@/components/tasks/task-timeline";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { SharedNotesSection } from "@/components/notes/shared-notes-section";
import { ProjectCompletedWork } from "@/components/projects/project-completed-work";
import { ProjectTimeTeam } from "@/components/projects/project-time-team";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { ClientReportsTable } from "@/components/client-reports/client-reports-table";
import { useClientReports } from "@/lib/data/hooks/use-client-reports";
import { getInitials as initials } from "@/lib/initials";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

type TabKey = "overview" | "tasks" | "services" | "team" | "history";
type TaskView = "list" | "timeline";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "services", label: "Services" },
  { key: "team", label: "Team" },
  { key: "history", label: "History" },
];

type HistorySectionKey = "context" | "completed" | "reports" | "time" | "timeline";
const HISTORY_SECTIONS: { key: HistorySectionKey; label: string }[] = [
  { key: "context", label: "Context" },
  { key: "completed", label: "Completed Work" },
  { key: "reports", label: "Client Reports" },
  { key: "time", label: "Time & Team" },
  { key: "timeline", label: "Timeline" },
];

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];
const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  "in-progress": PlayCircle,
  blocked: Ban,
  "waiting-on-client": Clock,
  done: CheckCircle2,
};

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workstreams, isLoading: workstreamsLoading, refresh: refreshWorkstreams } = useWorkstreams({ projectId: project.id });
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks({ workstreamIds: workstreams.map((w) => w.id) });
  const { company } = useCompany(project.companyId);
  const { notes, refresh: refreshNotes } = useCompanyNotes(project.companyId);
  const { runningTimer } = useRunningTimer();
  const { projects: allProjects } = useProjects();
  // Phase 13C — Client Reports are org-wide-authorized (canViewClientReport), never re-derived here;
  // this only narrows an already-authorized set down to this Project's own reports.
  const { reports: allAuthorizedReports } = useClientReports();
  const projectReports = useMemo(
    () => allAuthorizedReports.filter((r) => r.projectId === project.id),
    [allAuthorizedReports, project.id]
  );

  // Deep-link seeding — e.g. the Projects Gantt (Part B) links to
  // `/dashboard/projects/[id]?tab=tasks&view=timeline` so clicking a Project's scheduled-work bar
  // opens straight to its Task Timeline. Lazy initializer, same convention `/dashboard/tasks`
  // already uses for its own `?status=`/`?assignee=` params — normal navigation (no query params)
  // leaves `tab`/`taskView` at their existing "overview"/"list" defaults.
  const [tab, setTab] = useState<TabKey>(() => {
    const tabParam = searchParams.get("tab");
    return tabParam === "overview" || tabParam === "tasks" || tabParam === "services" || tabParam === "team" || tabParam === "history"
      ? tabParam
      : "overview";
  });
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskView, setTaskView] = useState<TaskView>(() => {
    const viewParam = searchParams.get("view");
    return viewParam === "list" || viewParam === "timeline" ? viewParam : "list";
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskDefaultStatus, setCreateTaskDefaultStatus] = useState<TaskStatus | undefined>(undefined);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [historySection, setHistorySection] = useState<HistorySectionKey>("context");

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

  const relatedProjects = useMemo(
    () => allProjects.filter((p) => p.companyId === project.companyId && p.id !== project.id),
    [allProjects, project]
  );

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
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="flex items-center gap-2">
          {workstreams.length > 0 && (
            <Button size="sm" onClick={() => openCreateTask()} data-shortcut="new-task">
              <Plus /> New Task
            </Button>
          )}
          {canManageProjects(user) && (
            <>
              <Button size="sm" variant="outline" onClick={() => setRenewOpen(true)}>
                <RefreshCw /> Renew
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Phase 13B — five compact status summary blocks (Reference 1), always visible above the
          tabs regardless of which tab is open, so the Project's overall work state never requires
          switching tabs to see. Counts come straight from the already-fetched Project Tasks — no
          new query. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_ORDER.map((status) => {
          const Icon = STATUS_ICONS[status];
          const color = STATUS_COLOR_VAR[status];
          return (
            <Card key={status} className="flex-row items-center gap-2.5 p-3">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: `color-mix(in oklch, ${color} 16%, var(--card))`, color }}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs text-muted-foreground">{STATUS_META[status].label}</span>
                <span className="text-lg leading-tight font-semibold">{statusCounts[status]}</span>
              </div>
            </Card>
          );
        })}
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
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">Current Services</CardTitle>
              <button type="button" onClick={() => setTab("services")} className="text-sm text-muted-foreground hover:underline">
                View all
              </button>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {!workstreamsLoading && workstreams.length === 0 ? (
                <p className="text-sm text-muted-foreground">No services yet for this project.</p>
              ) : (
                workstreams.slice(0, 4).map((workstream, i) => (
                  <div key={workstream.id}>
                    {i > 0 && <Separator className="my-3" />}
                    <Link
                      href={`/dashboard/workstreams/${workstream.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md py-1 hover:underline"
                    >
                      <span className="text-sm font-medium">
                        {workstreamDisplayHeading(workstream.name, workstream.serviceLine?.name ?? null)}
                      </span>
                      <WorkstreamStatusBadge status={workstream.status} />
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
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
          <div className="flex items-center justify-end">
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
                          Lead: {workstream.lead.fullName} · {workstream.activities.length} activit
                          {workstream.activities.length === 1 ? "y" : "ies"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{openTaskCount} open</span>
                        <WorkstreamStatusBadge status={workstream.status} />
                      </div>
                    </Link>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "team" && (
        <Card>
          <CardContent className="flex flex-col gap-1">
            {project.members.length === 0 && (
              <p className="text-sm text-muted-foreground">No members recorded for this project yet.</p>
            )}
            {project.members.map((member, i) => (
              <div key={member.id}>
                {i > 0 && <Separator className="my-2.5" />}
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-7 ring-2 ring-card">
                    <AvatarFallback className="text-xs">{initials(member.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {member.fullName}
                      {member.id === project.ownerId && " (Owner)"}
                    </span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "history" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/20 p-1">
            {HISTORY_SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setHistorySection(s.key)}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                  (historySection === s.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
                }
              >
                {s.label}
              </button>
            ))}
          </div>

          {historySection === "context" && (
            <div className="flex flex-col gap-4">
              {project.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Description</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{project.description}</CardContent>
                </Card>
              )}

              <SharedNotesSection
                notes={notes}
                onAddNote={async (input) => {
                  await notesProvider.createCompanyNote(user, project.companyId, input);
                  refreshNotes();
                }}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Related Projects</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  {relatedProjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No other related Projects yet.</p>
                  ) : (
                    relatedProjects.map((p, i) => (
                      <div key={p.id}>
                        {i > 0 && <Separator className="my-3" />}
                        <Link
                          href={`/dashboard/projects/${p.id}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md py-1 hover:underline"
                        >
                          <div className="flex items-center gap-2.5">
                            <CompanyProjectAvatar companyId={p.companyId} companyName={p.companyName} size="sm" isInternal={p.isInternal} />
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">{p.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(p.contractStartDate)} – {formatDate(p.contractEndDate)}
                              </span>
                            </div>
                          </div>
                          <ProjectStatusBadge status={p.status} />
                        </Link>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {historySection === "completed" && <ProjectCompletedWork tasks={tasks} />}

          {historySection === "reports" && (
            <ClientReportsTable
              reports={projectReports}
              isLoading={false}
              emptyMessage="No Client Reports generated for this Project yet."
            />
          )}

          {historySection === "time" && <ProjectTimeTeam user={user} tasks={tasks} />}

          {historySection === "timeline" && (
            <ProjectTimeline tasks={tasks} notes={notes} reports={projectReports} workstreams={workstreams} />
          )}
        </div>
      )}

      {company && (
        <WorkstreamFormDialog
          open={addServiceOpen}
          onOpenChange={setAddServiceOpen}
          mode="create"
          company={company}
          projectId={project.id}
          onSaved={() => {
            refreshWorkstreams();
            refreshProject();
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
        <>
          <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" project={project} onSaved={refreshProject} />
          <ProjectRenewalDialog
            open={renewOpen}
            onOpenChange={setRenewOpen}
            project={project}
            onRenewed={(newProject) => router.push(`/dashboard/projects/${newProject.id}`)}
          />
        </>
      )}
    </div>
  );
}
