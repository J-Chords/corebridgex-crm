"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Maximize2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { DashboardDetailDrawer } from "@/components/dashboard/dashboard-detail-drawer";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface StatCardDetail {
  title: string;
  /** e.g. "4 tasks" — shown under the drawer title. */
  description?: string;
  /** Receives the drawer's own close function — a row inside (e.g. a Task) that opens a SECOND
   * overlay (the Task Drawer) should call this first, so the two never stack; a row that's a plain
   * page navigation (e.g. a Company link) can safely ignore it. */
  content: (close: () => void) => ReactNode;
}

export interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  caption?: string;
  delta?: { direction: "up" | "down"; text: string };
  /** State-highlights the card: "warning" for e.g. an overdue count, "danger" for something more severe (e.g. at-risk clients) — border/value shift to that token instead of primary. */
  tone?: "default" | "warning" | "danger";
  className?: string;
  style?: CSSProperties;
  /**
   * Locked Phase 8E interaction model: the main card body (everything except the expand button)
   * navigates to `viewAllHref` on click — never ambiguous with expand. When provided, a small
   * separate corner button opens a large `DashboardDetailDrawer` showing the real underlying rows
   * this KPI represents — never an inline-expanding panel anymore.
   */
  detail?: StatCardDetail;
  /**
   * Also drives the main card body's click-to-navigate destination, and (when set) the detail
   * drawer's own "View all" footer action. Omit when no real destination page exists for this
   * metric; the card then stays non-navigable (detail, if present, still works via its own button),
   * never a dead-end click.
   */
  viewAllHref?: string;
  viewAllLabel?: string;
}

const TONE_CARD_CLASS: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "hover:ring-primary/30",
  warning: "bg-warning/5 ring-warning/30 hover:ring-warning/50",
  danger: "bg-destructive/5 ring-destructive/30 hover:ring-destructive/50",
};

const TONE_VALUE_CLASS: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-primary",
  warning: "text-warning",
  danger: "text-destructive",
};

const TONE_ICON: Record<NonNullable<StatCardProps["tone"]>, "neutral" | "warning" | "danger"> = {
  default: "neutral",
  warning: "warning",
  danger: "danger",
};

/** Stat card from the reference: mono uppercase micro label, large display value, optional trend delta. */
export function StatCard({
  label,
  value,
  icon: Icon,
  caption,
  delta,
  tone = "default",
  className,
  style,
  detail,
  viewAllHref,
  viewAllLabel,
}: StatCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const expandable = detail !== undefined;
  const navigable = viewAllHref !== undefined;

  // The expand button is deliberately a SIBLING of the navigating Link below, not a descendant of
  // it — nesting an interactive <button> inside an <a> is invalid HTML and can misbehave for
  // assistive tech even when stopPropagation "works" in a plain click. Positioned into the same
  // visual corner instead via layout, so main-card-click-to-navigate and expand-to-drawer never
  // fight over the same click target.
  const summary = (
    <>
      <div className={cn("flex items-center justify-between gap-2", expandable && "pr-6")}>
        <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
        {Icon && (
          <ContainedIcon size="sm" tone={TONE_ICON[tone]}>
            <Icon aria-hidden="true" />
          </ContainedIcon>
        )}
      </div>
      <span className={cn("font-heading text-3xl font-semibold tracking-tight", TONE_VALUE_CLASS[tone])}>{value}</span>
      {delta ? (
        <span
          className={cn(
            "text-xs font-medium",
            delta.direction === "up" ? "text-success" : "text-destructive"
          )}
        >
          {delta.direction === "up" ? "↑" : "↓"} {delta.text}
        </span>
      ) : caption ? (
        <span className="text-xs text-muted-foreground">{caption}</span>
      ) : null}
    </>
  );

  return (
    <Card
      style={style}
      className={cn(
        "relative transition-transform duration-300 ease-spring hover:-translate-y-1 hover:shadow-md",
        TONE_CARD_CLASS[tone],
        className
      )}
    >
      <CardContent className="flex flex-col gap-3 py-1">
        {expandable && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Expand ${label}`}
            className="absolute top-3 right-3 z-10 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        )}

        {navigable ? (
          <Link href={viewAllHref} className="flex flex-col gap-3">
            {summary}
          </Link>
        ) : (
          <div className="flex flex-col gap-3">{summary}</div>
        )}
      </CardContent>

      {detail && (
        <DashboardDetailDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title={detail.title}
          description={detail.description}
          viewAllHref={viewAllHref}
          viewAllLabel={viewAllLabel}
        >
          {detail.content(() => setDrawerOpen(false))}
        </DashboardDetailDrawer>
      )}
    </Card>
  );
}
