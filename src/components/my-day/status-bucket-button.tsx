"use client";

import { useState, type CSSProperties } from "react";
import type { TaskStatus } from "@/lib/data/types";
import { STATUS_COLOR_VAR, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { ACTIVE_TASK_STATUS_ORDER, normalizeLegacyTaskFilterStatus } from "@/lib/data/task-status";
import { cn } from "@/lib/utils";

/** My Day's own personal "today" buckets — Canceled is deliberately excluded here (closed, not
 * actionable daily work); it still appears in the org-wide "Task(s) by Status" breakdown. Derived
 * from the shared `ACTIVE_TASK_STATUS_ORDER` rather than an independent literal list. */
export const STATUS_ORDER: TaskStatus[] = ACTIVE_TASK_STATUS_ORDER;

const STATUS_BUCKET_STORAGE_KEY = "my-day-status-bucket";

/** Phase 5 (CD-214) legacy bucket compatibility — a stale persisted `"blocked"` bucket selection
 * must normalize to `"waiting"`, not merely fall back to the default bucket. */
function readPersistedStatusBucket(): TaskStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STATUS_BUCKET_STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizeLegacyTaskFilterStatus(raw);
    return normalized && (STATUS_ORDER as string[]).includes(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * MVP Simplification Pass (boss feedback) — My Day's selected status bucket, persisted the same way
 * `useTaskFilters`'s sessionStorage opt-in works, so opening a Task from a bucket and coming back
 * doesn't silently reset the selection to "In Progress." Shared by every role's My Day so the
 * behavior never drifts between them.
 */
export function usePersistedStatusBucket() {
  const [status, setStatusState] = useState<TaskStatus>(() => readPersistedStatusBucket() ?? "in-progress");
  function setStatus(next: TaskStatus) {
    setStatusState(next);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(STATUS_BUCKET_STORAGE_KEY, next);
      } catch {
        // Storage can legitimately fail (private browsing, quota) — selection still works for the
        // current mount, it just won't survive a navigate-away in that case.
      }
    }
  }
  return [status, setStatus] as const;
}

/** Full, warm empty-bucket sentences (each with its own natural ending, no shared suffix needed) — a touch of personality for a genuinely empty bucket, distinct from the plainer "no matches for your filters" case. */
export const EMPTY_BUCKET_COPY: Record<TaskStatus, string> = {
  "not-started": "Inbox zero for today ✨",
  "in-progress": "Nothing in progress right now",
  waiting: "Nothing waiting right now",
  completed: "No completed tasks yet — get after it 💪",
  canceled: "No canceled tasks",
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
