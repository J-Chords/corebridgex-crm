"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkstream } from "@/lib/data/hooks/use-workstreams";
import { useCompany, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProject } from "@/lib/data/hooks/use-projects";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreamActivities } from "@/lib/data/hooks/use-workstream-activities";
import { useServiceLineStaffing } from "@/lib/data/hooks/use-service-membership";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import { canManageWorkstreams } from "@/lib/data/permissions";
import { workstreamDisplayHeading, splitWorkstreamQualifier } from "@/lib/data/workstream-name";
import { formatRecurrenceDate } from "@/lib/data/recurrence";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import type { User } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { WorkstreamStatusBadge } from "@/components/workstreams/workstream-status-badge";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { BudgetBar } from "@/components/ui/budget-bar";
import { RecurrenceIndicator } from "@/components/workstreams/recurrence-indicator";
import { GenerateOccurrenceDialog } from "@/components/workstreams/generate-occurrence-dialog";
import { QuickAddFromActivityDialog } from "@/components/workstreams/quick-add-from-activity-dialog";
import { WorkstreamActivityTasks } from "@/components/workstreams/workstream-activity-tasks";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { STATUS_COLOR_VAR } from "@/components/tasks/task-status-badge";

import { getInitials as initials } from "@/lib/initials";

const STATUS_STRIP = [
  { key: "open" as const, label: "Open", icon: Circle, color: STATUS_COLOR_VAR.todo },
  { key: "inProgress" as const, label: "In Progress", icon: PlayCircle, color: STATUS_COLOR_VAR["in-progress"] },
  { key: "blockedWaiting" as const, label: "Blocked / Waiting", icon: AlertTriangle, color: STATUS_COLOR_VAR.blocked },
  { key: "done" as const, label: "Done", icon: CheckCircle2, color: STATUS_COLOR_VAR.done },
];

type TabKey = "overview" | "activities" | "team" | "schedule";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activities", label: "Activities" },
  { key: "team", label: "Team" },
  { key: "schedule", label: "Schedule" },
];

/** `useSearchParams` requires a Suspense boundary above it — same split already established on
 * the Project detail page for its own `?tab=` deep-link seeding. */
function WorkstreamDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { workstream, isLoading, notFound, refresh } = useWorkstream(id);

  if (!user) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (notFound || !workstream) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/projects" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to projects
        </Link>
        <p className="text-sm text-muted-foreground">
          This service doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  return <LoadedWorkstreamDetailPage user={user} workstream={workstream} refresh={refresh} />;
}

function LoadedWorkstreamDetailPage({
  user,
  workstream,
  refresh,
}: {
  user: User;
  workstream: WorkstreamWithRelations;
  refresh: () => void;
}) {
  const searchParams = useSearchParams();
  const { company } = useCompany(workstream.companyId);
  const { project } = useProject(workstream.projectId ?? "");
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks({ workstreamId: workstream.id });
  const { departments: activityDepartments, isLoading: activitiesLoading } = useWorkstreamActivities(workstream);
  const { staffing: serviceStaffing } = useServiceLineStaffing(workstream.serviceLineId ? [workstream.serviceLineId] : []);
  const globalStaffing = serviceStaffing[0];
  const { assignableStaff } = useCompanyLookups();
  const nameFor = (userId: string) => assignableStaff.find((s) => s.id === userId)?.fullName ?? "Unknown";
  const { runningTimer } = useRunningTimer();
  const runningTaskId = runningTimer?.taskId ?? null;

  const [tab, setTab] = useState<TabKey>(() => {
    const tabParam = searchParams.get("tab");
    return TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overview";
  });
  const [editOpen, setEditOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [taskDialogActivityId, setTaskDialogActivityId] = useState<string | undefined>(undefined);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  function openAddTask(activityId?: string) {
    setTaskDialogActivityId(activityId);
    setTaskDialogOpen(true);
  }

  // Project Final Closure — Project is the one visible client/company workspace for every role,
  // including Admin; a Service's own "back" always returns to its Project (Services tab), never to
  // the technical Companies admin surface, regardless of viewer role.
  const backHref = `/dashboard/projects/${workstream.projectId ?? ""}?tab=services`;
  const canManage = canManageWorkstreams(user);
  const hasConfiguredActivities = activityDepartments.flatMap((d) => d.activities).length > 0;
  const statusCounts = {
    open: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    blockedWaiting: tasks.filter((t) => t.status === "blocked" || t.status === "waiting-on-client").length,
    done: tasks.filter((t) => t.status === "done").length,
  };
  const qualifier = splitWorkstreamQualifier(workstream.name, workstream.serviceLine?.name ?? null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link href={backHref} className="w-fit text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to {workstream.company.name}
        </Link>

        {/* Project → Service hierarchy shown explicitly, labeled — Service Manual Acceptance
            correction (Section 3): the Service's own global-catalog name ("Accounting") is the
            primary identity here, never the Project-Service instance's own qualifier
            ("Accounting 2026"), which stays secondary metadata below. */}
        {workstream.projectId && (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Project</span>
            <Link
              href={`/dashboard/projects/${workstream.projectId}`}
              className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              <CompanyProjectAvatar
                companyId={workstream.company.id}
                companyName={workstream.company.name}
                size="sm"
                isInternal={project?.isInternal}
              />
              {workstream.company.name}
            </Link>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Service</span>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold">
                {workstreamDisplayHeading(workstream.name, workstream.serviceLine?.name ?? null)}
              </h1>
              <WorkstreamStatusBadge status={workstream.status} />
            </div>
          </div>
          {canManage && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit Service
            </Button>
          )}
        </div>
        {qualifier && <p className="text-sm text-muted-foreground">Reference / qualifier: {qualifier}</p>}
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
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUS_STRIP.map(({ key, label, icon: Icon, color }) => (
              <Card key={key} className="flex-row items-center gap-2.5 p-3">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `color-mix(in oklch, ${color} 16%, var(--card))`, color }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs text-muted-foreground">{label}</span>
                  <span className="text-lg leading-tight font-semibold">{statusCounts[key]}</span>
                </div>
              </Card>
            ))}
          </div>

          <Card size="sm">
            <CardContent className="flex flex-col gap-3 pt-4">
              {workstream.description && <p className="text-sm text-muted-foreground">{workstream.description}</p>}
              <div className="flex flex-col gap-1.5 text-sm">
                <span>
                  Project Service Lead: <span className="font-medium text-foreground">{workstream.lead.fullName}</span>
                </span>
                <span>
                  Created By: <span className="font-medium text-foreground">{workstream.createdBy.fullName}</span>
                </span>
                <span>
                  Global Team Leads:{" "}
                  <span className="font-medium text-foreground">
                    {globalStaffing && globalStaffing.teamLeadUserIds.length > 0
                      ? globalStaffing.teamLeadUserIds.map(nameFor).join(", ")
                      : "None"}
                  </span>
                </span>
              </div>
              {workstream.recurrence && <RecurrenceIndicator recurrence={workstream.recurrence} />}
            </CardContent>
          </Card>

          {/* Employee never sees Time vs. Budget at all — Supervisor/Superadmin keep it, secondary
              and compact. Still the same real, current, Task-derived budget rollup. */}
          {canManage && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Time vs. Budget</CardTitle>
              </CardHeader>
              <CardContent>
                <BudgetBar budget={workstream.budget} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "activities" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Activities</span>
            <div className="flex items-center gap-2">
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setQuickAddOpen(true)}>
                  <Sparkles /> Add from activity
                </Button>
              )}
              {/* Every configured Activity already has its own "+ Add Task" — that's now the
                  primary creation path. This generic fallback only remains for a Service with
                  genuinely zero configured Activities, so Task creation is never blocked. */}
              {!hasConfiguredActivities && (
                <Button size="sm" variant="outline" onClick={() => openAddTask()} data-shortcut="new-task">
                  <Plus /> Add task
                </Button>
              )}
            </div>
          </div>
          <WorkstreamActivityTasks
            departments={activityDepartments}
            catalogLoading={activitiesLoading}
            tasks={tasks}
            isLoading={tasksLoading}
            runningTaskId={runningTaskId}
            onAddTask={openAddTask}
            onEdit={setEditingTask}
            onDeleted={refreshTasks}
          />
        </div>
      )}

      {tab === "team" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">This Project</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Project Service Lead</span>
                <span className="text-sm">{workstream.lead.fullName}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Project Service Team</span>
                {workstream.team.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No team members.</span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {workstream.team.map((member) => (
                      <div key={member.id} className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarFallback className="text-[0.65rem]">{initials(member.fullName)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{member.fullName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Global Service Staffing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Global Team Leads</span>
                <span className="text-sm">
                  {globalStaffing && globalStaffing.teamLeadUserIds.length > 0
                    ? globalStaffing.teamLeadUserIds.map(nameFor).join(", ")
                    : "None"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Works In Service</span>
                <span className="text-sm">
                  {globalStaffing && globalStaffing.employeeUserIds.length > 0
                    ? globalStaffing.employeeUserIds.map(nameFor).join(", ")
                    : "None"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Org-wide responsibility/membership for this Service — does not by itself grant access to this or any
                other Project.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "schedule" && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Start date</span>
                <span className="text-sm">{workstream.startDate ?? "Not set"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Service end date</span>
                <span className="text-sm">{workstream.endDate ?? "Not set"}</span>
              </div>
            </div>
            {workstream.recurrence ? (
              <div className="flex flex-col gap-2">
                <RecurrenceIndicator recurrence={workstream.recurrence} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Frequency</span>
                    <span className="text-sm capitalize">{workstream.recurrenceFrequency}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Anchor date</span>
                    <span className="text-sm">
                      {workstream.recurrenceAnchorDate ? formatRecurrenceDate(workstream.recurrenceAnchorDate) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">This service doesn&apos;t recur.</p>
            )}
            {canManage && workstream.recurrence?.isActive && workstream.recurrence.nextOccurrenceDate != null && (
              <Button variant="outline" className="w-fit" onClick={() => setGenerateOpen(true)}>
                <RefreshCw /> Generate next occurrence
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {canManage && company && (
        <WorkstreamFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          company={company}
          workstream={workstream}
          onSaved={refresh}
        />
      )}
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        mode="create"
        defaultWorkstreamId={workstream.id}
        defaultActivityId={taskDialogActivityId}
        onSaved={refreshTasks}
      />
      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={refreshTasks}
        />
      )}
      {canManage && (
        <QuickAddFromActivityDialog
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          workstream={workstream}
          onAdded={refreshTasks}
        />
      )}
      {canManage && workstream.recurrence?.isActive && workstream.recurrence.nextOccurrenceDate != null && (
        <GenerateOccurrenceDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          workstream={workstream}
          sourceTasks={tasks}
          onGenerated={refreshTasks}
        />
      )}
    </div>
  );
}

export default function WorkstreamDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <WorkstreamDetailPageContent {...props} />
    </Suspense>
  );
}
