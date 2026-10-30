import Link from "next/link";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskStatus } from "@/lib/data/types";
import { TASK_STATUS_ORDER } from "@/lib/data/task-status";
import { STATUS_COLOR_VAR, TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 3;

interface TaskStatusDonutProps {
  tasks: TaskWithRelations[];
}

/** Real-data-only donut of the viewer's own tasks by status — no chart library, just a stacked SVG circle. */
export function TaskStatusDonut({ tasks }: TaskStatusDonutProps) {
  const total = tasks.length;

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>;
  }

  const counted = TASK_STATUS_ORDER.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  })).filter((segment) => segment.count > 0);

  const segments = counted.reduce<{ status: TaskStatus; count: number; offset: number }[]>((acc, segment) => {
    const priorDash = acc.reduce((sum, s) => sum + (s.count / total) * CIRCUMFERENCE, 0);
    return [...acc, { ...segment, offset: priorDash }];
  }, []);
  const showGaps = segments.length > 1;

  // CD-225 (UI-0) — derived from the same `counted` data the chart itself renders, so it can never
  // drift out of sync or invent a count. The adjacent legend already repeats this as visible text;
  // this gives a screen-reader user the same "at a glance" summary a sighted user gets from the
  // shape alone, rather than only the row-by-row legend.
  const summary = `Task status distribution: ${counted
    .map((s) => `${s.count} ${TASK_STATUS_SELECT_ITEMS[s.status]}`)
    .join(", ")}.`;

  return (
    <div className="flex items-center gap-6">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 100 100" className="size-32 -rotate-90" role="img" aria-label={summary}>
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="10" opacity="0.5" />
          {segments.map(({ status, count, offset }) => {
            const rawDash = (count / total) * CIRCUMFERENCE;
            const dash = showGaps ? Math.max(rawDash - SEGMENT_GAP, 1) : rawDash;
            return (
              <circle
                key={status}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke={STATUS_COLOR_VAR[status]}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                strokeDashoffset={-offset}
                className="transition-all duration-500 ease-spring"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-2xl font-semibold tracking-tight">{total}</span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Tasks</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {segments.map(({ status, count }) => {
          const pct = Math.round((count / total) * 100);
          return (
            <Link
              key={status}
              href={`/dashboard/tasks?status=${status}`}
              className="flex items-center justify-between gap-3 rounded-md border-l-2 py-1 pr-1 pl-2.5 transition-colors hover:bg-muted/60"
              style={{ borderColor: STATUS_COLOR_VAR[status] }}
            >
              <span className="truncate text-xs font-medium text-foreground">{TASK_STATUS_SELECT_ITEMS[status]}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{count}</span> · {pct}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
