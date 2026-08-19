"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Grid3x3, LayoutList, Users } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import {
  useTaskFilters,
  filterTasks,
  useProjectOptionsFromTasks,
  useActivityOptionsFromTasks,
} from "@/lib/data/hooks/use-task-filters";
import { isEmployee, isSupervisor } from "@/lib/data/permissions";
import type { TaskGroupBy } from "@/lib/data/types";
import { todayDateOnly, formatDateOnly, startOfWeekMonday } from "@/lib/planner-dates";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TaskFilterBar, type TaskFilterField } from "@/components/tasks/task-filter-bar";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { PlannerDayView } from "@/components/planner/planner-day-view";
import { PlannerWeekView } from "@/components/planner/planner-week-view";
import { PlannerMonthView } from "@/components/planner/planner-month-view";
import { PlannerGroupView } from "@/components/planner/planner-group-view";
import { PlannerUnscheduledPanel } from "@/components/planner/planner-unscheduled-panel";

type PlannerView = "day" | "week" | "month" | "group";

export default function PlannerPage() {
  const { user } = useAuth();
  const { tasks, isLoading, refresh } = useTasks();
  const { companies } = useCompanies();
  const { workstreams } = useWorkstreams();
  const { assignableStaff } = useCompanyLookups();
  const { runningTimer, refresh: refreshRunningTimer } = useRunningTimer();

  const [view, setView] = useState<PlannerView>("day");
  const [selectedDate, setSelectedDate] = useState(() => todayDateOnly());
  const [weekAnchor, setWeekAnchor] = useState(() => formatDateOnly(startOfWeekMonday(new Date())));
  const [monthAnchor, setMonthAnchor] = useState(() => todayDateOnly());
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("project");
  const [teamScope, setTeamScope] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const { filters, patch } = useTaskFilters();

  // Supervisor is an Employee first — Planner opens on their own operational planning by default.
  // "Team" is an explicit, additional scope they opt into, never the default; Employee has no team
  // scope at all (their own list from the provider already IS their own work); Superadmin already
  // gets the organization-wide list from the provider, with no personal-work identity to default to.
  const supervisorView = user != null && isSupervisor(user);
  const ownOnly = supervisorView && !teamScope;
  const scopedTasks = ownOnly && user ? tasks.filter((t) => t.assignees.some((a) => a.id === user.id)) : tasks;

  // Every hook below must run unconditionally, in the same order, on every render — the `!user`
  // guard therefore comes AFTER them, not before (a hook can never follow an early return).
  const filteredTasks = useMemo(() => filterTasks(scopedTasks, { ...filters, status: "all" }), [scopedTasks, filters]);
  const projectOptions = useProjectOptionsFromTasks(scopedTasks);
  const activityOptions = useActivityOptionsFromTasks(scopedTasks);

  if (!user) return null;

  const employeeView = isEmployee(user);
  const runningTaskId = runningTimer?.taskId ?? null;
  const filterFields: TaskFilterField[] = [
    "search",
    "project",
    "workstream",
    "activity",
    "priority",
    ...(employeeView ? [] : (["assignee"] as TaskFilterField[])),
  ];
  const showAssignee = !employeeView && (teamScope || !supervisorView);

  const VIEW_TABS: { key: PlannerView; label: string; icon: typeof CalendarDays }[] = [
    { key: "day", label: "Day", icon: CalendarDays },
    { key: "week", label: "Week", icon: LayoutList },
    { key: "month", label: "Month", icon: Grid3x3 },
    { key: "group", label: "Group", icon: Users },
  ];

  function openDay(date: string) {
    setSelectedDate(date);
    setView("day");
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Planner</h1>
          <p className="text-sm text-muted-foreground">
            {employeeView
              ? "When your own work is planned across time."
              : supervisorView
                ? ownOnly
                  ? "Your own planned work — switch to Team to see your direct reports' too."
                  : "Your team's planned work, including your own."
                : "Planned work across the organization."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {supervisorView && (
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
              <Button size="sm" variant={ownOnly ? "secondary" : "ghost"} aria-pressed={ownOnly} onClick={() => setTeamScope(false)}>
                My work
              </Button>
              <Button size="sm" variant={!ownOnly ? "secondary" : "ghost"} aria-pressed={!ownOnly} onClick={() => setTeamScope(true)}>
                Team
              </Button>
            </div>
          )}
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
            {VIEW_TABS.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                size="sm"
                variant={view === key ? "secondary" : "ghost"}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                <Icon /> {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <TaskFilterBar
          filters={filters}
          onChange={patch}
          fields={filterFields}
          projects={projectOptions}
          companies={companies}
          workstreams={workstreams}
          activities={activityOptions}
          assignableStaff={assignableStaff}
          searchPlaceholder="Search planned tasks…"
        />

        {isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading planned tasks…</p>
        ) : (
          <>
            {view === "day" && (
              <PlannerDayView
                selectedDate={selectedDate}
                onSelectedDateChange={setSelectedDate}
                tasks={filteredTasks}
                onOpen={setDrawerTaskId}
                runningTaskId={runningTaskId}
                showAssignee={showAssignee}
              />
            )}
            {view === "week" && (
              <PlannerWeekView
                anchorDate={weekAnchor}
                onAnchorDateChange={setWeekAnchor}
                onOpenDay={openDay}
                tasks={filteredTasks}
                onOpen={setDrawerTaskId}
                runningTaskId={runningTaskId}
              />
            )}
            {view === "month" && (
              <PlannerMonthView
                anchorDate={monthAnchor}
                onAnchorDateChange={setMonthAnchor}
                onOpenDay={openDay}
                tasks={filteredTasks}
                onOpen={setDrawerTaskId}
                runningTaskId={runningTaskId}
              />
            )}
            {view === "group" && (
              <PlannerGroupView
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
                tasks={filteredTasks}
                onOpen={setDrawerTaskId}
                runningTaskId={runningTaskId}
                showAssignee={showAssignee}
                allowAssigneeGrouping={!employeeView}
              />
            )}

            {view !== "group" && (
              <PlannerUnscheduledPanel tasks={filteredTasks} onOpen={setDrawerTaskId} runningTaskId={runningTaskId} />
            )}
          </>
        )}
      </Card>

      <TaskDrawer
        taskId={drawerTaskId}
        onOpenChange={(open) => !open && setDrawerTaskId(null)}
        onChanged={refresh}
        onTimerChanged={refreshRunningTimer}
      />
    </div>
  );
}
