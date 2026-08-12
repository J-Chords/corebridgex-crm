"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

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
   * "Peek then drill down": when provided, the whole card becomes clickable — a corner chevron
   * appears and clicking expands this quick-glimpse content inline, below the value. Click again to
   * collapse. Omit to keep the card exactly as before (a plain, non-interactive summary).
   */
  preview?: ReactNode;
  /** "View full details →" link at the bottom of the expanded preview. Omit when no real destination page exists for this metric — never a dead-end arrow. */
  viewAllHref?: string;
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
  preview,
  viewAllHref,
}: StatCardProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = preview !== undefined;

  const summary = (
    <>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
        {expandable ? (
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden="true"
          />
        ) : Icon ? (
          <ContainedIcon size="sm" tone={TONE_ICON[tone]}>
            <Icon aria-hidden="true" />
          </ContainedIcon>
        ) : null}
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
        "transition-transform duration-300 ease-spring hover:-translate-y-1 hover:shadow-md",
        TONE_CARD_CLASS[tone],
        className
      )}
    >
      <CardContent className="flex flex-col gap-3 py-1">
        {expandable ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex flex-col gap-3 text-left"
          >
            {summary}
          </button>
        ) : (
          summary
        )}

        {expanded && preview && (
          <div className="flex flex-col gap-2 border-t pt-3 duration-300 ease-out animate-in fade-in-0 slide-in-from-top-1">
            {preview}
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="mt-1 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View full details <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
