"use client";

import { PropertySelect } from "@/components/tasks/property-select";
import { STATUS_META, WorkstreamStatusDot } from "@/components/workstreams/workstream-status-badge";
import type { WorkstreamStatus } from "@/lib/data/types";

const STATUS_ORDER: WorkstreamStatus[] = ["active", "on-hold", "completed", "cancelled"];

const OPTIONS = STATUS_ORDER.map((status) => ({
  value: status,
  label: STATUS_META[status].label,
  indicator: <WorkstreamStatusDot status={status} />,
}));

/** Same compact dropdown language as `TaskStatusPicker` — a Workstream's own Status picker reuses
 * the shared `PropertySelect`, so Create/Edit Task and Create/Edit Service never read as two
 * different products. */
export function WorkstreamStatusPicker({
  value,
  onChange,
}: {
  value: WorkstreamStatus;
  onChange: (value: WorkstreamStatus) => void;
}) {
  return <PropertySelect options={OPTIONS} value={value} onChange={onChange} ariaLabel="Status" />;
}
