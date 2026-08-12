"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, Plus, Square } from "lucide-react";
import type { User } from "@/lib/data/types";
import { useMyTasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useMyTimeEntries } from "@/lib/data/hooks/use-time-entries";
import { useElapsedSeconds } from "@/lib/data/hooks/use-elapsed-seconds";
import {
  useTaskFilters,
  filterTasks,
  useCompanyOptionsFromTasks,
  useWorkstreamOptionsFromTasks,
} from "@/lib/data/hooks/use-task-filters";
import { timeEntriesProvider } from "@/lib/data/providers";
import { formatMinutes } from "@/lib/format-minutes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { SectionBreak } from "@/components/ui/section-break";
import { TaskRowList } from "@/components/tasks/task-row";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskFilterBar } from "@/components/tasks/task-filter-bar";
import { SavedViewsBar } from "@/components/tasks/saved-views-bar";
import { TaskStatusDonut } from "@/components/tasks/task-status-donut";
import { RecentNotificationsCard } from "@/components/dashboard/recent-notifications-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { WorkstreamOverviewCard } from "@/components/workstreams/workstream-overview-card";
import { GreetingText } from "@/components/dashboard/greeting-heading";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { KpiPreviewList } from "@/components/dashboard/kpi-preview-list";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function EmployeeDashboard({ user }: { user: User }) {
  const { tasks, isLoading, refresh } = useMyTasks();
  const { workstreams } = useWorkstreams();
  const { entries, refresh: refreshEntries } = useMyTimeEntries();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const { filters, patch } = useTaskFilters();
  const companyOptions = useCompanyOptionsFromTasks(tasks);
  const workstreamOptions = useWorkstreamOptionsFromTasks(tasks);
  const filteredTasks = filterTasks(tasks, filters);

  const runningEntry = entries.find((e) => e.durationMinutes === null) ?? null;
  const elapsedSeconds = useElapsedSeconds(runningEntry?.startTime ?? null);

  const today = todayDateString();
  const sevenDaysAgoIso = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const activeWorkstreams = workstreams.filter((w) => w.status === "active");

  const openTasks = tasks.filter((t) => t.status !== "done");
  const dueTodayTasks = openTasks.filter((t) => t.dueDate === today);
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const dueTodayCount = dueTodayTasks.length;
  const overdueCount = overdueTasks.length;

  const weekEntries = entries.filter((e) => e.durationMinutes !== null && e.startTime >= sevenDaysAgoIso);
  const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  // Peek content for the "Hours logged this week" KPI — per-task breakdown of the same entries.
  const minutesByTask = new Map<string, { title: string; minutes: number }>();
  for (const entry of weekEntries) {
    const existing = minutesByTask.get(entry.task.id);
    if (existing) existing.minutes += entry.durationMinutes ?? 0;
    else minutesByTask.set(entry.task.id, { title: entry.task.title, minutes: entry.durationMinutes ?? 0 });
  }
  const topTasksByTime = Array.from(minutesByTask.entries()).sort((a, b) => b[1].minutes - a[1].minutes);

  async function handleStopTimer() {
    if (!runningEntry) return;
    setIsStopping(true);
    try {
      await timeEntriesProvider.stopTimer(user, runningEntry.id);
      await refreshEntries();
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
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s on your plate today.</p>
        <SearchTriggerBar
          variant="hero"
          placeholder="Search clients, tasks, actions…"
          className="mt-4 max-w-2xl"
        />
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="My open tasks"
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
          viewAllHref="/dashboard/my-day"
        />
        <StatCard
          label="Due today"
          value={String(dueTodayCount)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(1)}
          preview={
            <KpiPreviewList
              items={dueTodayTasks.slice(0, 4).map((t) => ({
                id: t.id,
                title: t.title,
                subtitle: t.company.name,
                href: `/dashboard/tasks/${t.id}`,
              }))}
              emptyMessage="Nothing due today."
            />
          }
          viewAllHref="/dashboard/my-day"
        />
        <StatCard
          label="Overdue"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? "warning" : "default"}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(2)}
          preview={
            <KpiPreviewList
              items={overdueTasks.slice(0, 4).map((t) => ({
                id: t.id,
                title: t.title,
                subtitle: t.company.name,
                href: `/dashboard/tasks/${t.id}`,
              }))}
              emptyMessage="Nothing overdue — nice work."
            />
          }
          viewAllHref="/dashboard/my-day"
        />
        <StatCard
          label="Hours logged this week"
          value={formatMinutes(weekMinutes)}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(3)}
          preview={
            <KpiPreviewList
              items={topTasksByTime.slice(0, 4).map(([taskId, info]) => ({
                id: taskId,
                title: info.title,
                subtitle: formatMinutes(info.minutes),
                href: `/dashboard/tasks/${taskId}`,
              }))}
              emptyMessage="No time logged yet this week."
            />
          }
        />
      </div>

      <SectionBreak num="01" label="My Workstreams" />

      {activeWorkstreams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active workstreams right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

      <SectionBreak num="02" label="Today" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={cn("lg:col-span-2", STAGGER_ITEM_CLASS)} style={staggerDelay(0)}>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
              My Tasks
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setTaskDialogOpen(true)} data-shortcut="new-task">
              <Plus /> Add task
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {tasks.length > 0 && (
              <div className="flex flex-col gap-3">
                <TaskFilterBar
                  filters={filters}
                  onChange={patch}
                  fields={["search", "company", "workstream", "status", "priority"]}
                  companies={companyOptions}
                  workstreams={workstreamOptions}
                />
                <SavedViewsBar filters={filters} onApply={patch} />
              </div>
            )}
            <TaskRowList
              tasks={filteredTasks}
              isLoading={isLoading}
              emptyMessage={
                tasks.length === 0
                  ? "Nothing assigned to you yet — add your own task to get started."
                  : "No tasks match your filters."
              }
              subtitleFor={(task) => `${task.company.name} · ${task.workstream.name}`}
            />
          </CardContent>
        </Card>

        <div className={cn("flex flex-col gap-4", STAGGER_ITEM_CLASS)} style={staggerDelay(1)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Time this week</CardTitle>
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

          <UpcomingDeadlinesCard tasks={tasks} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Tasks by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskStatusDonut tasks={tasks} />
            </CardContent>
          </Card>
        </div>
      </div>

      <SectionBreak num="03" label="Activity" />

      <RecentNotificationsCard />

      <TaskFormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} mode="create" onSaved={refresh} />
    </div>
  );
}
