"use client";

import { PropertySelect } from "@/components/tasks/property-select";
import { STATUS_META, StatusDot } from "@/components/tasks/task-status-badge";
import type { TaskStatus } from "@/lib/data/types";

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

const OPTIONS = STATUS_ORDER.map((status) => ({
  value: status,
  label: STATUS_META[status].label,
  indicator: <StatusDot status={status} />,
}));

export function TaskStatusPicker({ value, onChange }: { value: TaskStatus; onChange: (value: TaskStatus) => void }) {
  return <PropertySelect options={OPTIONS} value={value} onChange={onChange} ariaLabel="Status" />;
}
