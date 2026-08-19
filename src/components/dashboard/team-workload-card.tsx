"use client";

import { useState } from "react";
import Link from "next/link";
import type { User } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { computeWorkload, type WorkloadLevel } from "@/lib/data/workload";
import { formatExpectedTime } from "@/lib/data/expected-time";
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

const MAX_ROWS = 6;

interface TeamWorkloadCardProps {
  members: User[];
  tasks: TaskWithRelations[];
}

/** Per-person active-task load across a team — doubles as a lightweight capacity view. Real data only: no invented capacity target, just active task counts and their own expected-hours estimates. */
export function TeamWorkloadCard({ members, tasks }: TeamWorkloadCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const rows = members.map((member) => {
    const activeTasks = tasks.filter(
      (t) => t.status !== "done" && t.assignees.some((a) => a.id === member.id)
    );
    const expectedMinutes = activeTasks.reduce((sum, t) => sum + (t.expectedMinutes ?? 0), 0);
    return { member, activeCount: activeTasks.length, expectedMinutes, workload: computeWorkload(activeTasks.length) };
  });

  const maxCount = Math.max(1, ...rows.map((r) => r.activeCount));
  const overflow = rows.length - MAX_ROWS;

  function renderRow({ member, activeCount, expectedMinutes, workload }: (typeof rows)[number], i: number) {
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
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="text-xs">{initials(member.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{member.fullName}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {expectedMinutes > 0
                ? `${activeCount} active · ${formatExpectedTime(expectedMinutes)} est.`
                : `${activeCount} active`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Badge variant={LEVEL_BADGE_VARIANT[workload.level]} className="shrink-0">
          {workload.label}
        </Badge>
      </Link>
    );
  }

  return (
    <Card>
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
            {rows.slice(0, MAX_ROWS).map(renderRow)}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="mt-1 self-start text-xs font-medium text-primary hover:underline"
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
