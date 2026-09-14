"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Grid3x3, LayoutList, Plus } from "lucide-react";
import type { User, TaskStatus } from "@/lib/data/types";
import { useMyTasks } from "@/lib/data/hooks/use-tasks";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import {
  useTaskFilters,
  filterTasks,
  useCompanyOptionsFromTasks,
  useWorkstreamOptionsFromTasks,
} from "@/lib/data/hooks/use-task-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionBreak } from "@/components/ui/section-break";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskFilterBar } from "@/components/tasks/task-filter-bar";
import { SavedViewsBar } from "@/components/tasks/saved-views-bar";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { RecentNotificationsCard } from "@/components/dashboard/recent-notifications-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { STATUS_ORDER, EMPTY_BUCKET_COPY, StatusBucketButton, usePersistedStatusBucket } from "@/components/my-day/status-bucket-button";
import { BucketTaskGrid } from "@/components/my-day/bucket-task-grid";
import { TodayTimeCard } from "@/components/my-day/today-time-card";
import { DailyUpdateCard } from "@/components/my-day/daily-update-card";
import { GreetingText } from "@/components/dashboard/greeting-heading";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { myDaySubtitle } from "@/lib/my-day-greeting";
import { findFocusTask } from "@/lib/my-day-focus";
import { isTaskClosed, isTaskInActiveProject } from "@/lib/data/task-display";
import { todayDateOnly, formatDateOnly, startOfWeekMonday } from "@/lib/planner-dates";
import { PlannerWeekView } from "@/components/planner/planner-week-view";
import { PlannerMonthView } from "@/components/planner/planner-month-view";
import { PlannerUnscheduledPanel } from "@/components/planner/planner-unscheduled-panel";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

type MyDayView = "today" | "week" | "month";
const VIEW_TABS: { key: MyDayView; label: string; icon: typeof CalendarDays }[] = [
  { key: "today", label: "Today", icon: CalendarDays },
  { key: "week", label: "Week", icon: LayoutList },
  { key: "month", label: "Month", icon: Grid3x3 },
];

interface EmployeeMyDayProps {
  user: User;
}

/**
 * Employee's redesigned My Day — a focused personal "today" hub: hero, clickable status buckets that
 * filter the task-card grid below, a combined today's-time/running-timer panel, and an Upcoming strip.
 * Distinct from the role-conditional `/dashboard` overview: this page is the person's own do-list, not
 * a summary dashboard. MVP Simplification Pass (boss feedback) — Planner's Week/Month schedule views
 * (and its Unscheduled-work disclosure) now live here as additional tabs alongside Today, reusing
 * those exact components; Planner as a separate page/nav item is retired (old links redirect here).
 * Week/Month deliberately do NOT apply Today's own Archived/Trashed-project "active work" narrowing —
 * they're a due-date schedule, not an active-work count, exactly matching Planner's own prior scope.
 */
export function EmployeeMyDay({ user }: EmployeeMyDayProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useMyTasks();
  const { runningTimer } = useRunningTimer();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [selectedStatus, setSelectedStatus] = usePersistedStatusBucket();
  const [view, setView] = useState<MyDayView>(() => {
    const viewParam = searchParams.get("view");
    return viewParam === "week" || viewParam === "month" ? viewParam : "today";
  });
  const [weekAnchor, setWeekAnchor] = useState(() => formatDateOnly(startOfWeekMonday(new Date())));
  const [monthAnchor, setMonthAnchor] = useState(() => todayDateOnly());
  const { filters, patch } = useTaskFilters("my-day");
  const companyOptions = useCompanyOptionsFromTasks(tasks);
  const workstreamOptions = useWorkstreamOptionsFromTasks(tasks);
  const runningTaskId = runningTimer?.taskId ?? null;

  function openTask(taskId: string) {
    router.push(`/dashboard/tasks/${taskId}`);
  }

  // MVP Gap Closure (boss feedback) — `view` was only ever read from `?view=` once, on mount; a tab
  // click updated local state but never the URL, so a Task opened from Week/Month and then returned
  // from via the Task page's own `router.back()` remounted My Day and re-read the (stale) URL, always
  // landing back on Today. Pushing a real history entry on every tab change (same pattern as the
  // Project detail page's own `?tab=`) fixes this and keeps Back/Forward working intuitively.
  function handleViewChange(next: MyDayView) {
    setView(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`/dashboard/my-day?${params.toString()}`, { scroll: false });
  }

  // Week/Month no longer have a dedicated arbitrary-date "Day" view to drill into (My Day's own
  // "Today" tab always means literally today) — clicking a day only switches tabs when that day
  // genuinely IS today; any other day's tasks are already visible inline in the Week/Month grid.
  function openDay(date: string) {
    if (date === todayDateOnly()) handleViewChange("today");
  }

  const today = todayDateString();

  // The status buckets are this page's primary organizing control — ignore any `status` a saved
  // view might carry (search/company/workstream/priority still apply) so the two mechanisms never
  // fight over which tasks are showing.
  const filteredTasks = filterTasks(tasks, { ...filters, status: "all" });
  // Final V1 Regression correction — an open Task whose own Project has been Archived/Trashed must
  // not keep showing as "active work" in these buckets; a Completed/Canceled Task's own historical
  // status bucket is untouched either way (Task Completed/Canceled semantics never change).
  const visibleTasks = filteredTasks.filter((t) => isTaskClosed(t.status) || isTaskInActiveProject(t));
  const countByStatus: Record<TaskStatus, number> = {
    "not-started": 0,
    "in-progress": 0,
    blocked: 0,
    waiting: 0,
    completed: 0,
    canceled: 0,
  };
  for (const task of visibleTasks) countByStatus[task.status]++;
  const bucketTasks = visibleTasks.filter((t) => t.status === selectedStatus);
  const focusTask = findFocusTask(tasks, today);

  const hasAnyTasks = tasks.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            <GreetingText fullName={user.fullName} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{myDaySubtitle(tasks, today)}</p>
        </div>
        <Button onClick={() => setTaskDialogOpen(true)} data-shortcut="new-task">
          <Plus /> Add task
        </Button>
      </div>

      <div className="flex items-center gap-0.5 self-start rounded-lg border p-0.5">
        {VIEW_TABS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            size="sm"
            variant={view === key ? "secondary" : "ghost"}
            aria-pressed={view === key}
            onClick={() => handleViewChange(key)}
          >
            <Icon /> {label}
          </Button>
        ))}
      </div>

      {view === "today" && <SearchTriggerBar variant="pill" placeholder="Search clients, tasks, actions…" />}

      {view === "today" &&
        (!tasksLoading && !hasAnyTasks ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nothing on your plate right now — add a task to get your day started.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {STATUS_ORDER.map((status, i) => (
                <StatusBucketButton
                  key={status}
                  status={status}
                  count={countByStatus[status]}
                  selected={selectedStatus === status}
                  onSelect={setSelectedStatus}
                  className={STAGGER_ITEM_CLASS}
                  style={staggerDelay(i)}
                />
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <TaskFilterBar
                filters={filters}
                onChange={patch}
                fields={["search", "company", "workstream", "priority"]}
                companies={companyOptions}
                workstreams={workstreamOptions}
                className="flex flex-wrap items-center gap-3"
              />
              <SavedViewsBar filters={filters} onApply={patch} />
            </div>

            <BucketTaskGrid
              user={user}
              tasks={bucketTasks}
              selectedStatus={selectedStatus}
              focusTaskId={focusTask?.id ?? null}
              onChanged={refreshTasks}
              emptyMessage={
                filteredTasks.length === tasks.length
                  ? EMPTY_BUCKET_COPY[selectedStatus]
                  : `No ${TASK_STATUS_SELECT_ITEMS[selectedStatus].toLowerCase()} tasks match your filters.`
              }
              onEdit={setEditingTask}
              onDeleted={refreshTasks}
            />
          </>
        ))}

      {(view === "week" || view === "month") && (
        <div className="flex flex-col gap-4">
          <TaskFilterBar
            filters={filters}
            onChange={patch}
            fields={["search", "company", "workstream", "priority"]}
            companies={companyOptions}
            workstreams={workstreamOptions}
            className="flex flex-wrap items-center gap-3"
          />
          {view === "week" ? (
            <PlannerWeekView
              anchorDate={weekAnchor}
              onAnchorDateChange={setWeekAnchor}
              onOpenDay={openDay}
              tasks={filteredTasks}
              onOpen={openTask}
              runningTaskId={runningTaskId}
              onEdit={setEditingTask}
              onDeleted={refreshTasks}
            />
          ) : (
            <PlannerMonthView
              anchorDate={monthAnchor}
              onAnchorDateChange={setMonthAnchor}
              onOpenDay={openDay}
              tasks={filteredTasks}
              onOpen={openTask}
              runningTaskId={runningTaskId}
              onEdit={setEditingTask}
              onDeleted={refreshTasks}
            />
          )}
          <PlannerUnscheduledPanel
            tasks={filteredTasks}
            onOpen={openTask}
            runningTaskId={runningTaskId}
            onEdit={setEditingTask}
            onDeleted={refreshTasks}
          />
        </div>
      )}

      <SectionBreak num="01" label="Time & Deadlines" />

      <div className="grid gap-4 lg:grid-cols-2">
        <TodayTimeCard className={STAGGER_ITEM_CLASS} style={staggerDelay(0)} />
        <UpcomingDeadlinesCard tasks={tasks} className={STAGGER_ITEM_CLASS} style={staggerDelay(1)} />
      </div>

      <SectionBreak num="02" label="Daily Update" />

      <DailyUpdateCard />

      <SectionBreak num="03" label="Activity" />

      <RecentNotificationsCard />

      <TaskFormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} mode="create" onSaved={refreshTasks} />
      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={refreshTasks}
        />
      )}
    </div>
  );
}
