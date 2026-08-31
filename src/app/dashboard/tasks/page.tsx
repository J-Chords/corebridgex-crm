"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Bookmark, LayoutGrid, List as ListIcon, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useRunningTimer } from "@/lib/data/hooks/use-time-entries";
import {
  useTaskFilters,
  filterTasks,
  groupTasksBy,
  useProjectOptionsFromTasks,
  useActivityOptionsFromTasks,
} from "@/lib/data/hooks/use-task-filters";
import { isEmployee } from "@/lib/data/permissions";
import { isAssigneeColumnRedundantForViewer } from "@/lib/data/task-display";
import type { TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskFilterBar } from "@/components/tasks/task-filter-bar";
import { TaskStatusQuickFilters } from "@/components/tasks/task-status-quick-filters";
import { SavedViewsBar } from "@/components/tasks/saved-views-bar";
import { TaskGroupBySelect } from "@/components/tasks/task-group-by-select";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskListSection, FlatTaskList } from "@/components/tasks/task-list-section";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";

const VALID_STATUSES: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

type TaskView = "board" | "list";

export default function TasksPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksPageContent() {
  const { user } = useAuth();
  const { tasks, isLoading, refresh } = useTasks();
  const { companies } = useCompanies();
  const { workstreams } = useWorkstreams();
  const { assignableStaff } = useCompanyLookups();
  const { runningTimer } = useRunningTimer();
  const searchParams = useSearchParams();

  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] = useState<TaskStatus | undefined>(undefined);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  // Phase 12B final correction — List is the default Tasks Home view for every role; Board remains
  // one click away. Local component state only (no persisted user preference exists in the
  // current data model — per instruction, not inventing one), so this always starts fresh at
  // List on every page load.
  const [view, setView] = useState<TaskView>("list");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { filters, patch } = useTaskFilters();

  // Seeds this page's filter from a KPI-card "view full details" link (e.g. /dashboard/tasks?status=done)
  // — one-time on mount, same `patch` the filter bar itself already calls, no change to useTaskFilters.
  const [runningOnly, setRunningOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(() => searchParams.get("overdue") === "1");
  const [dueTodayOnly, setDueTodayOnly] = useState(() => searchParams.get("due") === "today");
  useEffect(() => {
    const status = searchParams.get("status");
    if (status && VALID_STATUSES.includes(status as TaskStatus)) {
      patch({ status: status as TaskStatus });
    }
    // Phase 8E — same one-time deep-link seeding, for a Supervisor/Superadmin dashboard card
    // drilling down to one team member's own tasks (e.g. Team Workload's per-person row).
    const assignee = searchParams.get("assignee");
    if (assignee) patch({ assigneeId: assignee });
    // Phase 12B — List's own default grouping is Status (Reference 1); this only sets the initial
    // value for THIS page's own `useTaskFilters()` instance, never the shared default other screens
    // (My Day/Planner/employee dashboard) get from their own separate calls to the same hook.
    patch({ groupBy: "status" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Running is a quick VIEW, not a stored-status narrowing — it must never fight with the status
  // pill row. Picking a stored status (or "All") always turns Running off first, since a Task can
  // move between statuses in the background: the exact reported bug was a Todo task flipping to
  // In Progress the moment its timer started, which would otherwise still fail a lingering "Todo"
  // status filter even though the Running toggle itself was correctly on. Turning Running on always
  // resets the status filter to "All" for the same reason, in the other direction — so the two
  // controls can never simultaneously disagree about what should be visible.
  function handleStatusPillChange(status: TaskStatus | "all") {
    patch({ status });
    if (runningOnly) setRunningOnly(false);
  }

  function handleRunningChange(value: boolean) {
    setRunningOnly(value);
    if (value && filters.status !== "all") patch({ status: "all" });
  }

  function handleApplySavedView(next: typeof filters) {
    patch(next);
    if (next.status !== "all" && runningOnly) setRunningOnly(false);
  }

  function openCreate(defaultStatus?: TaskStatus) {
    setCreateDefaultStatus(defaultStatus);
    setCreateOpen(true);
  }

  // "active" doesn't map onto a single TaskStatus value (it spans several), so it's a separate,
  // purely additive narrowing on top of the normal filters — not part of `TaskFilters` at all, same
  // as before. Running/Overdue are the Task Center's own quick-filter toggles (Section 6/7):
  // genuinely derived state (active timer, due date), never new stored statuses.
  const activeOnly = searchParams.get("active") === "1";
  const today = todayDateString();
  const runningTaskId = runningTimer?.taskId ?? null;

  const beforeStatusFilter = useMemo(() => filterTasks(tasks, { ...filters, status: "all" }), [tasks, filters]);
  const filtered = useMemo(() => {
    let result = filterTasks(tasks, filters);
    if (activeOnly) result = result.filter((t) => t.status !== "done");
    if (runningOnly) result = result.filter((t) => t.id === runningTaskId);
    if (overdueOnly) result = result.filter((t) => t.status !== "done" && t.dueDate != null && t.dueDate < today);
    if (dueTodayOnly) result = result.filter((t) => t.status !== "done" && t.dueDate === today);
    return result;
  }, [tasks, filters, activeOnly, runningOnly, overdueOnly, dueTodayOnly, runningTaskId, today]);
  const groups = useMemo(
    () => (filters.groupBy === "none" ? [] : groupTasksBy(filtered, filters.groupBy)),
    [filtered, filters.groupBy]
  );

  // Phase 13B final polish (Part B) — Supervisor/Superadmin always keep the Assignee column (they
  // need to tell their own work apart from their team's); an Employee only loses it when every
  // currently-displayed Task is genuinely just "assigned to me" — audited per render, never a
  // blanket per-role hide.
  const showAssignee = user && isEmployee(user) ? !isAssigneeColumnRedundantForViewer(filtered, user.id) : true;

  const statusCounts = {
    all: beforeStatusFilter.length,
    todo: 0,
    "in-progress": 0,
    blocked: 0,
    "waiting-on-client": 0,
    done: 0,
    running: beforeStatusFilter.filter((t) => t.id === runningTaskId).length,
    overdue: beforeStatusFilter.filter((t) => t.status !== "done" && t.dueDate != null && t.dueDate < today).length,
    dueToday: beforeStatusFilter.filter((t) => t.status !== "done" && t.dueDate === today).length,
  };
  for (const task of beforeStatusFilter) statusCounts[task.status]++;

  const projectOptions = useProjectOptionsFromTasks(tasks);
  const activityOptions = useActivityOptionsFromTasks(tasks);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!user) return null;

  const employeeView = isEmployee(user);
  const filterFields = [
    "project" as const,
    "company" as const,
    "workstream" as const,
    "activity" as const,
    "priority" as const,
    ...(employeeView ? [] : (["assignee"] as const)),
  ];
  const groupByOptions = (["none", "status", "project", "company", "workstream", "activity", ...(employeeView ? [] : ["assignee" as const])] as const);

  // Phase 12B — badge count for the compact "Filters" popover trigger: every narrowing filter that's
  // not at its default value, plus the two derived quick toggles. Purely a display count — the real
  // filtering logic (`filterTasks`) is completely untouched.
  const activeFilterCount =
    (filters.projectId !== "all" ? 1 : 0) +
    (filters.companyId !== "all" ? 1 : 0) +
    (filters.workstreamId !== "all" ? 1 : 0) +
    (filters.activityId !== "all" ? 1 : 0) +
    (filters.priority !== "all" ? 1 : 0) +
    (filters.assigneeId !== "all" ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (runningOnly ? 1 : 0) +
    (overdueOnly ? 1 : 0) +
    (dueTodayOnly ? 1 : 0);

  // Phase 8B — open to every role. The real access boundary is the Task query itself
  // (RLS/permissions already scope results to Employee's own assigned work, Supervisor's own +
  // team, Superadmin's org-wide view), not a page-level gate — removing this gate is a UI change
  // only, the underlying data was already correctly scoped per viewer.
  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {employeeView
              ? "Your own accessible and assigned tasks."
              : user.role === "supervisor"
                ? "Your own tasks, plus tasks assigned across your team."
                : "Every task across the org."}
          </p>
        </div>
        <Button onClick={() => openCreate()} data-shortcut="new-task">
          <Plus /> New Task
        </Button>
      </div>

      <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
        <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} aria-pressed={view === "list"} onClick={() => setView("list")}>
          <ListIcon /> List
        </Button>
        <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} aria-pressed={view === "board"} onClick={() => setView("board")}>
          <LayoutGrid /> Board
        </Button>
      </div>

      {/* Phase 12B — one compact toolbar row (Reference 1): grouping/filtering/saved-views on the
          left, search on the right — replacing the old always-open quick-filter strip + filter form
          + saved-views strip stacked as three separate blocks. Every control here is the exact same
          existing functionality (TaskStatusQuickFilters/TaskFilterBar/SavedViewsBar), just tucked
          into popovers instead of always rendered inline. */}
      <div className="flex flex-wrap items-center gap-2">
        {view === "list" && (
          <TaskGroupBySelect value={filters.groupBy} onChange={(groupBy) => patch({ groupBy })} options={[...groupByOptions]} />
        )}
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            <SlidersHorizontal /> Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 font-mono">
                {activeFilterCount}
              </Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <div className="flex flex-col gap-3">
              <TaskStatusQuickFilters
                status={filters.status}
                onStatusChange={handleStatusPillChange}
                runningOnly={runningOnly}
                onRunningChange={handleRunningChange}
                overdueOnly={overdueOnly}
                onOverdueChange={setOverdueOnly}
                dueTodayOnly={dueTodayOnly}
                onDueTodayChange={setDueTodayOnly}
                counts={statusCounts}
              />
              <Separator />
              <TaskFilterBar
                filters={filters}
                onChange={patch}
                fields={filterFields}
                projects={projectOptions}
                companies={companies}
                workstreams={workstreams}
                activities={activityOptions}
                assignableStaff={assignableStaff}
                className="flex flex-col items-stretch gap-2"
              />
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            <Bookmark /> Views
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <SavedViewsBar filters={filters} onApply={handleApplySavedView} />
          </PopoverContent>
        </Popover>
        <div className="relative ml-auto min-w-48">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Search tasks…"
            className="h-8 pl-8"
            aria-label="Search tasks"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading tasks…</p>
      ) : view === "board" ? (
        <TaskBoard user={user} tasks={filtered} onChanged={refresh} runningTaskId={runningTaskId} />
      ) : filters.groupBy === "none" ? (
        filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">No tasks match this view.</Card>
        ) : (
          <FlatTaskList
            tasks={filtered}
            allTasks={tasks}
            runningTaskId={runningTaskId}
            showAssignee={showAssignee}
            onEdit={setEditingTask}
            onDeleted={refresh}
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {groups.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">No tasks match this view.</Card>
          )}
          {groups.map((group) => (
            <TaskListSection
              key={group.key}
              group={group}
              groupBy={filters.groupBy}
              allTasks={tasks}
              runningTaskId={runningTaskId}
              isCollapsed={collapsedGroups.has(group.key)}
              onToggleCollapse={() => toggleGroup(group.key)}
              onAddTask={openCreate}
              showAssignee={showAssignee}
              onEdit={setEditingTask}
              onDeleted={refresh}
            />
          ))}
        </div>
      )}

      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        defaultStatus={createDefaultStatus}
        onSaved={refresh}
      />
      {editingTask && (
        <TaskFormDialog
          open={Boolean(editingTask)}
          onOpenChange={(open) => !open && setEditingTask(null)}
          mode="edit"
          task={editingTask}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
