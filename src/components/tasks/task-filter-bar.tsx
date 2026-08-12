"use client";

import { Search } from "lucide-react";
import type { TaskFilters } from "@/lib/data/hooks/use-task-filters";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_COLOR_VAR, STATUS_META, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { TASK_PRIORITY_SELECT_ITEMS } from "@/components/tasks/task-priority-badge";
import type { TaskStatus } from "@/lib/data/types";

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      className="mr-1.5 inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: STATUS_COLOR_VAR[status] }}
      aria-hidden="true"
    />
  );
}

export type TaskFilterField = "search" | "company" | "workstream" | "status" | "priority" | "assignee";

interface TaskFilterBarProps {
  filters: TaskFilters;
  onChange: (patch: Partial<TaskFilters>) => void;
  /** Which controls to render, in order. Defaults to search + company + status + priority, plus workstream when `workstreams` is passed and assignee when `assignableStaff` is passed. */
  fields?: TaskFilterField[];
  companies?: { id: string; name: string }[];
  workstreams?: { id: string; name: string }[];
  assignableStaff?: { id: string; fullName: string }[];
  searchPlaceholder?: string;
  className?: string;
}

/** Shared search + filter controls for any "list of tasks" screen — reused by the tasks list, My Day, and the employee dashboard's My Tasks card. */
export function TaskFilterBar({
  filters,
  onChange,
  fields,
  companies = [],
  workstreams,
  assignableStaff,
  searchPlaceholder = "Search tasks…",
  className,
}: TaskFilterBarProps) {
  const activeFields =
    fields ??
    (["search", "company", workstreams ? "workstream" : undefined, "status", "priority", assignableStaff ? "assignee" : undefined].filter(
      Boolean
    ) as TaskFilterField[]);

  return (
    <div className={className ?? "flex flex-wrap items-center gap-3"}>
      {activeFields.includes("search") && (
        <div className="relative min-w-48 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Search tasks"
            data-shortcut="search"
          />
        </div>
      )}
      {activeFields.includes("company") && (
        <Select
          items={{ all: "All companies", ...Object.fromEntries(companies.map((c) => [c.id, c.name])) }}
          value={filters.companyId}
          onValueChange={(v) => onChange({ companyId: v ?? "all" })}
        >
          <SelectTrigger aria-label="Filter by company">
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {activeFields.includes("workstream") && workstreams && (
        <Select
          items={{ all: "All workstreams", ...Object.fromEntries(workstreams.map((e) => [e.id, e.name])) }}
          value={filters.workstreamId}
          onValueChange={(v) => onChange({ workstreamId: v ?? "all" })}
        >
          <SelectTrigger aria-label="Filter by workstream">
            <SelectValue placeholder="Workstream" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workstreams</SelectItem>
            {workstreams.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {activeFields.includes("status") && (
        <Select
          items={{ all: "All statuses", ...TASK_STATUS_SELECT_ITEMS }}
          value={filters.status}
          onValueChange={(v) => onChange({ status: (v ?? "all") as TaskFilters["status"] })}
        >
          <SelectTrigger aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                <StatusDot status={status} />
                {STATUS_META[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {activeFields.includes("priority") && (
        <Select
          items={{ all: "All priorities", ...TASK_PRIORITY_SELECT_ITEMS }}
          value={filters.priority}
          onValueChange={(v) => onChange({ priority: (v ?? "all") as TaskFilters["priority"] })}
        >
          <SelectTrigger aria-label="Filter by priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      )}
      {activeFields.includes("assignee") && assignableStaff && (
        <Select
          items={{ all: "All assignees", ...Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName])) }}
          value={filters.assigneeId}
          onValueChange={(v) => onChange({ assigneeId: v ?? "all" })}
        >
          <SelectTrigger aria-label="Filter by assignee">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {assignableStaff.map((staff) => (
              <SelectItem key={staff.id} value={staff.id}>
                {staff.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
