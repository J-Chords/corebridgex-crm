"use client";

import { useState } from "react";
import { Building2, Users, ListChecks, ShieldAlert } from "lucide-react";
import type { User } from "@/lib/data/types";
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
import { StatCard, StatCardSkeleton } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { TeamWorkloadCard } from "@/components/dashboard/team-workload-card";
import { ClientHealthOverviewCard } from "@/components/dashboard/client-health-overview-card";
import { TeamActivityCard } from "@/components/dashboard/team-activity-card";
import { BrandSnapshotCard } from "@/components/dashboard/brand-snapshot-card";
import { RecurringWorkDueCard } from "@/components/dashboard/recurring-work-due-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { RecentNotificationsCard } from "@/components/dashboard/recent-notifications-card";
import { NeedsAttentionStrip } from "@/components/my-day/needs-attention-strip";
import { FeaturedTrendCard } from "@/components/dashboard/featured-trend-card";
import { buildDailySeries, isWithinLastNLocalDays } from "@/lib/data/daily-series";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

export function SuperadminDashboard({ user }: { user: User }) {
  const { tasks, isLoading: tasksLoading, refresh } = useTasks();
  const { companies, isLoading: companiesLoading } = useCompanies();
  const { projects } = useProjects();
  const { workstreams } = useWorkstreams();
  const { brands, assignableStaff } = useCompanyLookups();
  const { handoffs } = useRecentHandoffs();
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const staff = assignableStaff.filter((u) => u.id !== user.id);

  const activeTasks = tasks.filter((t) => isTaskActiveWork(t));
  const activeTaskCount = activeTasks.length;
  const atRiskCompanies = companies.filter((c) => c.health.status === "at-risk");
  const atRiskCount = atRiskCompanies.length;

  // Unlike Supervisor/Employee, Superadmin has no pre-existing "Completed this week" KPI tile — this
  // array exists only to feed the featured chart below, so it's filtered directly by the SAME local
  // calendar-day rule the chart buckets with (see `daily-series.ts`), never a separate rolling
  // "now minus 168h" cutoff — there is no second definition here to stay consistent with.
  const completionsForChart = tasks.filter(
    (t) => t.status === "completed" && t.statusChangedAt && isWithinLastNLocalDays(t.statusChangedAt)
  );
  const completionsSeries = buildDailySeries(completionsForChart, (t) => t.statusChangedAt!, () => 1);
  const chartCompletionsCount = completionsSeries.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-foreground/10">
        <span className="font-mono text-xs font-semibold tracking-[0.14em] text-primary uppercase">Overview</span>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organization workload, upcoming deadlines, client health, and operational attention.
        </p>
        <SearchTriggerBar
          variant="hero"
          placeholder="Search clients, tasks, actions…"
          className="mt-4 max-w-2xl"
        />
      </div>

      {tasksLoading || companiesLoading ? (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total clients"
          value={String(companies.length)}
          icon={Building2}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(0)}
          detail={{
            title: "Total Clients",
            description: `${companies.length} client${companies.length === 1 ? "" : "s"}`,
            content: () => (
              <KpiPreviewList
                items={companies.map((c) => ({
                  id: c.id,
                  title: c.name,
                  subtitle: c.brand?.name ?? "No brand yet",
                  href: projectHrefForCompany(c.id, projects),
                }))}
                emptyMessage="No clients yet."
              />
            ),
          }}
          viewAllHref="/dashboard/projects"
        />
        <StatCard
          label="Total staff"
          value={String(assignableStaff.length)}
          icon={Users}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(1)}
          detail={{
            title: "Total Staff",
            description: `${assignableStaff.length} staff member${assignableStaff.length === 1 ? "" : "s"}`,
            content: () => (
              <KpiPreviewList
                items={assignableStaff.map((s) => ({
                  id: s.id,
                  title: s.fullName,
                  subtitle: ROLE_LABELS[s.role],
                }))}
                emptyMessage="No staff yet."
              />
            ),
          }}
          viewAllHref="/dashboard/admin/users"
        />
        <StatCard
          label="Active tasks"
          value={String(activeTaskCount)}
          icon={ListChecks}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(2)}
          detail={{
            title: "Active Tasks",
            description: `${activeTaskCount} task${activeTaskCount === 1 ? "" : "s"}`,
            content: (close) => (
              <TaskKpiDetail
                tasks={activeTasks}
                emptyMessage="Nothing active right now."
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
          label="At-risk clients"
          value={String(atRiskCount)}
          icon={ShieldAlert}
          tone={atRiskCount > 0 ? "danger" : "default"}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(3)}
          detail={{
            title: "At-Risk Clients",
            description: `${atRiskCount} client${atRiskCount === 1 ? "" : "s"}`,
            content: () => (
              <KpiPreviewList
                items={atRiskCompanies.map((c) => ({
                  id: c.id,
                  title: c.name,
                  subtitle: c.brand?.name ?? "No brand yet",
                  href: projectHrefForCompany(c.id, projects),
                }))}
                emptyMessage="No at-risk clients right now."
              />
            ),
          }}
          // Filter gap (Project Closure — Navigation Correction): Projects has no client-health
          // filter today, so "View all" lands on the plain list rather than a pre-filtered one.
          viewAllHref="/dashboard/projects"
        />
      </div>
      )}

      <NeedsAttentionStrip
        teamMembers={staff}
        teamTasks={tasks}
        atRiskCompanies={companies}
        projects={projects}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(4)}
      />

      {/* Density correction (Product Owner feedback) — the page's remaining content is now three
         explicitly labeled, visually separated groups instead of one continuous two-column scroll,
         so each section reads as its own answer to a specific question rather than one undifferentiated
         wall of cards. No card was removed or hidden; every widget below is the same component with
         the same data as before, just regrouped by what question it answers. */}
      <SectionBreak num="01" label="Performance Overview" />
      <FeaturedTrendCard
        title="Organization Completions — Last 7 Calendar Days"
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
          <TeamWorkloadCard members={staff} tasks={tasks} className={STAGGER_ITEM_CLASS} style={staggerDelay(0)} />
          <BrandSnapshotCard brands={brands} companies={companies} tasks={tasks} className={STAGGER_ITEM_CLASS} style={staggerDelay(1)} />
        </div>
        <ClientHealthOverviewCard companies={companies} projects={projects} className={STAGGER_ITEM_CLASS} style={staggerDelay(2)} />
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
            <UpcomingDeadlinesCard tasks={tasks} title="Organization Upcoming" />
          </div>
        </div>
      </div>

      <TaskDrawer
        taskId={drawerTaskId}
        onOpenChange={(open) => !open && setDrawerTaskId(null)}
        onChanged={refresh}
      />
    </div>
  );
}
