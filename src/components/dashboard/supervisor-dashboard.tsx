"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, Plus, Square } from "lucide-react";
import type { User } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { useTasks, useMyTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { projectHrefForCompany } from "@/lib/data/project-display";
import { useMyTimeEntries } from "@/lib/data/hooks/use-time-entries";
import { useElapsedSeconds } from "@/lib/data/hooks/use-elapsed-seconds";
import { useRecentHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { timeEntriesProvider } from "@/lib/data/providers";
import { formatMinutes } from "@/lib/format-minutes";
import { GreetingText } from "@/components/dashboard/greeting-heading";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { KpiPreviewList } from "@/components/dashboard/kpi-preview-list";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { TaskKpiDetail } from "@/components/dashboard/task-kpi-detail";
import { TaskStatusFocusContent } from "@/components/dashboard/task-status-focus-content";
import { StatCard } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { TaskRowList } from "@/components/tasks/task-row";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskStatusDonut } from "@/components/tasks/task-status-donut";
import { TeamWorkloadCard } from "@/components/dashboard/team-workload-card";
import { ClientHealthOverviewCard } from "@/components/dashboard/client-health-overview-card";
import { RecurringWorkDueCard } from "@/components/dashboard/recurring-work-due-card";
import { TeamActivityCard } from "@/components/dashboard/team-activity-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const MAX_MY_TASKS_PREVIEW = 6;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatEntryDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Matches `ClientHealthBadge`'s own label text, for the "Clients needing attention" KPI's preview subtitle. */
const HEALTH_LABEL: Record<string, string> = {
  "needs-attention": "Needs Attention",
  "at-risk": "At Risk",
};

export function SupervisorDashboard({ user }: { user: User }) {
  const { tasks, refresh: refreshTasks } = useTasks();
  const { tasks: myTasks, isLoading: myTasksLoading, refresh: refreshMyTasks } = useMyTasks();
  const { entries: myEntries, refresh: refreshMyEntries } = useMyTimeEntries();
  const { companies } = useCompanies();
  const { projects } = useProjects();
  const { workstreams } = useWorkstreams();
  const { assignableStaff } = useCompanyLookups();
  const { handoffs } = useRecentHandoffs();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  function refreshAllTasks() {
    refreshTasks();
    refreshMyTasks();
  }
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [myTasksFocusOpen, setMyTasksFocusOpen] = useState(false);
  const [timeFocusOpen, setTimeFocusOpen] = useState(false);
  const [taskStatusFocusOpen, setTaskStatusFocusOpen] = useState(false);

  const teamMembers = assignableStaff.filter((u) => u.id !== user.id);

  const today = todayDateString();
  const sevenDaysAgoIso = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const overdueCount = overdueTasks.length;
  const completedThisWeek = tasks.filter(
    (t) => t.status === "done" && t.statusChangedAt && t.statusChangedAt >= sevenDaysAgoIso
  );
  const completedThisWeekCount = completedThisWeek.length;
  const clientsNeedingAttention = companies.filter((c) => c.health.status !== "on-track");
  const clientsNeedingAttentionCount = clientsNeedingAttention.length;

  const myOpenTasks = myTasks.filter((t) => t.status !== "done");
  const weekEntries = myEntries.filter((e) => e.durationMinutes !== null && e.startTime >= sevenDaysAgoIso);
  const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const weekEntriesSorted = [...weekEntries].sort((a, b) => b.startTime.localeCompare(a.startTime));
  const runningEntry = myEntries.find((e) => e.durationMinutes === null) ?? null;
  const elapsedSeconds = useElapsedSeconds(runningEntry?.startTime ?? null);

  async function handleStopTimer() {
    if (!runningEntry) return;
    setIsStopping(true);
    try {
      await timeEntriesProvider.stopTimer(user, runningEntry.id);
      await refreshMyEntries();
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          <GreetingText fullName={user.fullName} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your own work, plus how your team is doing.</p>
        <SearchTriggerBar
          variant="hero"
          placeholder="Search clients, tasks, actions…"
          className="mt-4 max-w-2xl"
        />
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Team open tasks"
          value={String(openTasks.length)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(0)}
          detail={{
            title: "Team Open Tasks",
            description: `${openTasks.length} task${openTasks.length === 1 ? "" : "s"}`,
            content: (close) => (
              <TaskKpiDetail
                tasks={openTasks}
                emptyMessage="Nothing open right now."
                onOpenTask={(id) => {
                  close();
                  setDrawerTaskId(id);
                }}
                onEdit={(task) => {
                  close();
                  setEditingTask(task);
                }}
                onDeleted={refreshAllTasks}
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?active=1"
        />
        <StatCard
          label="Team overdue"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? "warning" : "default"}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(1)}
          detail={{
            title: "Team Overdue Tasks",
            description: `${overdueCount} task${overdueCount === 1 ? "" : "s"}`,
            content: (close) => (
              <TaskKpiDetail
                tasks={overdueTasks}
                emptyMessage="Nothing overdue right now."
                onOpenTask={(id) => {
                  close();
                  setDrawerTaskId(id);
                }}
                onEdit={(task) => {
                  close();
                  setEditingTask(task);
                }}
                onDeleted={refreshAllTasks}
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?overdue=1"
        />
        <StatCard
          label="Completed this week"
          value={String(completedThisWeekCount)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(2)}
          detail={{
            title: "Completed This Week",
            description: `${completedThisWeekCount} task${completedThisWeekCount === 1 ? "" : "s"}`,
            content: (close) => (
              <TaskKpiDetail
                tasks={completedThisWeek}
                emptyMessage="Nothing completed yet this week."
                onOpenTask={(id) => {
                  close();
                  setDrawerTaskId(id);
                }}
                onEdit={(task) => {
                  close();
                  setEditingTask(task);
                }}
                onDeleted={refreshAllTasks}
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?status=done"
        />
        <StatCard
          label="Clients needing attention"
          value={String(clientsNeedingAttentionCount)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(3)}
          detail={{
            title: "Clients Needing Attention",
            description: `${clientsNeedingAttentionCount} client${clientsNeedingAttentionCount === 1 ? "" : "s"}`,
            content: () => (
              <KpiPreviewList
                items={clientsNeedingAttention.map((c) => ({
                  id: c.id,
                  title: c.name,
                  subtitle: HEALTH_LABEL[c.health.status],
                  href: projectHrefForCompany(c.id, projects),
                }))}
                emptyMessage="No clients need attention right now."
              />
            ),
          }}
          // Filter gap (Project Closure — Navigation Correction): Projects has no client-health
          // filter today, so "View all" lands on the plain list rather than a pre-filtered one.
          viewAllHref="/dashboard/projects"
        />
      </div>

      {/* A Supervisor is also an operational Employee — this section is the same "my own work
          today" content the Employee dashboard leads with, so managing a team never comes at the
          cost of losing sight of their own assignments. */}
      <SectionBreak num="01" label="My Work" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
              My Tasks
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setTaskDialogOpen(true)}>
                <Plus /> Add task
              </Button>
              <CardExpandButton onClick={() => setMyTasksFocusOpen(true)} label="Expand My Tasks" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <TaskRowList
              tasks={myOpenTasks.slice(0, MAX_MY_TASKS_PREVIEW)}
              isLoading={myTasksLoading}
              emptyMessage="Nothing assigned to you right now — add your own task to get started."
              subtitleFor={(task) =>
                `${task.company.name} · ${task.workstream.name}${task.activity ? ` · ${task.activity.name}` : ""}`
              }
              onOpen={setDrawerTaskId}
            />
            {myOpenTasks.length > MAX_MY_TASKS_PREVIEW && (
              <button
                type="button"
                onClick={() => setMyTasksFocusOpen(true)}
                className="self-start text-xs font-medium text-primary hover:underline"
              >
                +{myOpenTasks.length - MAX_MY_TASKS_PREVIEW} more
              </button>
            )}
          </CardContent>
        </Card>

        <Card className={cn(STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <CardHeader>
            <CardTitle className="text-base">My time this week</CardTitle>
            <CardAction>
              <CardExpandButton onClick={() => setTimeFocusOpen(true)} label="Expand My time this week" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <span className="font-heading text-2xl font-semibold tracking-tight text-primary">
                {formatMinutes(weekMinutes)}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">Logged across the last 7 days.</p>
            </div>
            <div className="border-t pt-3">
              <span className="mb-2 block font-mono text-xs tracking-wider text-muted-foreground uppercase">
                Running timer
              </span>
              {runningEntry ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/dashboard/tasks/${runningEntry.task.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {runningEntry.task.title}
                    </Link>
                    <span className="font-mono text-lg text-primary">{formatElapsed(elapsedSeconds)}</span>
                  </div>
                  <Button variant="destructive" size="sm" onClick={handleStopTimer} disabled={isStopping}>
                    <Square /> Stop
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No timer running — start one from any task.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <DashboardWidgetFocusDialog
        open={myTasksFocusOpen}
        onOpenChange={setMyTasksFocusOpen}
        title="My Tasks"
        description={`${myOpenTasks.length} open task${myOpenTasks.length === 1 ? "" : "s"}`}
      >
        <TaskRowList
          tasks={myOpenTasks}
          isLoading={myTasksLoading}
          emptyMessage="Nothing assigned to you right now — add your own task to get started."
          subtitleFor={(task) =>
            `${task.company.name} · ${task.workstream.name}${task.activity ? ` · ${task.activity.name}` : ""}`
          }
          onOpen={setDrawerTaskId}
        />
      </DashboardWidgetFocusDialog>

      <DashboardWidgetFocusDialog
        open={timeFocusOpen}
        onOpenChange={setTimeFocusOpen}
        title="My time this week"
        description={`${formatMinutes(weekMinutes)} logged across the last 7 days`}
      >
        <div className="border-b pb-4">
          <span className="mb-2 block font-mono text-xs tracking-wider text-muted-foreground uppercase">
            Running timer
          </span>
          {runningEntry ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setTimeFocusOpen(false);
                    setDrawerTaskId(runningEntry.task.id);
                  }}
                  className="text-left text-sm font-medium hover:underline"
                >
                  {runningEntry.task.title}
                </button>
                <span className="font-mono text-lg text-primary">{formatElapsed(elapsedSeconds)}</span>
              </div>
              <Button variant="destructive" size="sm" onClick={handleStopTimer} disabled={isStopping}>
                <Square /> Stop
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No timer running — start one from any task.</p>
          )}
        </div>
        {weekEntriesSorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged yet this week.</p>
        ) : (
          weekEntriesSorted.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTimeFocusOpen(false);
                setDrawerTaskId(entry.task.id);
              }}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{entry.task.title}</span>
                <span className="text-xs text-muted-foreground">{formatEntryDate(entry.startTime)}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatMinutes(entry.durationMinutes ?? 0)}</span>
            </button>
          ))
        )}
      </DashboardWidgetFocusDialog>

      <SectionBreak num="02" label="Team Attention" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamWorkloadCard members={teamMembers} tasks={tasks} />
        </div>
        <div className={cn("flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <ClientHealthOverviewCard companies={companies} projects={projects} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team Tasks by Status</CardTitle>
              <CardAction>
                <CardExpandButton onClick={() => setTaskStatusFocusOpen(true)} label="Expand Team Tasks by Status" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <TaskStatusDonut tasks={tasks} />
            </CardContent>
          </Card>
        </div>
      </div>

      <DashboardWidgetFocusDialog
        open={taskStatusFocusOpen}
        onOpenChange={setTaskStatusFocusOpen}
        title="Team Tasks by Status"
        description={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
      >
        <TaskStatusFocusContent
          tasks={tasks}
          onOpenTask={(id) => {
            setTaskStatusFocusOpen(false);
            setDrawerTaskId(id);
          }}
          onEdit={(task) => {
            setTaskStatusFocusOpen(false);
            setEditingTask(task);
          }}
          onDeleted={refreshAllTasks}
        />
      </DashboardWidgetFocusDialog>

      <SectionBreak num="03" label="Review & Activity" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamActivityCard tasks={tasks} handoffs={handoffs} />
        </div>
        <div className={cn("flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <RecurringWorkDueCard workstreams={workstreams} />
          <UpcomingDeadlinesCard tasks={tasks} />
        </div>
      </div>

      <TaskFormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} mode="create" onSaved={refreshMyTasks} />
      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={refreshAllTasks}
        />
      )}
      <TaskDrawer
        taskId={drawerTaskId}
        onOpenChange={(open) => !open && setDrawerTaskId(null)}
        onChanged={refreshMyTasks}
        onTimerChanged={refreshMyEntries}
      />
    </div>
  );
}
