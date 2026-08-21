"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { User, TaskStatus } from "@/lib/data/types";
import { useMyTasks } from "@/lib/data/hooks/use-tasks";
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
import { TaskFilterBar } from "@/components/tasks/task-filter-bar";
import { SavedViewsBar } from "@/components/tasks/saved-views-bar";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { RecentNotificationsCard } from "@/components/dashboard/recent-notifications-card";
import { UpcomingDeadlinesCard } from "@/components/dashboard/upcoming-deadlines-card";
import { STATUS_ORDER, EMPTY_BUCKET_COPY, StatusBucketButton } from "@/components/my-day/status-bucket-button";
import { BucketTaskGrid } from "@/components/my-day/bucket-task-grid";
import { TodayTimeCard } from "@/components/my-day/today-time-card";
import { DailyVisitHoursCard } from "@/components/my-day/daily-visit-hours-card";
import { DailyUpdateCard } from "@/components/my-day/daily-update-card";
import { GreetingText } from "@/components/dashboard/greeting-heading";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { myDaySubtitle } from "@/lib/my-day-greeting";
import { findFocusTask } from "@/lib/my-day-focus";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

interface EmployeeMyDayProps {
  user: User;
}

/**
 * Employee's redesigned My Day — a focused personal "today" hub: hero, clickable status buckets that
 * filter the task-card grid below, a combined today's-time/running-timer panel, and an Upcoming strip.
 * Distinct from the role-conditional `/dashboard` overview: this page is the person's own do-list, not
 * a summary dashboard.
 */
export function EmployeeMyDay({ user }: EmployeeMyDayProps) {
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useMyTasks();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>("in-progress");
  const { filters, patch } = useTaskFilters();
  const companyOptions = useCompanyOptionsFromTasks(tasks);
  const workstreamOptions = useWorkstreamOptionsFromTasks(tasks);

  const today = todayDateString();

  // The status buckets are this page's primary organizing control — ignore any `status` a saved
  // view might carry (search/company/workstream/priority still apply) so the two mechanisms never
  // fight over which tasks are showing.
  const filteredTasks = filterTasks(tasks, { ...filters, status: "all" });
  const countByStatus: Record<TaskStatus, number> = {
    todo: 0,
    "in-progress": 0,
    blocked: 0,
    "waiting-on-client": 0,
    done: 0,
  };
  for (const task of filteredTasks) countByStatus[task.status]++;
  const bucketTasks = filteredTasks.filter((t) => t.status === selectedStatus);
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

      <SearchTriggerBar variant="pill" placeholder="Search clients, tasks, actions…" />

      {!tasksLoading && !hasAnyTasks ? (
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
          />
        </>
      )}

      <SectionBreak num="01" label="Time & Deadlines" />

      <div className="grid gap-4 lg:grid-cols-2">
        <TodayTimeCard className={STAGGER_ITEM_CLASS} style={staggerDelay(0)} />
        <UpcomingDeadlinesCard tasks={tasks} className={STAGGER_ITEM_CLASS} style={staggerDelay(1)} />
      </div>

      <DailyVisitHoursCard className={STAGGER_ITEM_CLASS} style={staggerDelay(2)} />

      <SectionBreak num="02" label="Daily Update" />

      <DailyUpdateCard />

      <SectionBreak num="03" label="Activity" />

      <RecentNotificationsCard />

      <TaskFormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} mode="create" onSaved={refreshTasks} />
    </div>
  );
}
