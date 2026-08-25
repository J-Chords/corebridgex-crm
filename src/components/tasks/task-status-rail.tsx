"use client";

import type { TaskStatus } from "@/lib/data/types";
import { STATUS_META, statusChipStyle } from "@/components/tasks/task-status-badge";
import { cn } from "@/lib/utils";

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "blocked", "waiting-on-client", "done"];

interface TaskStatusRailProps {
  status: TaskStatus;
  /** Omit (or pass nothing) to render a read-only rail — used when the viewer can't progress this Task. */
  onChange?: (status: TaskStatus) => void;
  disabled?: boolean;
}

/**
 * Phase 11A — a polished, segmented status control replacing the plain `<Select>` dropdown on the
 * Task/Subtask full page and drawer. Deliberately NOT a percentage/progress bar: Blocked and Waiting
 * on client aren't points on a completion scale, so this renders five equally-weighted, individually
 * clickable segments (Todo | In progress | Blocked | Waiting on client | Done) — status stays highly
 * visible and colorful without implying a false 20/40/60/80/100% semantics. Reuses the exact same
 * `STATUS_META`/`statusChipStyle` tokens every other status-colored element in the app already reads
 * from, so this introduces zero new color decisions.
 */
export function TaskStatusRail({ status, onChange, disabled }: TaskStatusRailProps) {
  const interactive = Boolean(onChange) && !disabled;
  return (
    <div
      role={onChange ? "radiogroup" : undefined}
      aria-label={onChange ? "Task status" : undefined}
      className="flex w-full overflow-hidden rounded-lg border"
    >
      {STATUS_ORDER.map((s, i) => {
        const meta = STATUS_META[s];
        const active = s === status;
        return (
          <button
            key={s}
            type="button"
            role={onChange ? "radio" : undefined}
            aria-checked={onChange ? active : undefined}
            disabled={!interactive}
            onClick={() => onChange?.(s)}
            style={active ? statusChipStyle(s, "solid") : undefined}
            className={cn(
              "flex-1 truncate px-2 py-1.5 text-center text-xs font-semibold transition-colors",
              i > 0 && "border-l",
              active ? "" : "text-muted-foreground",
              interactive && !active && "hover:bg-muted/60",
              !interactive && "cursor-default"
            )}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
