import type { ClientHealthStatus } from "@/lib/data/client-health";

const STATUS_ORDER: ClientHealthStatus[] = ["on-track", "needs-attention", "at-risk"];

/** Mirrors ClientHealthBadge/ClientHealthOverviewCard's variant choice per status. */
const STATUS_COLOR: Record<ClientHealthStatus, string> = {
  "on-track": "var(--success)",
  "needs-attention": "var(--warning)",
  "at-risk": "var(--destructive)",
};

const STATUS_LABEL: Record<ClientHealthStatus, string> = {
  "on-track": "On Track",
  "needs-attention": "Needs Attention",
  "at-risk": "At Risk",
};

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ClientHealthDonutProps {
  counts: Record<ClientHealthStatus, number>;
}

/** Same stacked-SVG technique as TaskStatusDonut, applied to client health instead of task status — real data only, no chart library. */
export function ClientHealthDonut({ counts }: ClientHealthDonutProps) {
  const total = counts["on-track"] + counts["needs-attention"] + counts["at-risk"];

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No clients tracked yet.</p>;
  }

  const counted = STATUS_ORDER.map((status) => ({ status, count: counts[status] })).filter((s) => s.count > 0);

  const segments = counted.reduce<{ status: ClientHealthStatus; count: number; offset: number }[]>((acc, segment) => {
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
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Clients</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {segments.map(({ status, count }) => (
          <div key={status} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[status] }}
                aria-hidden="true"
              />
              {STATUS_LABEL[status]}
            </span>
            <span className="font-medium text-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
