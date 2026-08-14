"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkstream } from "@/lib/data/hooks/use-workstreams";
import { useCompany } from "@/lib/data/hooks/use-companies";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreamActivities } from "@/lib/data/hooks/use-workstream-activities";
import { canManageWorkstreams } from "@/lib/data/permissions";
import { workstreamDisplayHeading, splitWorkstreamQualifier } from "@/lib/data/workstream-name";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { WorkstreamStatusBadge } from "@/components/workstreams/workstream-status-badge";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { BudgetBar } from "@/components/ui/budget-bar";
import { RecurrenceIndicator } from "@/components/workstreams/recurrence-indicator";
import { GenerateOccurrenceDialog } from "@/components/workstreams/generate-occurrence-dialog";
import { QuickAddFromActivityDialog } from "@/components/workstreams/quick-add-from-activity-dialog";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { WorkstreamActivityTasks } from "@/components/workstreams/workstream-activity-tasks";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function WorkstreamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { workstream, isLoading, notFound, refresh } = useWorkstream(id);
  const { company } = useCompany(workstream?.companyId ?? "");
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks({ workstreamId: id });
  const { departments: activityDepartments, isLoading: activitiesLoading } = useWorkstreamActivities(workstream ?? undefined);

  const [editOpen, setEditOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
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

  if (notFound || !workstream) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/companies" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to companies
        </Link>
        <p className="text-sm text-muted-foreground">
          This workstream doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const canManage = canManageWorkstreams(user);
  const hasConfiguredActivities = activityDepartments.flatMap((d) => d.activities).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/dashboard/companies/${workstream.company.id}`}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to {workstream.company.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold">
              {workstreamDisplayHeading(workstream.name, workstream.serviceLine?.name ?? null)}
            </h1>
            <WorkstreamStatusBadge status={workstream.status} />
            <Badge variant="neutral">{workstream.brand.name}</Badge>
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
        {(() => {
          const qualifier = splitWorkstreamQualifier(workstream.name, workstream.serviceLine?.name ?? null);
          return qualifier ? <p className="text-sm text-muted-foreground">{qualifier}</p> : null;
        })()}
        {workstream.description && <p className="text-sm text-muted-foreground">{workstream.description}</p>}
        {workstream.recurrence && <RecurrenceIndicator recurrence={workstream.recurrence} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Company</span>
              <p className="mt-1.5 text-sm">
                <Link href={`/dashboard/companies/${workstream.company.id}`} className="hover:underline">
                  {workstream.company.name}
                </Link>
              </p>
            </div>
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Service</span>
              <p className="mt-1.5 text-sm">{workstream.serviceLine?.name ?? "None"}</p>
            </div>
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Start date</span>
              <p className="mt-1.5 text-sm">{formatDate(workstream.startDate)}</p>
            </div>
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Renewal date</span>
              <p className="mt-1.5 text-sm">{formatDate(workstream.endDate)}</p>
            </div>
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Progress</span>
              <div className="mt-1.5">
                <ChecklistProgress
                  label="Tasks"
                  done={workstream.doneTaskCount}
                  total={workstream.taskCount}
                  emptyLabel="No tasks yet"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(workstream.lead.fullName)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{workstream.lead.fullName}</span>
                <span className="text-xs text-muted-foreground">Lead</span>
              </div>
            </div>
            {workstream.team.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials(member.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{member.fullName}</span>
                  <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time vs. Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetBar budget={workstream.budget} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base">Activities</CardTitle>
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
        </CardHeader>
        <CardContent>
          <WorkstreamActivityTasks
            departments={activityDepartments}
            catalogLoading={activitiesLoading}
            tasks={tasks}
            isLoading={tasksLoading}
            onAddTask={openAddTask}
          />
        </CardContent>
      </Card>

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
