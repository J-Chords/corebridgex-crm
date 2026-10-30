"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import type { User } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { computeWorkload, type WorkloadLevel } from "@/lib/data/workload";
import { isTaskActiveWork } from "@/lib/data/task-display";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

const LEVEL_BADGE_VARIANT: Record<WorkloadLevel, "success" | "warning" | "destructive"> = {
  available: "success",
  busy: "warning",
  "at-capacity": "destructive",
};

/** The bar's own fill now matches its row's workload badge instead of a flat primary-colored bar
 * regardless of level — the color itself becomes part of the at-a-glance read, not just the label. */
const LEVEL_BAR_COLOR: Record<WorkloadLevel, string> = {
  available: "var(--success)",
  busy: "var(--warning)",
  "at-capacity": "var(--destructive)",
};

const MAX_ROWS = 6;

interface TeamWorkloadCardProps {
  members: User[];
  tasks: TaskWithRelations[];
  className?: string;
  style?: CSSProperties;
}

/** Per-person active-task load across a team — doubles as a lightweight capacity view. Real data only: no invented capacity target, just active task counts. */
export function TeamWorkloadCard({ members, tasks, className, style }: TeamWorkloadCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const rows = members.map((member) => {
    const activeTasks = tasks.filter(
      (t) => isTaskActiveWork(t) && t.assignees.some((a) => a.id === member.id)
    );
    return { member, activeCount: activeTasks.length, workload: computeWorkload(activeTasks.length) };
  });

  const maxCount = Math.max(1, ...rows.map((r) => r.activeCount));
  const overflow = rows.length - MAX_ROWS;

  function renderRow({ member, activeCount, workload }: (typeof rows)[number], i: number) {
    const pct = Math.round((activeCount / maxCount) * 100);
    return (
      <Link
        key={member.id}
        href={`/dashboard/tasks?assignee=${member.id}`}
        className={cn(
          "-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60",
          STAGGER_ITEM_CLASS
        )}
        style={staggerDelay(i)}
      >
        <Avatar className="size-9 shrink-0 ring-2 ring-background">
          <AvatarFallback className="text-xs">{initials(member.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{member.fullName}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{activeCount} active</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, backgroundColor: LEVEL_BAR_COLOR[workload.level] }}
            />
          </div>
        </div>
        <Badge variant={LEVEL_BADGE_VARIANT[workload.level]} className="shrink-0">
          {workload.label}
        </Badge>
      </Link>
    );
  }

  /** The compact card's own view — a comparative vertical bar per member (bar height relative to
   * the busiest person shown, same real `pct` the horizontal rows used), color-coded by that
   * member's real workload tier. The full accessible row list above still backs the expand drawer. */
  function renderBar({ member, activeCount, workload }: (typeof rows)[number], i: number) {
    const pct = Math.max(Math.round((activeCount / maxCount) * 100), 6);
    const firstName = member.fullName.split(" ")[0];
    return (
      <Link
        key={member.id}
        href={`/dashboard/tasks?assignee=${member.id}`}
        title={`${member.fullName} — ${activeCount} active, ${workload.label}`}
        className={cn("group/bar flex flex-1 flex-col items-center gap-2", STAGGER_ITEM_CLASS)}
        style={staggerDelay(i)}
      >
        <span className="font-mono text-xs font-semibold text-foreground">{activeCount}</span>
        <div className="flex h-24 w-full items-end justify-center">
          <div
            className="w-full max-w-9 rounded-full transition-[height] duration-500 ease-out group-hover/bar:opacity-80"
            style={{ height: `${pct}%`, backgroundColor: LEVEL_BAR_COLOR[workload.level] }}
          />
        </div>
        <Avatar className="size-7 shrink-0 ring-2 ring-background">
          <AvatarFallback className="text-[10px]">{initials(member.fullName)}</AvatarFallback>
        </Avatar>
        <span className="max-w-full truncate text-xs text-muted-foreground">{firstName}</span>
      </Link>
    );
  }

  return (
    <Card className={cn("shadow-sm", className)} style={style}>
      <CardHeader>
        <CardTitle className="text-base">Team Workload</CardTitle>
        <CardAction>
          <CardExpandButton onClick={() => setDrawerOpen(true)} label="Expand Team Workload" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <>
            <div className="flex items-end justify-between gap-2">{rows.slice(0, MAX_ROWS).map(renderBar)}</div>
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="mt-3 self-start text-xs font-medium text-primary hover:underline"
              >
                +{overflow} more
              </button>
            )}
          </>
        )}
      </CardContent>

      <DashboardWidgetFocusDialog open={drawerOpen} onOpenChange={setDrawerOpen} title="Team Workload" description={`${rows.length} team member${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No team members yet.</p> : rows.map(renderRow)}
      </DashboardWidgetFocusDialog>
    </Card>
  );
}
