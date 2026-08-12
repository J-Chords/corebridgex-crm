"use client";

import type { CSSProperties } from "react";
import type { TaskStatus } from "@/lib/data/types";
import { STATUS_COLOR_VAR, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { cn } from "@/lib/utils";

export const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

/** Full, warm empty-bucket sentences (each with its own natural ending, no shared suffix needed) — a touch of personality for a genuinely empty bucket, distinct from the plainer "no matches for your filters" case. */
export const EMPTY_BUCKET_COPY: Record<TaskStatus, string> = {
  todo: "Inbox zero for today ✨",
  "in-progress": "Nothing in progress right now",
  blocked: "No blocked tasks — smooth sailing ⛵",
  "waiting-on-client": "Nothing waiting on clients right now",
  done: "No completed tasks yet — get after it 💪",
};

interface StatusBucketButtonProps {
  status: TaskStatus;
  count: number;
  selected: boolean;
  onSelect: (status: TaskStatus) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * One clickable status filter, styled like the app's other stat/hover-lift cards but selectable — the
 * selected bucket gets an inset ring + tint in its own status color, on top of the always-on colored
 * count. Shared by every role's My Day (Employee, Supervisor, ...) so the bucket look/behavior never
 * drifts between them.
 */
export function StatusBucketButton({ status, count, selected, onSelect, className, style }: StatusBucketButtonProps) {
  const color = STATUS_COLOR_VAR[status];
  return (
    <button
      type="button"
      onClick={() => onSelect(status)}
      aria-pressed={selected}
      data-shortcut={`bucket-${STATUS_ORDER.indexOf(status) + 1}`}
      style={{
        ...style,
        boxShadow: selected ? `inset 0 0 0 2px ${color}` : undefined,
        backgroundColor: selected ? `color-mix(in oklch, ${color} 16%, var(--card))` : undefined,
      }}
      className={cn(
        "flex flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-300 ease-spring hover:-translate-y-1 hover:shadow-md",
        !selected && "hover:border-primary/40",
        className
      )}
    >
      <span
        className="font-mono text-xs tracking-wider uppercase"
        style={{ color: selected ? `color-mix(in oklch, ${color} 72%, var(--foreground))` : undefined }}
      >
        {TASK_STATUS_SELECT_ITEMS[status]}
      </span>
      <span className="font-heading text-2xl font-semibold tracking-tight" style={{ color }}>
        {count}
      </span>
    </button>
  );
}
