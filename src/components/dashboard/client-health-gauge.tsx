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

const CX = 50;
const CY = 58;
const R = 40;
const STROKE_WIDTH = 10;
/** A small visual gap (in degrees) between adjacent segments — rounded caps plus a real gap reads
 * as a deliberate gauge rather than a single stroked arc cut at arbitrary points. */
const GAP_DEGREES = 3;

interface ClientHealthGaugeProps {
  counts: Record<ClientHealthStatus, number>;
}

function polarToCartesian(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

/** `startAngle`/`endAngle` in degrees, 180 = left baseline, 90 = top apex, 0 = right baseline. */
function describeArc(startAngle: number, endAngle: number) {
  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  const largeArcFlag = startAngle - endAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

/**
 * A semicircular segmented gauge — the Dashboard's Client Health visualization, reworked from a
 * full-ring donut to read closer to a real analytics gauge. No numeric 0-100 "health score" exists
 * anywhere in the data model (see `src/lib/data/client-health.ts` — status is a plain 3-value
 * category, never a stored or computed score), so the focal readout is the literal on-track
 * proportion of the real counts the chart already renders — not an invented score.
 */
export function ClientHealthGauge({ counts }: ClientHealthGaugeProps) {
  const total = counts["on-track"] + counts["needs-attention"] + counts["at-risk"];

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No clients tracked yet.</p>;
  }

  const counted = STATUS_ORDER.map((status) => ({ status, count: counts[status] })).filter((s) => s.count > 0);
  const showGaps = counted.length > 1;

  const rawSegments = counted.reduce<{ status: ClientHealthStatus; count: number; startAngle: number; endAngle: number }[]>(
    (acc, { status, count }) => {
      const cursor = acc.length === 0 ? 180 : acc[acc.length - 1].endAngle;
      const share = (count / total) * 180;
      return [...acc, { status, count, startAngle: cursor, endAngle: cursor - share }];
    },
    []
  );
  const segments = rawSegments.map((seg, i) => ({
    ...seg,
    startAngle: showGaps && i > 0 ? seg.startAngle - GAP_DEGREES / 2 : seg.startAngle,
    endAngle: showGaps && i < rawSegments.length - 1 ? seg.endAngle + GAP_DEGREES / 2 : seg.endAngle,
  }));

  const onTrackPct = Math.round((counts["on-track"] / total) * 100);
  const summary = `Client health distribution: ${counted
    .map((s) => `${s.count} ${STATUS_LABEL[s.status]}`)
    .join(", ")}.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-[220px]">
        <svg viewBox="0 0 100 66" className="w-full" role="img" aria-label={summary}>
          <path
            d={describeArc(180, 0)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            opacity="0.5"
          />
          {segments.map(({ status, startAngle, endAngle }) => (
            <path
              key={status}
              d={describeArc(startAngle, endAngle)}
              fill="none"
              stroke={STATUS_COLOR[status]}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              className="transition-all duration-500 ease-spring"
            />
          ))}
        </svg>
        <div className="-mt-5 flex flex-col items-center text-center">
          <span className="font-heading text-2xl font-semibold tracking-tight">{onTrackPct}%</span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            On track · {total} client{total === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {segments.map(({ status, count }) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div
              key={status}
              className="flex items-center justify-between gap-3 rounded-md border-l-2 py-1 pr-1 pl-2.5"
              style={{ borderColor: STATUS_COLOR[status], backgroundColor: `color-mix(in oklch, ${STATUS_COLOR[status]} 7%, transparent)` }}
            >
              <span className="truncate text-xs font-medium text-foreground">{STATUS_LABEL[status]}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{count}</span> · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
