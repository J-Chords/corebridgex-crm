"use client";

import type { TaskStatus } from "@/lib/data/types";
import { STATUS_META, statusChipStyle } from "@/components/tasks/task-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

interface TaskStatusRailProps {
  status: TaskStatus;
  /** Omit (or pass nothing) to render a read-only status — used when the viewer can't progress this Task. */
  onChange?: (status: TaskStatus) => void;
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

  if (!onChange) {
    return (
      <Badge variant="neutral" style={statusChipStyle(status)} className="font-semibold">
        {meta.label}
      </Badge>
    );
  }

  return (
    <Select
      items={Object.fromEntries(STATUS_ORDER.map((s) => [s, STATUS_META[s].label]))}
      value={status}
      onValueChange={(v) => v && onChange(v as TaskStatus)}
      disabled={disabled}
    >
      <SelectTrigger aria-label="Task status" className="h-8 w-full" style={statusChipStyle(status)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
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
  );
}
