import Link from "next/link";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TeamHandoffActivity } from "@/lib/data/providers/task-handoffs-provider";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContainedIcon } from "@/components/ui/contained-icon";
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

  return [...statusItems, ...handoffItems].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, MAX_ITEMS);
}

interface TeamActivityCardProps {
  tasks: TaskWithRelations[];
  handoffs: TeamHandoffActivity[];
  /** Defaults to "Recent Team Activity" — pass e.g. "Recent Firm Activity" for an org-wide (Superadmin) feed. */
  title?: string;
}

/** Merges two already-tracked signals — task status changes (incl. completions) and handoffs — into one recent-first feed. No separate activity-log subsystem; both come straight from data the app already records. */
export function TeamActivityCard({ tasks, handoffs, title = "Recent Team Activity" }: TeamActivityCardProps) {
  const items = buildActivityItems(tasks, handoffs);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        ) : (
          items.map((item, i) => (
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
