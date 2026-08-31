"use client";

import { use, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Pencil, PlayCircle, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkstream } from "@/lib/data/hooks/use-workstreams";
import { useCompany } from "@/lib/data/hooks/use-companies";
import { useProject } from "@/lib/data/hooks/use-projects";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreamActivities } from "@/lib/data/hooks/use-workstream-activities";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import { canManageWorkstreams, isSuperadmin } from "@/lib/data/permissions";
import { workstreamDisplayHeading, splitWorkstreamQualifier } from "@/lib/data/workstream-name";
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

export default function WorkstreamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { workstream, isLoading, notFound, refresh } = useWorkstream(id);
  const { company } = useCompany(workstream?.companyId ?? "");
  const { project } = useProject(workstream?.projectId ?? "");
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks({ workstreamId: id });
  const { departments: activityDepartments, isLoading: activitiesLoading } = useWorkstreamActivities(workstream ?? undefined);
  const { runningTimer } = useRunningTimer();
  const runningTaskId = runningTimer?.taskId ?? null;

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

  if (!user) return null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Employee/Supervisor were never sent into Company admin pages before Phase 8B either (they
  // reached this page only via their own Project/Task work) — this just makes the back-link
  // correct now that those Company routes redirect them away. Superadmin keeps the Company
  // admin flow, since they retain that navigation.
  const backHref = user && isSuperadmin(user) ? `/dashboard/companies/${workstream?.company.id}` : `/dashboard/projects/${workstream?.projectId ?? ""}`;

  if (notFound || !workstream) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href={user && isSuperadmin(user) ? "/dashboard/companies" : "/dashboard/projects"} className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          {user && isSuperadmin(user) ? "Back to companies" : "Back to projects"}
        </Link>
        <p className="text-sm text-muted-foreground">
          This workstream doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const canManage = canManageWorkstreams(user);
  const hasConfiguredActivities = activityDepartments.flatMap((d) => d.activities).length > 0;
  const statusCounts = {
    open: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    blockedWaiting: tasks.filter((t) => t.status === "blocked" || t.status === "waiting-on-client").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={backHref}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          {isSuperadmin(user) ? `Back to ${workstream.company.name}` : "Back to project"}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">
              {workstreamDisplayHeading(workstream.name, workstream.serviceLine?.name ?? null)}
            </h1>
            <WorkstreamStatusBadge status={workstream.status} />
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              {workstream.recurrence?.isActive && workstream.recurrence.nextOccurrenceDate != null && (
                <Button variant="outline" onClick={() => setGenerateOpen(true)}>
                  <RefreshCw /> Generate next occurrence
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit workstream
              </Button>
            </div>
          )}
        </div>
        {/* Project context shown subtly — no separate Client/Company identity hierarchy here
            (Company admin stays on the Superadmin-only pages; this is the operational surface). */}
        {workstream.projectId && (
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
        )}
        {(() => {
          const qualifier = splitWorkstreamQualifier(workstream.name, workstream.serviceLine?.name ?? null);
          return qualifier ? <p className="text-sm text-muted-foreground">{qualifier}</p> : null;
        })()}
        {workstream.description && <p className="text-sm text-muted-foreground">{workstream.description}</p>}
        {workstream.recurrence && <RecurrenceIndicator recurrence={workstream.recurrence} />}
        {/* Team, compact — a metadata line, not a card. Lead named directly; team shown as an
            avatar stack, matching the same compact treatment used on the Projects index. */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            Lead: <span className="font-medium text-foreground">{workstream.lead.fullName}</span>
          </span>
          {workstream.team.length > 0 && (
            <div className="flex items-center -space-x-2">
              {workstream.team.slice(0, 3).map((member) => (
                <Avatar key={member.id} size="sm" className="ring-2 ring-card">
                  <AvatarFallback className="text-[0.65rem]">{initials(member.fullName)}</AvatarFallback>
                </Avatar>
              ))}
              {workstream.team.length > 3 && (
                <span className="z-10 flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground ring-2 ring-card">
                  +{workstream.team.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Compact operational glance — Open/In Progress/Blocked or Waiting/Done, from this
          Service's own already-fetched Tasks. No giant KPI cards, no Company/Start-Renewal-date/
          brand metadata (still fully preserved in "Edit workstream," never deleted). */}
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

      {/* Activities — the primary body. Dense, thin-bordered sections (each ActivityCard is its
          own bordered box), not one giant Card wrapping everything. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Activities</span>
          <div className="flex items-center gap-2">
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setQuickAddOpen(true)}>
                <Sparkles /> Add from activity
              </Button>
            )}
            {/* Every configured Activity already has its own "+ Add Task" — that's now the primary
                creation path. This generic fallback only remains for a workstream with genuinely
                zero configured activities (no service, no catalog, or nothing curated yet), so
                task creation is never blocked. */}
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

      {/* Employee never sees Time vs. Budget at all — Supervisor/Superadmin keep it, secondary and
          compact, at the very bottom. Still the same real, current, Task-derived budget rollup —
          nothing deleted, just de-emphasized. */}
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
