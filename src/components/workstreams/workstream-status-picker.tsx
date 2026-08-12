"use client";

import { PillSelect } from "@/components/tasks/pill-select";
import { STATUS_META } from "@/components/workstreams/workstream-status-badge";
import type { WorkstreamStatus } from "@/lib/data/types";

const STATUS_ORDER: WorkstreamStatus[] = ["active", "on-hold", "completed", "cancelled"];

const OPTIONS = STATUS_ORDER.map((status) => ({
  value: status,
  label: STATUS_META[status].label,
  variant: STATUS_META[status].variant,
}));

/** Same colored-pill picker as TaskStatusPicker, reusing the generic cross-domain `PillSelect` primitive so a workstream's status pills can never drift from `WorkstreamStatusBadge`. */
export function WorkstreamStatusPicker({
  value,
  onChange,
}: {
  value: WorkstreamStatus;
  onChange: (value: WorkstreamStatus) => void;
}) {
  return <PillSelect options={OPTIONS} value={value} onChange={onChange} ariaLabel="Status" />;
}
