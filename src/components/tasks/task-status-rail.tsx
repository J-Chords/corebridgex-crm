"use client";

import { useState } from "react";
import type { TaskStatus } from "@/lib/data/types";
import { STATUS_META, statusChipStyle } from "@/components/tasks/task-status-badge";
import { StatusReasonDialog } from "@/components/tasks/status-reason-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUS_ORDER: TaskStatus[] = ["not-started", "in-progress", "waiting", "blocked", "completed", "canceled"];

interface TaskStatusRailProps {
  status: TaskStatus;
  /** Omit (or pass nothing) to render a read-only status — used when the viewer can't progress this
   * Task. `statusReason` is required by the server whenever `status` is `"waiting"`/`"blocked"` —
   * this rail collects it inline via `StatusReasonDialog` before calling through. */
  onChange?: (status: TaskStatus, statusReason?: string) => void;
  disabled?: boolean;
}

/**
 * Phase 12B — a compact status control for the right property rail, replacing Phase 11A's large
 * five-segment rail (which dominated the full Task page — a direct boss criticism this phase
 * addresses). Same statuses, same `STATUS_META`/`statusChipStyle` tokens, same authorization
 * contract (`onChange` present only when `canProgressTask`) — just a `Select` instead of a full-
 * width segmented control, so it reads as one property among several rather than the page's
 * dominant visual element. Read-only viewers get a plain colored chip, no dropdown affordance.
 */
export function TaskStatusRail({ status, onChange, disabled }: TaskStatusRailProps) {
  const meta = STATUS_META[status];
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);

  if (!onChange) {
    return (
      <Badge variant="neutral" style={statusChipStyle(status)} className="font-semibold">
        {meta.label}
      </Badge>
    );
  }

  function handleSelect(next: TaskStatus) {
    if (next === "waiting" || next === "blocked") {
      setPendingStatus(next);
    } else {
      onChange!(next);
    }
  }

  return (
    <>
      <Select
        items={Object.fromEntries(STATUS_ORDER.map((s) => [s, STATUS_META[s].label]))}
        value={status}
        onValueChange={(v) => v && handleSelect(v as TaskStatus)}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Task status" className="h-8 w-full" style={statusChipStyle(status)}>
          <SelectValue />
        </SelectTrigger>
        {/* MVP Gap Closure (boss feedback) — the shared Select's default `alignItemWithTrigger`
            aligns the currently-selected item over the trigger (native-<select> style), which for a
            6-item list means the popup floats both above and below this one property row, overlapping
            Priority/Assignees/Due date rather than reading as attached to Status. Anchoring the whole
            popup below-left of the trigger instead makes it read as nested under the control it
            belongs to. */}
        <SelectContent align="start" alignItemWithTrigger={false}>
          {STATUS_ORDER.map((s) => (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: statusChipStyle(s).color }} aria-hidden="true" />
                {STATUS_META[s].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <StatusReasonDialog
        pendingStatus={pendingStatus}
        onCancel={() => setPendingStatus(null)}
        onConfirm={(reason) => {
          onChange!(pendingStatus!, reason);
          setPendingStatus(null);
        }}
      />
    </>
  );
}
