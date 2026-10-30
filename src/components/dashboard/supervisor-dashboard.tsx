"use client";

import { useState } from "react";
import { ListChecks, AlertTriangle, CheckCircle2, HeartPulse } from "lucide-react";
import type { User } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { projectHrefForCompany } from "@/lib/data/project-display";
import { useRecentHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { isTaskActiveWork } from "@/lib/data/task-display";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { KpiPreviewList } from "@/components/dashboard/kpi-preview-list";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { TaskKpiDetail } from "@/components/dashboard/task-kpi-detail";
import { TaskStatusFocusContent } from "@/components/dashboard/task-status-focus-content";
import { StatCard, StatCardSkeleton } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskStatusDonut } from "@/components/tasks/task-status-donut";
import { FeaturedTrendCard } from "@/components/dashboard/featured-trend-card";
import { buildDailySeries, isWithinLastNLocalDays } from "@/lib/data/daily-series";
import { TeamWorkloadCard } from "@/components/dashboard/team-workload-card";
import { ClientHealthOverviewCard } from "@/components/dashboard/client-health-overview-card";
import { RecurringWorkDueCard } from "@/components/dashboard/recurring-work-due-card";
import { TeamActivityCard } from "@/components/dashboard/team-activity-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { RecentNotificationsCard } from "@/components/dashboard/recent-notifications-card";
import { NeedsAttentionStrip } from "@/components/my-day/needs-attention-strip";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";
import { todayDateOnly } from "@/lib/planner-dates";

/** Matches `ClientHealthBadge`'s own label text, for the "Clients needing attention" KPI's preview subtitle. */
const HEALTH_LABEL: Record<string, string> = {
  "needs-attention": "Needs Attention",
  "at-risk": "At Risk",
};

/**
 * MVP Simplification Pass (boss feedback) — Dashboard stays summary-oriented for a Team Lead too:
 * team-level KPIs, workload/health/activity rollups. The personal "My Tasks" list (with its own
 * Add-task button, inline editing) and "My time this week" timer-control card were genuine, fuller
 * duplicates of the Team Lead's own My Day — removed here rather than kept as a second, less-capable
 * copy; own work is still one click away on My Day.
 */
export function SupervisorDashboard({ user }: { user: User }) {
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks();
  const { companies } = useCompanies();
  const { projects } = useProjects();
  const { workstreams } = useWorkstreams();
  const { assignableStaff } = useCompanyLookups();
  const { handoffs } = useRecentHandoffs();
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [taskStatusFocusOpen, setTaskStatusFocusOpen] = useState(false);

  const teamMembers = assignableStaff.filter((u) => u.id !== user.id);

  const today = todayDateOnly();
  const sevenDaysAgoIso = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const openTasks = tasks.filter((t) => isTaskActiveWork(t));
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const overdueCount = overdueTasks.length;
  const completedThisWeek = tasks.filter(
    (t) => t.status === "completed" && t.statusChangedAt && t.statusChangedAt >= sevenDaysAgoIso
  );
  const completedThisWeekCount = completedThisWeek.length;

  // The featured chart buckets by LOCAL calendar day (see `daily-series.ts`), a different window
  // than the KPI tile's rolling "now minus 168h" cutoff above — the two can disagree by a partial
  // day near a local-midnight boundary. Filtering this array by the SAME local-day rule the chart
  // buckets with (rather than reusing `completedThisWeek`) keeps the chart's own headline number
  // always equal to the sum of its own visible bars; it is deliberately not forced to match the KPI.
  const completionsForChart = tasks.filter(
    (t) => t.status === "completed" && t.statusChangedAt && isWithinLastNLocalDays(t.statusChangedAt)
  );
  const completionsSeries = buildDailySeries(completionsForChart, (t) => t.statusChangedAt!, () => 1);
  const chartCompletionsCount = completionsSeries.reduce((sum, d) => sum + d.value, 0);
  const clientsNeedingAttention = companies.filter((c) => c.health.status !== "on-track");
  const clientsNeedingAttentionCount = clientsNeedingAttention.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-foreground/10">
        <span className="font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">Overview</span>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Team workload, upcoming deadlines, client health, and items needing attention.
        </p>
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
          label="Team open tasks"
          value={String(openTasks.length)}
          icon={ListChecks}
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
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?active=1"
        />
        <StatCard
          label="Team overdue"
          value={String(overdueCount)}
          icon={AlertTriangle}
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
          label="Clients needing attention"
          value={String(clientsNeedingAttentionCount)}
          icon={HeartPulse}
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
      )}

      <NeedsAttentionStrip teamMembers={teamMembers} teamTasks={tasks} className={STAGGER_ITEM_CLASS} style={staggerDelay(4)} />

      {/* Density correction (Product Owner feedback) — the page's remaining content is now three
         explicitly labeled, visually separated groups instead of one continuous two-column scroll,
         so each section reads as its own answer to a specific question rather than one undifferentiated
         wall of cards. No card was removed or hidden; every widget below is the same component with
         the same data as before, just regrouped by what question it answers. */}
      <SectionBreak num="01" label="Performance Overview" />
      <FeaturedTrendCard
        title="Team Completions — Last 7 Calendar Days"
        metricValue={String(chartCompletionsCount)}
        metricCaption="tasks currently marked completed"
        series={completionsSeries}
        formatValue={(v) => String(v)}
        emptyMessage="No tasks completed in the last 7 calendar days."
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(0)}
      />

      <SectionBreak num="02" label="Team & Client Operations" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <TeamWorkloadCard members={teamMembers} tasks={tasks} className={STAGGER_ITEM_CLASS} style={staggerDelay(0)} />
          <Card className={cn("min-w-0 shadow-sm", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
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
        <ClientHealthOverviewCard
          companies={companies}
          projects={projects}
          className={cn("min-w-0", STAGGER_ITEM_CLASS)}
          style={staggerDelay(2)}
        />
      </div>

      <SectionBreak num="03" label="Activity & Upcoming Work" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <div className={cn("min-w-0", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
            <TeamActivityCard tasks={tasks} handoffs={handoffs} />
          </div>
          <div className={STAGGER_ITEM_CLASS} style={staggerDelay(1)}>
            <RecentNotificationsCard />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <div className={cn("min-w-0", STAGGER_ITEM_CLASS)} style={staggerDelay(2)}>
            <RecurringWorkDueCard workstreams={workstreams} />
          </div>
          <div className={cn("min-w-0", STAGGER_ITEM_CLASS)} style={staggerDelay(3)}>
            <UpcomingDeadlinesCard tasks={tasks} title="Team Upcoming" />
          </div>
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
          onDeleted={refreshTasks}
        />
      </DashboardWidgetFocusDialog>

      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={refreshTasks}
        />
      )}
      <TaskDrawer
        taskId={drawerTaskId}
        onOpenChange={(open) => !open && setDrawerTaskId(null)}
        onChanged={refreshTasks}
      />
    </div>
  );
}
