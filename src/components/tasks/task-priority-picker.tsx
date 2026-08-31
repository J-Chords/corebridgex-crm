"use client";

import { PropertySelect } from "@/components/tasks/property-select";
import { PRIORITY_META, PriorityBars } from "@/components/tasks/task-priority-badge";
import type { TaskPriority } from "@/lib/data/types";

const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high", "urgent"];

const OPTIONS = PRIORITY_ORDER.map((priority) => ({
  value: priority,
  label: PRIORITY_META[priority].label,
  indicator: <PriorityBars priority={priority} />,
}));

export function TaskPriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
  return <PropertySelect options={OPTIONS} value={value} onChange={onChange} ariaLabel="Priority" />;
}
