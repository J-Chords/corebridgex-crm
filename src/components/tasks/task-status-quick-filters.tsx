"use client";

import { AlertTriangle, CalendarClock, Play } from "lucide-react";
import type { TaskStatus } from "@/lib/data/types";
import { STATUS_COLOR_VAR, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { cn } from "@/lib/utils";

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

interface PillProps {
  label: string;
  color: string;
  selected: boolean;
  count?: number;
  icon?: React.ReactNode;
  onClick: () => void;
}

/** One compact status pill — same "solid tint when selected" language as StatusBucketButton (My Day), scaled down for a dense filter row instead of a big stat card. `aria-pressed` carries the selected state for assistive tech, on top of the strong visual tint/ring so the choice reads clearly at a glance in both themes. */
function Pill({ label, color, selected, count, icon, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        backgroundColor: selected ? `color-mix(in oklch, ${color} 20%, var(--card))` : undefined,
        borderColor: selected ? `color-mix(in oklch, ${color} 55%, transparent)` : undefined,
        color: selected ? `color-mix(in oklch, ${color} 70%, var(--foreground))` : undefined,
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        selected ? "shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {icon}
      {!icon && (
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      )}
      {label}
      {count != null && <span className="font-mono text-xs opacity-70">{count}</span>}
    </button>
  );
}

export interface TaskStatusQuickFilterCounts {
  all: number;
  todo: number;
  "in-progress": number;
  blocked: number;
  "waiting-on-client": number;
  done: number;
  running: number;
  overdue: number;
  dueToday: number;
}

interface TaskStatusQuickFiltersProps {
  status: TaskStatus | "all";
  onStatusChange: (status: TaskStatus | "all") => void;
  runningOnly: boolean;
  onRunningChange: (value: boolean) => void;
  overdueOnly: boolean;
  onOverdueChange: (value: boolean) => void;
  dueTodayOnly: boolean;
  onDueTodayChange: (value: boolean) => void;
  counts: TaskStatusQuickFilterCounts;
}

/**
 * The Task Center's primary status control (Section 6/7) — a compact pill row rather than a large
 * bucket grid (that's My Day's own pattern; this is a denser operational list, not a personal "today"
 * hub). Status pills are mutually exclusive (drive `filters.status` directly, so Saved Views still
 * capture the choice); Running/Overdue are separate, independently toggleable derived-state chips —
 * never new stored statuses, never mutually exclusive with a status pill, matching the locked rule
 * that Running/Overdue are computed from timer state and due date, not persisted enum values.
 */
export function TaskStatusQuickFilters({
  status,
  onStatusChange,
  runningOnly,
  onRunningChange,
  overdueOnly,
  onOverdueChange,
  dueTodayOnly,
  onDueTodayChange,
  counts,
}: TaskStatusQuickFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill label="All" color="var(--muted-foreground)" selected={status === "all"} count={counts.all} onClick={() => onStatusChange("all")} />
      {STATUS_ORDER.map((s) => (
        <Pill
          key={s}
          label={TASK_STATUS_SELECT_ITEMS[s]}
          color={STATUS_COLOR_VAR[s]}
          selected={status === s}
          count={counts[s]}
          onClick={() => onStatusChange(status === s ? "all" : s)}
        />
      ))}
      <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <Pill
        label="Running"
        color="var(--info)"
        icon={<Play className="size-3" aria-hidden="true" />}
        selected={runningOnly}
        count={counts.running}
        onClick={() => onRunningChange(!runningOnly)}
      />
      <Pill
        label="Overdue"
        color="var(--destructive)"
        icon={<AlertTriangle className="size-3" aria-hidden="true" />}
        selected={overdueOnly}
        count={counts.overdue}
        onClick={() => onOverdueChange(!overdueOnly)}
      />
      <Pill
        label="Due today"
        color="var(--warning)"
        icon={<CalendarClock className="size-3" aria-hidden="true" />}
        selected={dueTodayOnly}
        count={counts.dueToday}
        onClick={() => onDueTodayChange(!dueTodayOnly)}
      />
    </div>
  );
}
