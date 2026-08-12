"use client";

import { PillSelect } from "@/components/tasks/pill-select";
import { STATUS_META, statusChipStyle } from "@/components/tasks/task-status-badge";
import type { TaskStatus } from "@/lib/data/types";

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

const OPTIONS = STATUS_ORDER.map((status) => ({
  value: status,
  label: STATUS_META[status].label,
  variant: STATUS_META[status].variant,
  chipStyle: { selected: statusChipStyle(status, "solid"), unselected: statusChipStyle(status, "subtle") },
}));

export function TaskStatusPicker({ value, onChange }: { value: TaskStatus; onChange: (value: TaskStatus) => void }) {
  return <PillSelect options={OPTIONS} value={value} onChange={onChange} ariaLabel="Status" />;
}
