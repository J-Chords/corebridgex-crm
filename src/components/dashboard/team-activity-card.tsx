"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TeamHandoffActivity } from "@/lib/data/providers/task-handoffs-provider";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { CardExpandButton } from "@/components/dashboard/card-expand-button";
import { DashboardWidgetFocusDialog } from "@/components/dashboard/dashboard-widget-focus-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ActivityItem {
  id: string;
  icon: typeof RefreshCw;
  message: string;
  timestamp: string;
  href: string;
}

const MAX_ITEMS = 8;
const MAX_DRAWER_ITEMS = 30;

function buildActivityItems(tasks: TaskWithRelations[], handoffs: TeamHandoffActivity[]): ActivityItem[] {
  const statusItems: ActivityItem[] = tasks
    .filter((t) => t.statusChangedAt && t.statusChangedBy)
    .map((t) => ({
      id: `status-${t.id}`,
      icon: RefreshCw,
      message: `${t.statusChangedBy!.fullName} marked "${t.title}" as ${TASK_STATUS_SELECT_ITEMS[t.status]}`,
      timestamp: t.statusChangedAt!,
      href: `/dashboard/tasks/${t.id}`,
    }));

  const handoffItems: ActivityItem[] = handoffs.map((h) => ({
    id: `handoff-${h.id}`,
    icon: ArrowRightLeft,
    message: `${h.handedBy.fullName} handed off "${h.taskTitle}" to ${h.handedTo.fullName}`,
    timestamp: h.createdAt,
    href: `/dashboard/tasks/${h.taskId}`,
  }));

  return [...statusItems, ...handoffItems].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

interface TeamActivityCardProps {
  tasks: TaskWithRelations[];
  handoffs: TeamHandoffActivity[];
  /** Defaults to "Recent Team Activity" — pass e.g. "Recent Firm Activity" for an org-wide (Superadmin) feed. */
  title?: string;
}

/** Merges two already-tracked signals — task status changes (incl. completions) and handoffs — into one recent-first feed. No separate activity-log subsystem; both come straight from data the app already records. */
export function TeamActivityCard({ tasks, handoffs, title = "Recent Team Activity" }: TeamActivityCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const allItems = buildActivityItems(tasks, handoffs);
  const items = allItems.slice(0, MAX_ITEMS);
  const overflow = allItems.length - items.length;

  function renderRow(item: ActivityItem, i: number) {
    return (
      <Link
        key={item.id}
        href={item.href}
        className={cn(
          "group/row -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60 hover:no-underline",
          STAGGER_ITEM_CLASS
        )}
        style={staggerDelay(i)}
      >
        <ContainedIcon size="sm" tone="neutral" className="shrink-0">
          <item.icon aria-hidden="true" />
        </ContainedIcon>
        <span className="min-w-0 flex-1 truncate text-sm group-hover/row:underline">{item.message}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.timestamp)}</span>
      </Link>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardAction>
          <CardExpandButton onClick={() => setDrawerOpen(true)} label={`Expand ${title}`} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        ) : (
          <>
            {items.map(renderRow)}
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

      <DashboardWidgetFocusDialog open={drawerOpen} onOpenChange={setDrawerOpen} title={title} description={`${allItems.length} update${allItems.length === 1 ? "" : "s"}`}>
        {allItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        ) : (
          <>
            {allItems.slice(0, MAX_DRAWER_ITEMS).map(renderRow)}
            {allItems.length > MAX_DRAWER_ITEMS && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Showing the first {MAX_DRAWER_ITEMS} of {allItems.length}.
              </p>
            )}
          </>
        )}
      </DashboardWidgetFocusDialog>
    </Card>
  );
}
