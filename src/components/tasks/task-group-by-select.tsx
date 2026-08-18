"use client";

import type { TaskGroupBy } from "@/lib/data/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GROUP_BY_ITEMS: Record<TaskGroupBy, string> = {
  none: "None",
  project: "Project",
  company: "Client",
  workstream: "Service",
  activity: "Activity",
  status: "Status",
  assignee: "Assignee",
};

interface TaskGroupBySelectProps {
  value: TaskGroupBy;
  onChange: (value: TaskGroupBy) => void;
  /** Restricts which options render — e.g. an Employee (no team of their own) omits "Assignee" here, since grouping by assignee reads as a team-management control they have no use for. Defaults to every option. */
  options?: TaskGroupBy[];
}

/** List-view-only clustering control — orthogonal to TaskFilterBar's narrowing filters, so it's kept visually separate rather than folded into that bar. */
export function TaskGroupBySelect({ value, onChange, options }: TaskGroupBySelectProps) {
  const entries = (options ?? (Object.keys(GROUP_BY_ITEMS) as TaskGroupBy[])).map((key) => [key, GROUP_BY_ITEMS[key]] as const);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Group by</span>
      <Select items={Object.fromEntries(entries)} value={value} onValueChange={(v) => onChange((v ?? "none") as TaskGroupBy)}>
        <SelectTrigger aria-label="Group by" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entries.map(([itemValue, label]) => (
            <SelectItem key={itemValue} value={itemValue}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
