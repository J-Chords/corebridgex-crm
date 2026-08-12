import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";

/**
 * One short, friendly line reflecting the viewer's actual day — replaces the plain weekday/date
 * subtitle on My Day. Computed from their own real task data (never fabricated), same "due today" /
 * "overdue" definitions the status buckets and Upcoming strip already use elsewhere on this page.
 */
export function myDaySubtitle(tasks: TaskWithRelations[], today: string): string {
  const open = tasks.filter((t) => t.status !== "done");
  const overdueCount = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const dueTodayCount = open.filter((t) => t.dueDate === today).length;

  if (overdueCount === 0 && dueTodayCount === 0) return "All caught up — nice work 🎯";

  const parts: string[] = [];
  if (dueTodayCount > 0) parts.push(`${dueTodayCount} task${dueTodayCount === 1 ? "" : "s"} due today`);
  if (overdueCount > 0) parts.push(`${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`);
  return `You have ${parts.join(" and ")}.`;
}
