import type { TaskStatus, WorkstreamStatus } from "./types";

export type ClientHealthStatus = "on-track" | "needs-attention" | "at-risk";

/** No hidden scoring — `reasons` is the literal, plain-English list of facts the status was derived from. */
export interface ClientHealth {
  status: ClientHealthStatus;
  reasons: string[];
}

interface HealthWorkstream {
  id: string;
  status: WorkstreamStatus;
  updatedAt: string;
}

interface HealthTask {
  workstreamId: string;
  status: TaskStatus;
  dueDate: string | null;
  updatedAt: string;
}

/**
 * Every rule that decides a client's health lives here, and only here — tune these constants to
 * change sensitivity, nothing else needs to change. Deliberately simple thresholds over raw
 * counts, not a weighted/black-box score: any reader can see exactly why a client landed where it did.
 */
const STALL_DAYS = 14;
const DUE_SOON_DAYS = 3;
const AT_RISK_OVERDUE_COUNT = 3;
const AT_RISK_STALLED_COUNT = 2;
const ATTENTION_OVERDUE_COUNT = 1;
const ATTENTION_STALLED_COUNT = 1;
const ATTENTION_DUE_SOON_COUNT = 3;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

function daysAgoLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function mostRecent(dates: string[]): string {
  return [...dates].sort().at(-1)!;
}

/**
 * Computed on demand from a company's own workstreams/tasks — not stored. Takes plain data
 * (not the provider layer directly) so it stays a pure, easily-testable function; the provider
 * is responsible for gathering a company's workstreams/tasks and calling this.
 */
export function computeClientHealth(
  workstreams: HealthWorkstream[],
  tasks: HealthTask[],
  now: string = new Date().toISOString()
): ClientHealth {
  if (tasks.length === 0) {
    return { status: "on-track", reasons: ["No tasks tracked yet"] };
  }

  const today = now.slice(0, 10);
  const dueSoonCutoff = new Date(new Date(today).getTime() + DUE_SOON_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const dueSoonTasks = openTasks.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= dueSoonCutoff);

  const activeWorkstreams = workstreams.filter((w) => w.status === "active");
  const stalledWorkstreams = activeWorkstreams.filter((w) => {
    const wsTaskDates = tasks.filter((t) => t.workstreamId === w.id).map((t) => t.updatedAt);
    const lastActivity = mostRecent([w.updatedAt, ...wsTaskDates]);
    return daysBetween(lastActivity, now) >= STALL_DAYS;
  });

  const doneCount = tasks.length - openTasks.length;
  const progressPercent = Math.round((doneCount / tasks.length) * 100);
  const lastActivityDays = daysBetween(mostRecent(tasks.map((t) => t.updatedAt)), now);

  let status: ClientHealthStatus = "on-track";
  if (overdueTasks.length >= AT_RISK_OVERDUE_COUNT || stalledWorkstreams.length >= AT_RISK_STALLED_COUNT) {
    status = "at-risk";
  } else if (
    overdueTasks.length >= ATTENTION_OVERDUE_COUNT ||
    stalledWorkstreams.length >= ATTENTION_STALLED_COUNT ||
    dueSoonTasks.length >= ATTENTION_DUE_SOON_COUNT
  ) {
    status = "needs-attention";
  }

  const reasons = [plural(overdueTasks.length, "overdue task"), plural(stalledWorkstreams.length, "stalled service")];
  if (dueSoonTasks.length > 0) {
    reasons.push(`${plural(dueSoonTasks.length, "task")} due within ${DUE_SOON_DAYS} days`);
  }
  reasons.push(`${progressPercent}% of tasks complete`, `last activity ${daysAgoLabel(lastActivityDays)}`);

  return { status, reasons };
}
