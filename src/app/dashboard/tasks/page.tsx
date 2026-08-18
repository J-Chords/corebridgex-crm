"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, LayoutGrid, List as ListIcon, Play, Plus } from "lucide-react";
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
import type { TaskGroupBy, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { TaskFilterBar, type TaskFilterField } from "@/components/tasks/task-filter-bar";
import { TaskStatusQuickFilters } from "@/components/tasks/task-status-quick-filters";
import { SavedViewsBar } from "@/components/tasks/saved-views-bar";
import { TaskGroupBySelect } from "@/components/tasks/task-group-by-select";
import { TaskGridCard } from "@/components/tasks/task-grid-card";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const VALID_STATUSES: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];
const GROUP_BY_OPTIONS: TaskGroupBy[] = ["none", "project", "company", "workstream", "activity", "status", "assignee"];

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

type TaskView = "list" | "board";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
  const { runningTimer, refresh: refreshRunningTimer } = useRunningTimer();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<TaskView>("list");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { filters, patch } = useTaskFilters();
  // Whether THIS page instance pushed the drawer's own history entry — if so, closing goes back to
  // undo exactly that; if the drawer was instead opened by landing directly on a shared `?task=`
  // URL, there's nothing of ours to go back to, so closing replaces the URL instead. The smallest
  // robust option after weighing a heavier client-routing/modal-route setup: a single query param
  // the drawer's own open state derives from, so a refresh never corrupts the underlying list/board
  // (it's just re-derived from the same URL), and a shared deep link always opens the right Task.
  const pushedDrawerEntry = useRef(false);

  // Seeds this page's filter from a KPI-card "view full details" link (e.g. /dashboard/tasks?status=done)
  // — one-time on mount, same `patch` the filter bar itself already calls, no change to useTaskFilters.
  const [runningOnly, setRunningOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(() => searchParams.get("overdue") === "1");
  useEffect(() => {
    const status = searchParams.get("status");
    if (status && VALID_STATUSES.includes(status as TaskStatus)) {
      patch({ status: status as TaskStatus });
    }
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

  const drawerTaskId = searchParams.get("task");

  function openDrawer(taskId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", taskId);
    pushedDrawerEntry.current = true;
    router.push(`${pathname}?${params.toString()}`);
  }

  function closeDrawer() {
    if (pushedDrawerEntry.current) {
      pushedDrawerEntry.current = false;
      router.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
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
    return result;
  }, [tasks, filters, activeOnly, runningOnly, overdueOnly, runningTaskId, today]);
  const groups = useMemo(
    () => (filters.groupBy === "none" ? [] : groupTasksBy(filtered, filters.groupBy)),
    [filtered, filters.groupBy]
  );

  const statusCounts = {
    all: beforeStatusFilter.length,
    todo: 0,
    "in-progress": 0,
    blocked: 0,
    "waiting-on-client": 0,
    done: 0,
    running: beforeStatusFilter.filter((t) => t.id === runningTaskId).length,
    overdue: beforeStatusFilter.filter((t) => t.status !== "done" && t.dueDate != null && t.dueDate < today).length,
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

  function renderTaskRow(task: TaskWithRelations, index: number) {
    const isOverdue = task.status !== "done" && task.dueDate != null && task.dueDate < today;
    return (
      <TableRow
        key={task.id}
        className={cn("cursor-pointer", STAGGER_ITEM_CLASS)}
        style={staggerDelay(index)}
        onClick={() => openDrawer(task.id)}
      >
        <TableCell className="max-w-64 font-medium whitespace-normal">
          <span className="inline-flex items-center gap-1.5 hover:underline">
            {task.id === runningTaskId && <Play className="size-3 shrink-0" style={{ color: "var(--info)" }} aria-hidden="true" />}
            {task.title}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">
          <span className="flex flex-wrap items-center gap-1 text-xs">
            {task.workstream.projectName && <span>{task.workstream.projectName}</span>}
            {task.workstream.projectName && <span className="text-muted-foreground/50">→</span>}
            <span>{task.workstream.name}</span>
            {task.activity && (
              <>
                <span className="text-muted-foreground/50">→</span>
                <span>{task.activity.name}</span>
              </>
            )}
          </span>
        </TableCell>
        <TableCell>
          <TaskStatusBadge status={task.status} />
        </TableCell>
        <TableCell>
          <TaskPriorityBadge priority={task.priority} />
        </TableCell>
        <TableCell className="text-muted-foreground">
          {task.assignees.map((a) => a.fullName).join(", ") || "—"}
        </TableCell>
        <TableCell className={isOverdue ? "font-medium text-warning" : "text-muted-foreground"}>
          {formatDate(task.dueDate)}
        </TableCell>
        <TableCell className="min-w-32">
          <ChecklistProgress
            done={task.checklistItems.filter((c) => c.isDone).length}
            total={task.checklistItems.length}
          />
        </TableCell>
      </TableRow>
    );
  }

  if (!user) return null;

  const employeeView = isEmployee(user);
  const filterFields: TaskFilterField[] = [
    "search",
    "project",
    "company",
    "workstream",
    "activity",
    "priority",
    ...(employeeView ? [] : (["assignee"] as TaskFilterField[])),
  ];
  const groupByOptions = employeeView ? GROUP_BY_OPTIONS.filter((g) => g !== "assignee") : GROUP_BY_OPTIONS;

  // Phase 8B — open to every role. The real access boundary is the Task query itself
  // (RLS/permissions already scope results to Employee's own assigned work, Supervisor's own +
  // team, Superadmin's org-wide view), not a page-level gate — removing this gate is a UI change
  // only, the underlying data was already correctly scoped per viewer.
  return (
    <div className="flex flex-col gap-6">
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
            <Button
              size="sm"
              variant={view === "list" ? "secondary" : "ghost"}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <ListIcon /> List
            </Button>
            <Button
              size="sm"
              variant={view === "board" ? "secondary" : "ghost"}
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
            >
              <LayoutGrid /> Board
            </Button>
          </div>
          {view === "list" && (
            <TaskGroupBySelect value={filters.groupBy} onChange={(groupBy) => patch({ groupBy })} options={groupByOptions} />
          )}
          <Button onClick={() => setCreateOpen(true)} data-shortcut="new-task">
            <Plus /> New Task
          </Button>
        </div>
      </div>

      <TaskStatusQuickFilters
        status={filters.status}
        onStatusChange={handleStatusPillChange}
        runningOnly={runningOnly}
        onRunningChange={handleRunningChange}
        overdueOnly={overdueOnly}
        onOverdueChange={setOverdueOnly}
        counts={statusCounts}
      />

      <Card className="min-w-0 overflow-hidden py-0">
        <div className="flex flex-col gap-3 border-b bg-muted/40 p-4">
          <TaskFilterBar
            filters={filters}
            onChange={patch}
            fields={filterFields}
            projects={projectOptions}
            companies={companies}
            workstreams={workstreams}
            activities={activityOptions}
            assignableStaff={assignableStaff}
          />
          <SavedViewsBar filters={filters} onApply={handleApplySavedView} />
        </div>

        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading tasks…</p>
        ) : view === "board" ? (
          <div className="p-4">
            <TaskBoard user={user} tasks={filtered} onChanged={refresh} runningTaskId={runningTaskId} onOpenTask={openDrawer} />
          </div>
        ) : filters.groupBy === "none" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Task</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Project → Service → Activity</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Status</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Priority</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Assignees</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Due</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No tasks match this view.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((task, i) => renderTaskRow(task, i))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col gap-6 p-4">
            {groups.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No tasks match this view.</p>
            )}
            {groups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.key);
              return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={!isCollapsed}
                    className="-mx-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        isCollapsed && "-rotate-90"
                      )}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium">{group.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{group.tasks.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {group.tasks.map((task, i) => (
                        <TaskGridCard
                          key={task.id}
                          task={task}
                          className={STAGGER_ITEM_CLASS}
                          style={staggerDelay(i)}
                          isRunning={task.id === runningTaskId}
                          onOpen={openDrawer}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TaskFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" onSaved={refresh} />
      <TaskDrawer
        taskId={drawerTaskId}
        onOpenChange={(open) => !open && closeDrawer()}
        onChanged={refresh}
        onTimerChanged={refreshRunningTimer}
      />
    </div>
  );
}
