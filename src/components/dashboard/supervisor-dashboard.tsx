"use client";

import { useState } from "react";
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
import { StatCard } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskStatusDonut } from "@/components/tasks/task-status-donut";
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

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

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
  const { tasks, refresh: refreshTasks } = useTasks();
  const { companies } = useCompanies();
  const { projects } = useProjects();
  const { workstreams } = useWorkstreams();
  const { assignableStaff } = useCompanyLookups();
  const { handoffs } = useRecentHandoffs();
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [taskStatusFocusOpen, setTaskStatusFocusOpen] = useState(false);

  const teamMembers = assignableStaff.filter((u) => u.id !== user.id);

  const today = todayDateString();
  const sevenDaysAgoIso = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const openTasks = tasks.filter((t) => isTaskActiveWork(t));
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const overdueCount = overdueTasks.length;
  const completedThisWeek = tasks.filter(
    (t) => t.status === "completed" && t.statusChangedAt && t.statusChangedAt >= sevenDaysAgoIso
  );
  const completedThisWeekCount = completedThisWeek.length;
  const clientsNeedingAttention = companies.filter((c) => c.health.status !== "on-track");
  const clientsNeedingAttentionCount = clientsNeedingAttention.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
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
              />
            ),
          }}
          viewAllHref="/dashboard/tasks?status=completed"
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

      <NeedsAttentionStrip teamMembers={teamMembers} teamTasks={tasks} className={STAGGER_ITEM_CLASS} style={staggerDelay(4)} />

      <SectionBreak num="01" label="Team Attention" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("min-w-0 lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamWorkloadCard members={teamMembers} tasks={tasks} />
        </div>
        <div className={cn("min-w-0 flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
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
          onDeleted={refreshTasks}
        />
      </DashboardWidgetFocusDialog>

      <SectionBreak num="02" label="Review & Activity" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("min-w-0 lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamActivityCard tasks={tasks} handoffs={handoffs} />
        </div>
        <div className={cn("min-w-0 flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <RecurringWorkDueCard workstreams={workstreams} />
          <UpcomingDeadlinesCard tasks={tasks} title="Team Upcoming" />
        </div>
      </div>

      <SectionBreak num="03" label="Notifications" />

      <RecentNotificationsCard />

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
