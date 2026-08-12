"use client";

import type { User } from "@/lib/data/types";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useRecentHandoffs } from "@/lib/data/hooks/use-task-handoffs";
import { GreetingText } from "@/components/dashboard/greeting-heading";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { KpiPreviewList } from "@/components/dashboard/kpi-preview-list";
import { StatCard } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { TeamWorkloadCard } from "@/components/dashboard/team-workload-card";
import { ClientHealthOverviewCard } from "@/components/dashboard/client-health-overview-card";
import { TeamActivityCard } from "@/components/dashboard/team-activity-card";
import { BrandSnapshotCard } from "@/components/dashboard/brand-snapshot-card";
import { RecurringWorkDueCard } from "@/components/dashboard/recurring-work-due-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

export function SuperadminDashboard({ user }: { user: User }) {
  const { tasks } = useTasks();
  const { companies } = useCompanies();
  const { workstreams } = useWorkstreams();
  const { brands, assignableStaff } = useCompanyLookups();
  const { handoffs } = useRecentHandoffs();

  const staff = assignableStaff.filter((u) => u.id !== user.id);

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const activeTaskCount = activeTasks.length;
  const atRiskCompanies = companies.filter((c) => c.health.status === "at-risk");
  const atRiskCount = atRiskCompanies.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          <GreetingText fullName={user.fullName} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Org-wide visibility across every client, team, and brand.</p>
        <SearchTriggerBar
          variant="hero"
          placeholder="Search clients, tasks, actions…"
          className="mt-4 max-w-2xl"
        />
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total clients"
          value={String(companies.length)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(0)}
          preview={
            <KpiPreviewList
              items={companies.slice(0, 4).map((c) => ({
                id: c.id,
                title: c.name,
                subtitle: c.brand.name,
                href: `/dashboard/companies/${c.id}`,
              }))}
              emptyMessage="No clients yet."
            />
          }
          viewAllHref="/dashboard/companies"
        />
        <StatCard
          label="Total staff"
          value={String(assignableStaff.length)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(1)}
          preview={
            <KpiPreviewList
              items={assignableStaff.slice(0, 4).map((s) => ({
                id: s.id,
                title: s.fullName,
                subtitle: ROLE_LABELS[s.role],
              }))}
              emptyMessage="No staff yet."
            />
          }
        />
        <StatCard
          label="Active tasks"
          value={String(activeTaskCount)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(2)}
          preview={
            <KpiPreviewList
              items={activeTasks.slice(0, 4).map((t) => ({
                id: t.id,
                title: t.title,
                subtitle: t.company.name,
                href: `/dashboard/tasks/${t.id}`,
              }))}
              emptyMessage="Nothing active right now."
            />
          }
          viewAllHref="/dashboard/tasks?active=1"
        />
        <StatCard
          label="At-risk clients"
          value={String(atRiskCount)}
          tone={atRiskCount > 0 ? "danger" : "default"}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(3)}
          preview={
            <KpiPreviewList
              items={atRiskCompanies.slice(0, 4).map((c) => ({
                id: c.id,
                title: c.name,
                subtitle: c.brand.name,
                href: `/dashboard/companies/${c.id}`,
              }))}
              emptyMessage="No at-risk clients right now."
            />
          }
          viewAllHref="/dashboard/companies?health=at-risk"
        />
      </div>

      <SectionBreak num="01" label="Overview" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamWorkloadCard members={staff} tasks={tasks} />
        </div>
        <ClientHealthOverviewCard companies={companies} className={STAGGER_ITEM_CLASS} style={staggerDelay(1)} />
      </div>

      <SectionBreak num="02" label="Across Brands & Activity" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <TeamActivityCard tasks={tasks} handoffs={handoffs} title="Recent Firm Activity" />
        </div>
        <div className={cn("flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <BrandSnapshotCard brands={brands} companies={companies} tasks={tasks} />
          <RecurringWorkDueCard workstreams={workstreams} />
          <UpcomingDeadlinesCard tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
