"use client";

import { useState } from "react";
import { ListChecks, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { useMyTasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useMyTimeEntries } from "@/lib/data/hooks/use-time-entries";
import { isTaskActiveWork } from "@/lib/data/task-display";
import { formatMinutes } from "@/lib/format-minutes";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { StatCard, StatCardSkeleton } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskStatusDonut } from "@/components/tasks/task-status-donut";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { RecentNotificationsCard } from "@/components/dashboard/recent-notifications-card";
import { FeaturedTrendCard } from "@/components/dashboard/featured-trend-card";
import { buildDailySeries, isWithinLastNLocalDays } from "@/lib/data/daily-series";
import { WorkstreamOverviewCard } from "@/components/workstreams/workstream-overview-card";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { TaskKpiDetail } from "@/components/dashboard/task-kpi-detail";
import { TaskStatusFocusContent } from "@/components/dashboard/task-status-focus-content";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { todayDateOnly } from "@/lib/planner-dates";
import { cn } from "@/lib/utils";

const MAX_WORKSTREAMS_PREVIEW = 6;

/**
 * MVP Simplification Pass (boss feedback) — Dashboard stays summary-oriented (counts, a status
 * breakdown, a services reference); My Day is the one place to actually work a task or run a timer.
 * The interactive "My Tasks" list (its own search/filter/save-view, editable inline) and the "Time
 * this week" timer-control card were both genuine, fuller duplicates of My Day's own equivalents —
 * removed here rather than kept as a second, less-capable copy. The KPI tiles below still let you
 * preview and open a Task from their own drill-down (`TaskKpiDetail`, read-only — no inline edit/
 * delete kebab there; a row click opens the real Task Drawer, same as anywhere else in the app), so
 * nothing about "what needs my attention" is lost, without Dashboard becoming a second Tasks editor.
 */
export function EmployeeDashboard() {
  const { tasks, isLoading: tasksLoading, refresh } = useMyTasks();
  const { workstreams } = useWorkstreams();
  const { entries, refresh: refreshEntries } = useMyTimeEntries();
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [workstreamsFocusOpen, setWorkstreamsFocusOpen] = useState(false);
  const [taskStatusFocusOpen, setTaskStatusFocusOpen] = useState(false);

  const runningEntry = entries.find((e) => e.durationMinutes === null) ?? null;

  const today = todayDateOnly();
  const sevenDaysAgoIso = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const activeWorkstreams = workstreams.filter((w) => w.status === "active");

  const openTasks = tasks.filter((t) => isTaskActiveWork(t));
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const overdueCount = overdueTasks.length;
  const completedThisWeek = tasks.filter(
    (t) => t.status === "completed" && t.statusChangedAt && t.statusChangedAt >= sevenDaysAgoIso
  );
  const completedThisWeekCount = completedThisWeek.length;

  const weekEntries = entries.filter((e) => e.durationMinutes !== null && e.startTime >= sevenDaysAgoIso);
  const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  // The featured chart buckets by LOCAL calendar day (see `daily-series.ts`), a different window
  // than the KPI tile's rolling "now minus 168h" cutoff above — the two can disagree by a partial
  // day near a local-midnight boundary. Filtering this array by the SAME local-day rule the chart
  // buckets with (rather than reusing `weekEntries`) keeps the chart's own headline number always
  // equal to the sum of its own visible bars; it is deliberately not forced to match the KPI tile.
  const hoursEntriesForChart = entries.filter((e) => e.durationMinutes !== null && isWithinLastNLocalDays(e.startTime));
  const hoursSeries = buildDailySeries(hoursEntriesForChart, (e) => e.startTime, (e) => e.durationMinutes ?? 0);
  const chartMinutes = hoursSeries.reduce((sum, d) => sum + d.value, 0);

  // Peek content for the "Hours logged this week" KPI — per-task breakdown of the same entries.
  const minutesByTask = new Map<string, { title: string; minutes: number }>();
  for (const entry of weekEntries) {
    const existing = minutesByTask.get(entry.task.id);
    if (existing) existing.minutes += entry.durationMinutes ?? 0;
    else minutesByTask.set(entry.task.id, { title: entry.task.title, minutes: entry.durationMinutes ?? 0 });
  }
  const topTasksByTime = Array.from(minutesByTask.entries()).sort((a, b) => b[1].minutes - a[1].minutes);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-foreground/10">
        <span className="font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">Overview</span>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">An overview of your workload, progress, and recent activity.</p>
        <SearchTriggerBar
          variant="hero"
          placeholder="Search clients, tasks, actions…"
          className="mt-4 max-w-2xl"
        />
      </div>

      {tasksLoading ? (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="My open tasks"
          value={String(openTasks.length)}
          icon={ListChecks}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(0)}
          detail={{
            title: "My Open Tasks",
            description: `${openTasks.length} task${openTasks.length === 1 ? "" : "s"}`,
            content: (close) => (
              <TaskKpiDetail
                tasks={openTasks}
                emptyMessage="Nothing open right now."
                runningTaskId={runningEntry?.task.id}
                onOpenTask={(id) => {
                  close();
                  setDrawerTaskId(id);
                }}
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?active=1"
        />
        <StatCard
          label="Overdue"
          value={String(overdueCount)}
          icon={AlertTriangle}
          tone={overdueCount > 0 ? "warning" : "default"}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(1)}
          detail={{
            title: "Overdue Tasks",
            description: `${overdueCount} task${overdueCount === 1 ? "" : "s"}`,
            content: (close) => (
              <TaskKpiDetail
                tasks={overdueTasks}
                emptyMessage="Nothing overdue — nice work."
                runningTaskId={runningEntry?.task.id}
                onOpenTask={(id) => {
                  close();
                  setDrawerTaskId(id);
                }}
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?overdue=1"
        />
        <StatCard
          label="Completed this week"
          value={String(completedThisWeekCount)}
          icon={CheckCircle2}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(2)}
          detail={{
            title: "Completed This Week",
            description: `${completedThisWeekCount} task${completedThisWeekCount === 1 ? "" : "s"}`,
            content: (close) => (
              <TaskKpiDetail
                tasks={completedThisWeek}
                emptyMessage="Nothing completed yet this week."
                runningTaskId={runningEntry?.task.id}
                onOpenTask={(id) => {
                  close();
                  setDrawerTaskId(id);
                }}
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?status=completed"
        />
        <StatCard
          label="Hours logged this week"
          value={formatMinutes(weekMinutes)}
          icon={Clock}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(3)}
          detail={{
            title: "Hours Logged This Week",
            description: formatMinutes(weekMinutes),
            content: (close) =>
              topTasksByTime.length === 0 ? (
                <p className="text-sm text-muted-foreground">No time logged yet this week.</p>
              ) : (
                topTasksByTime.slice(0, 30).map(([taskId, info]) => (
                  <button
                    key={taskId}
                    type="button"
                    onClick={() => {
                      close();
                      setDrawerTaskId(taskId);
                    }}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{info.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatMinutes(info.minutes)}</span>
                  </button>
                ))
              ),
          }}
        />
      </div>
      )}

      <SectionBreak num="01" label="My Templates" />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">My Templates</CardTitle>
          <CardAction>
            <CardExpandButton onClick={() => setWorkstreamsFocusOpen(true)} label="Expand My Templates" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {activeWorkstreams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active Templates right now.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {activeWorkstreams.slice(0, MAX_WORKSTREAMS_PREVIEW).map((workstream, i) => (
                  <WorkstreamOverviewCard
                    key={workstream.id}
                    workstream={workstream}
                    className={STAGGER_ITEM_CLASS}
                    style={staggerDelay(i)}
                  />
                ))}
              </div>
              {activeWorkstreams.length > MAX_WORKSTREAMS_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setWorkstreamsFocusOpen(true)}
                  className="self-start text-xs font-medium text-primary hover:underline"
                >
                  +{activeWorkstreams.length - MAX_WORKSTREAMS_PREVIEW} more
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <DashboardWidgetFocusDialog
        open={workstreamsFocusOpen}
        onOpenChange={setWorkstreamsFocusOpen}
        title="My Templates"
        description={`${activeWorkstreams.length} active Template${activeWorkstreams.length === 1 ? "" : "s"}`}
      >
        {activeWorkstreams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active Templates right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {activeWorkstreams.map((workstream, i) => (
              <WorkstreamOverviewCard
                key={workstream.id}
                workstream={workstream}
                className={STAGGER_ITEM_CLASS}
                style={staggerDelay(i)}
              />
            ))}
          </div>
        )}
      </DashboardWidgetFocusDialog>

      <SectionBreak num="02" label="Summary & Activity" />

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <FeaturedTrendCard
          title="Hours Logged — Last 7 Calendar Days"
          metricValue={formatMinutes(chartMinutes)}
          metricCaption={`across ${hoursEntriesForChart.length} time entr${hoursEntriesForChart.length === 1 ? "y" : "ies"}`}
          series={hoursSeries}
          formatValue={formatMinutes}
          emptyMessage="No time logged in the last 7 calendar days."
          className={cn("lg:col-span-3", STAGGER_ITEM_CLASS)}
          style={staggerDelay(0)}
        />

        <Card className={cn("shadow-sm lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <CardHeader>
            <CardTitle className="text-base">My Tasks by Status</CardTitle>
            <CardAction>
              <CardExpandButton onClick={() => setTaskStatusFocusOpen(true)} label="Expand My Tasks by Status" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <TaskStatusDonut tasks={tasks} />
          </CardContent>
        </Card>
      </div>

      <div className={STAGGER_ITEM_CLASS} style={staggerDelay(2)}>
        <RecentNotificationsCard />
      </div>

      <DashboardWidgetFocusDialog
        open={taskStatusFocusOpen}
        onOpenChange={setTaskStatusFocusOpen}
        title="My Tasks by Status"
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
          onDeleted={refresh}
        />
      </DashboardWidgetFocusDialog>

      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={refresh}
        />
      )}
      <TaskDrawer
        taskId={drawerTaskId}
        onOpenChange={(open) => !open && setDrawerTaskId(null)}
        onChanged={refresh}
        onTimerChanged={refreshEntries}
      />
    </div>
  );
}
