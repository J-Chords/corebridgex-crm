"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Days-from-start offset -> an actual calendar date, in local date parts to avoid UTC-shift surprises. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDueDate(dateStr: string, today: string) {
  if (dateStr === today) return "Today";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type UpcomingBucket = "today" | "this-week" | "later";

const BUCKET_ORDER: { key: UpcomingBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this-week", label: "This week" },
  { key: "later", label: "Later" },
];

interface UpcomingDeadlinesCardProps {
  tasks: TaskWithRelations[];
  className?: string;
  style?: CSSProperties;
}

/** Lightweight "what's coming up" list, grouped Today/This week/Later — not a calendar, just upcoming due dates ordered by time. */
export function UpcomingDeadlinesCard({ tasks, className, style }: UpcomingDeadlinesCardProps) {
  const today = todayDateString();
  const weekEnd = addDays(today, 6);

  const upcoming = tasks
    .filter((t): t is TaskWithRelations & { dueDate: string } => t.status !== "done" && t.dueDate != null && t.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const grouped: Record<UpcomingBucket, typeof upcoming> = { today: [], "this-week": [], later: [] };
  for (const task of upcoming) {
    if (task.dueDate === today) grouped.today.push(task);
    else if (task.dueDate <= weekEnd) grouped["this-week"].push(task);
    else grouped.later.push(task);
  }

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle className="text-base">Upcoming</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the horizon — you&apos;re all clear ✨</p>
        ) : (
          BUCKET_ORDER.filter(({ key }) => grouped[key].length > 0).map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
              <div className="flex flex-col">
                {grouped[key].map((task, i) => (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}`}
                    className={cn(
                      "group/row -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 hover:no-underline",
                      STAGGER_ITEM_CLASS
                    )}
                    style={staggerDelay(i)}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium group-hover/row:underline">{task.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{task.company.name}</span>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {formatDueDate(task.dueDate, today)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
