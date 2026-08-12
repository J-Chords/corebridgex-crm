"use client";

import { PillSelect } from "@/components/tasks/pill-select";
import { PRIORITY_META } from "@/components/tasks/task-priority-badge";
import type { TaskPriority } from "@/lib/data/types";

const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high", "urgent"];

const OPTIONS = PRIORITY_ORDER.map((priority) => ({
  value: priority,
  label: PRIORITY_META[priority].label,
  variant: PRIORITY_META[priority].variant,
}));

export function TaskPriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
  return <PillSelect options={OPTIONS} value={value} onChange={onChange} ariaLabel="Priority" />;
}
