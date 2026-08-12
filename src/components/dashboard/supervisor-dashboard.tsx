"use client";

import type { User } from "@/lib/data/types";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useAccomplishmentsReports } from "@/lib/data/hooks/use-accomplishments-reports";
import { useRecentHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { isAccomplishmentsReportOwner } from "@/lib/data/permissions";
import { GreetingText } from "@/components/dashboard/greeting-heading";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { KpiPreviewList } from "@/components/dashboard/kpi-preview-list";
import { StatCard } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskStatusDonut } from "@/components/tasks/task-status-donut";
import { TeamWorkloadCard } from "@/components/dashboard/team-workload-card";
import { ClientHealthOverviewCard } from "@/components/dashboard/client-health-overview-card";
import { ReportsAwaitingReviewCard } from "@/components/dashboard/reports-awaiting-review-card";
import { RecurringWorkDueCard } from "@/components/dashboard/recurring-work-due-card";
import { TeamActivityCard } from "@/components/dashboard/team-activity-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
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

export function SupervisorDashboard({ user }: { user: User }) {
  const { tasks } = useTasks();
  const { companies } = useCompanies();
  const { workstreams } = useWorkstreams();
  const { assignableStaff } = useCompanyLookups();
  const { reports } = useAccomplishmentsReports();
  const { handoffs } = useRecentHandoffs();

  const teamMembers = assignableStaff.filter((u) => u.id !== user.id);
  const teamReports = reports.filter((r) => !isAccomplishmentsReportOwner(user, r));

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          <GreetingText fullName={user.fullName} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s how your team is doing.</p>
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
          preview={
            <KpiPreviewList
              items={openTasks.slice(0, 4).map((t) => ({
                id: t.id,
                title: t.title,
                subtitle: t.company.name,
                href: `/dashboard/tasks/${t.id}`,
              }))}
              emptyMessage="Nothing open right now."
            />
          }
          viewAllHref="/dashboard/tasks?active=1"
        />
        <StatCard
          label="Team overdue"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? "warning" : "default"}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(1)}
          preview={
            <KpiPreviewList
              items={overdueTasks.slice(0, 4).map((t) => ({
                id: t.id,
                title: t.title,
                subtitle: t.company.name,
                href: `/dashboard/tasks/${t.id}`,
              }))}
              emptyMessage="Nothing overdue right now."
            />
          }
          viewAllHref="/dashboard/tasks?overdue=1"
        />
        <StatCard
          label="Completed this week"
          value={String(completedThisWeekCount)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(2)}
          preview={
            <KpiPreviewList
              items={completedThisWeek.slice(0, 4).map((t) => ({
                id: t.id,
                title: t.title,
                subtitle: t.company.name,
                href: `/dashboard/tasks/${t.id}`,
              }))}
              emptyMessage="Nothing completed yet this week."
            />
          }
          viewAllHref="/dashboard/tasks?status=done"
        />
        <StatCard
          label="Clients needing attention"
          value={String(clientsNeedingAttentionCount)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(3)}
          preview={
            <KpiPreviewList
              items={clientsNeedingAttention.slice(0, 4).map((c) => ({
                id: c.id,
                title: c.name,
                subtitle: HEALTH_LABEL[c.health.status],
                href: `/dashboard/companies/${c.id}`,
              }))}
              emptyMessage="No clients need attention right now."
            />
          }
          viewAllHref="/dashboard/companies?health=attention"
        />
      </div>

      <SectionBreak num="01" label="Team" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamWorkloadCard members={teamMembers} tasks={tasks} />
        </div>
        <div className={cn("flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <ClientHealthOverviewCard companies={companies} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team Tasks by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskStatusDonut tasks={tasks} />
            </CardContent>
          </Card>
        </div>
      </div>

      <SectionBreak num="02" label="Review & Activity" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamActivityCard tasks={tasks} handoffs={handoffs} />
        </div>
        <div className={cn("flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <ReportsAwaitingReviewCard reports={teamReports} />
          <RecurringWorkDueCard workstreams={workstreams} />
          <UpcomingDeadlinesCard tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
