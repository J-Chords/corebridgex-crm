"use client";

import { PropertySelect } from "@/components/tasks/property-select";
import { STATUS_META, StatusDot, statusChipStyle } from "@/components/tasks/task-status-badge";
import { TASK_STATUS_ORDER } from "@/lib/data/task-status";
import type { TaskStatus } from "@/lib/data/types";

const OPTIONS = TASK_STATUS_ORDER.map((status) => ({
  value: status,
  label: STATUS_META[status].label,
  indicator: <StatusDot status={status} />,
  triggerStyle: statusChipStyle(status),
}));

export function TaskStatusPicker({ value, onChange }: { value: TaskStatus; onChange: (value: TaskStatus) => void }) {
  return <PropertySelect options={OPTIONS} value={value} onChange={onChange} ariaLabel="Status" />;
}
