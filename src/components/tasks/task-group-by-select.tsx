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
  company: "Company",
  activity: "Activity",
  workstream: "Workstream",
  status: "Status",
  assignee: "Assignee",
};

interface TaskGroupBySelectProps {
  value: TaskGroupBy;
  onChange: (value: TaskGroupBy) => void;
}

/** List-view-only clustering control — orthogonal to TaskFilterBar's narrowing filters, so it's kept visually separate rather than folded into that bar. */
export function TaskGroupBySelect({ value, onChange }: TaskGroupBySelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Group by</span>
      <Select items={GROUP_BY_ITEMS} value={value} onValueChange={(v) => onChange((v ?? "none") as TaskGroupBy)}>
        <SelectTrigger aria-label="Group by" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(GROUP_BY_ITEMS).map(([itemValue, label]) => (
            <SelectItem key={itemValue} value={itemValue}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
