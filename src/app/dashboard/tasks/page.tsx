"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useTaskFilters, filterTasks, groupTasksBy } from "@/lib/data/hooks/use-task-filters";
import type { TaskStatus } from "@/lib/data/types";
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
import { TaskFilterBar } from "@/components/tasks/task-filter-bar";
import { SavedViewsBar } from "@/components/tasks/saved-views-bar";
import { TaskGroupBySelect } from "@/components/tasks/task-group-by-select";
import { TaskGridCard } from "@/components/tasks/task-grid-card";
import { TaskBoard } from "@/components/tasks/task-board";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

const VALID_STATUSES: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<TaskView>("list");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { filters, patch } = useTaskFilters();

  // Seeds this page's filter from a KPI-card "view full details" link (e.g. /dashboard/tasks?status=done)
  // — one-time on mount, same `patch` the filter bar itself already calls, no change to useTaskFilters.
  useEffect(() => {
    const status = searchParams.get("status");
    if (status && VALID_STATUSES.includes(status as TaskStatus)) {
      patch({ status: status as TaskStatus });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "active"/"overdue" don't map onto a single TaskStatus value (they span several), so these are a
  // separate, purely additive narrowing on top of the normal filters — not part of `TaskFilters` at all.
  const activeOnly = searchParams.get("active") === "1";
  const overdueOnly = searchParams.get("overdue") === "1";
  const today = todayDateString();

  const filtered = useMemo(() => {
    let result = filterTasks(tasks, filters);
    if (activeOnly) result = result.filter((t) => t.status !== "done");
    if (overdueOnly) result = result.filter((t) => t.status !== "done" && t.dueDate != null && t.dueDate < today);
    return result;
  }, [tasks, filters, activeOnly, overdueOnly, today]);
  const groups = useMemo(
    () => (filters.groupBy === "none" ? [] : groupTasksBy(filtered, filters.groupBy)),
    [filtered, filters.groupBy]
  );

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderTaskRow(task: TaskWithRelations, index: number) {
    return (
      <TableRow
        key={task.id}
        className={cn("cursor-pointer", STAGGER_ITEM_CLASS)}
        style={staggerDelay(index)}
        onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
      >
        <TableCell className="max-w-64 font-medium whitespace-normal">
          <Link
            href={`/dashboard/tasks/${task.id}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {task.title}
          </Link>
        </TableCell>
        <TableCell className="text-muted-foreground">{task.company.name}</TableCell>
        <TableCell className="text-muted-foreground">
          <Link
            href={`/dashboard/workstreams/${task.workstream.id}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {task.workstream.name}
          </Link>
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
        <TableCell className="text-muted-foreground">{formatDate(task.dueDate)}</TableCell>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "employee"
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
            <TaskGroupBySelect value={filters.groupBy} onChange={(groupBy) => patch({ groupBy })} />
          )}
          <Button onClick={() => setCreateOpen(true)} data-shortcut="new-task">
            <Plus /> New Task
          </Button>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden py-0">
        <div className="flex flex-col gap-3 border-b bg-muted/40 p-4">
          <TaskFilterBar
            filters={filters}
            onChange={patch}
            companies={companies}
            workstreams={workstreams}
            assignableStaff={assignableStaff}
          />
          <SavedViewsBar filters={filters} onApply={patch} />
        </div>

        {view === "board" ? (
          <div className="p-4">
            <TaskBoard user={user} tasks={filtered} onChanged={refresh} />
          </div>
        ) : filters.groupBy === "none" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Task</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Company</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Workstream</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Status</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Priority</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Assignees</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Due</TableHead>
                <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No tasks match your filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((task, i) => renderTaskRow(task, i))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col gap-6 p-4">
            {!isLoading && groups.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No tasks match your filters.</p>
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
                        <TaskGridCard key={task.id} task={task} className={STAGGER_ITEM_CLASS} style={staggerDelay(i)} />
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
    </div>
  );
}
