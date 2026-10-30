import type { CSSProperties } from "react";
import type { DaySeriesPoint } from "@/lib/data/daily-series";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CHART_W = 300;
const CHART_H = 120;
const PAD_LEFT = 34;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const PLOT_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;

interface FeaturedTrendCardProps {
  /** e.g. "Team Completions This Week" / "Hours Logged This Week" — appears as the card title. */
  title: string;
  /** The large headline number — must be the same already-computed value driving any matching KPI card, never a separate calculation. */
  metricValue: string;
  /** A short, real, non-comparative line under the headline number — e.g. "across 6 time entries". Never a fabricated "vs last period" delta: no historical baseline exists to compare against. */
  metricCaption: string;
  /** Exactly 7 real daily points, oldest first — a day with no activity is a real zero, never interpolated. */
  series: DaySeriesPoint[];
  /** Formats a raw series value for the y-axis gridline labels (e.g. minutes -> "1h 30m", or a plain count). */
  formatValue: (value: number) => string;
  emptyMessage: string;
  className?: string;
  style?: CSSProperties;
}

/** A real, non-fabricated line/area trend chart — the Dashboard's featured analytics panel. Built
 * from 7 real per-day aggregates (never a fabricated/interpolated historical series), using the
 * same hand-rolled inline-SVG approach as the existing donut charts (no chart library). */
export function FeaturedTrendCard({
  title,
  metricValue,
  metricCaption,
  series,
  formatValue,
  emptyMessage,
  className,
  style,
}: FeaturedTrendCardProps) {
  const hasActivity = series.some((d) => d.value > 0);
  const maxValue = Math.max(1, ...series.map((d) => d.value));

  const x = (i: number) => PAD_LEFT + (series.length <= 1 ? 0 : (i / (series.length - 1)) * PLOT_W);
  const y = (value: number) => PAD_TOP + (1 - value / maxValue) * PLOT_H;

  const points = series.map((d, i) => ({ ...d, x: x(i), y: y(d.value) }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? PAD_LEFT} ${PAD_TOP + PLOT_H} L ${PAD_LEFT} ${PAD_TOP + PLOT_H} Z`;

  const gridFractions = [0, 0.5, 1];
  const summary = `${title}, last 7 days: ${series.map((d) => `${d.label} ${formatValue(d.value)}`).join(", ")}.`;

  return (
    <Card className={cn("shadow-sm", className)} style={style}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <span className="font-heading text-3xl font-semibold tracking-tight text-primary">{metricValue}</span>
          <p className="mt-0.5 text-xs text-muted-foreground">{metricCaption}</p>
        </div>

        {hasActivity ? (
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="h-32 w-full"
            role="img"
            aria-label={summary}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="featured-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {gridFractions.map((frac) => {
              const gy = PAD_TOP + (1 - frac) * PLOT_H;
              return (
                <g key={frac}>
                  <line x1={PAD_LEFT} y1={gy} x2={CHART_W - PAD_RIGHT} y2={gy} stroke="var(--border)" strokeWidth="1" opacity="0.6" />
                  <text x={PAD_LEFT - 6} y={gy} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" style={{ fontSize: 8 }}>
                    {formatValue(Math.round(maxValue * frac))}
                  </text>
                </g>
              );
            })}

            <path d={areaPath} fill="url(#featured-trend-fill)" stroke="none" />
            <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {points.map((p) => (
              <circle
                key={p.dateKey}
                cx={p.x}
                cy={p.y}
                r={p.isToday ? 3.5 : 2.25}
                fill={p.isToday ? "var(--primary)" : "var(--card)"}
                stroke="var(--primary)"
                strokeWidth={p.isToday ? 0 : 1.5}
              />
            ))}

            {points.map((p) => (
              <text
                key={`label-${p.dateKey}`}
                x={p.x}
                y={CHART_H - 4}
                textAnchor="middle"
                className={p.isToday ? "fill-foreground font-semibold" : "fill-muted-foreground"}
                style={{ fontSize: 9, letterSpacing: "0.03em" }}
              >
                {p.label}
              </text>
            ))}
          </svg>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}
