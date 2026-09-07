import Link from "next/link";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskStatus } from "@/lib/data/types";

const STATUS_ORDER: TaskStatus[] = ["not-started", "in-progress", "waiting", "blocked", "completed", "canceled"];

/** Mirrors TaskStatusBadge's variant choice per status, so the donut's colors never drift from the badges. */
const STATUS_COLOR: Record<TaskStatus, string> = {
  "not-started": "var(--muted-foreground)",
  "in-progress": "var(--info)",
  waiting: "var(--warning)",
  blocked: "var(--destructive)",
  completed: "var(--success)",
  canceled: "var(--muted-foreground)",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Completed",
  canceled: "Canceled",
};

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface TaskStatusDonutProps {
  tasks: TaskWithRelations[];
}

/** Real-data-only donut of the viewer's own tasks by status — no chart library, just a stacked SVG circle. */
export function TaskStatusDonut({ tasks }: TaskStatusDonutProps) {
  const total = tasks.length;

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>;
  }

  const counted = STATUS_ORDER.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  })).filter((segment) => segment.count > 0);

  const segments = counted.reduce<{ status: TaskStatus; count: number; offset: number }[]>((acc, segment) => {
    const priorDash = acc.reduce((sum, s) => sum + (s.count / total) * CIRCUMFERENCE, 0);
    return [...acc, { ...segment, offset: priorDash }];
  }, []);

  return (
    <div className="flex items-center gap-5">
      <div className="relative size-28 shrink-0">
        <svg viewBox="0 0 100 100" className="size-28 -rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="12" />
          {segments.map(({ status, count, offset }) => {
            const dash = (count / total) * CIRCUMFERENCE;
            return (
              <circle
                key={status}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke={STATUS_COLOR[status]}
                strokeWidth="12"
                strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                strokeDashoffset={-offset}
                className="transition-all duration-500 ease-spring"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-xl font-semibold tracking-tight">{total}</span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Tasks</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {segments.map(({ status, count }) => (
          <Link
            key={status}
            href={`/dashboard/tasks?status=${status}`}
            className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-muted/60"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[status] }}
                aria-hidden="true"
              />
              {STATUS_LABEL[status]}
            </span>
            <span className="font-medium text-foreground">{count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
