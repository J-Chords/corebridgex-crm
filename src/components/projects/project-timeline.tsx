"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileText, MessageSquare, Sparkles, ArrowRightCircle } from "lucide-react";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { NoteWithAuthor } from "@/lib/data/providers/notes-provider";
import type { ClientReport } from "@/lib/data/types";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { dateKeyFromTimestamp } from "@/lib/planner-dates";

const PAGE_SIZE = 50;

interface TimelineEvent {
  id: string;
  timestamp: string;
  icon: typeof CheckCircle2;
  iconClassName: string;
  title: string;
  secondary?: string;
  actor?: string;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ProjectTimelineProps {
  /** Every event source below is already the exact same authorized data this Project workspace
   * fetched for its own List/History/Reports sections — this component aggregates and sorts, it
   * never independently re-derives access. */
  tasks: TaskWithRelations[];
  notes: NoteWithAuthor[];
  reports: ClientReport[];
  workstreams: WorkstreamWithRelations[];
}

/**
 * Phase 13E — a factual chronological view built ONLY from records with a genuinely trustworthy
 * timestamp: Task completion / most-recent-status-change (`statusChangedAt`, which only ever
 * updates on a real transition — see `project-completed-work.tsx`'s own doc comment for the same
 * reasoning), Client Report generation (`generatedAt`), Shared Note creation (`createdAt`), Service
 * creation (`createdAt`). No generic audit/activity-log table exists or is created for this — every
 * event here is derived from an authoritative existing record. Deliberately excluded: page views,
 * logins, checklist ticks, or any per-click/idle signal — none of those are stored anywhere in this
 * data model, and this component doesn't invent a source for them.
 */
export function ProjectTimeline({ tasks, notes, reports, workstreams }: ProjectTimelineProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const events = useMemo(() => {
    const list: TimelineEvent[] = [];

    for (const task of tasks) {
      const context = `${task.workstream.name}${task.activity ? ` · ${task.activity.name}` : ""}`;
      if (task.status === "done" && task.statusChangedAt) {
        list.push({
          id: `task-done-${task.id}`,
          timestamp: task.statusChangedAt,
          icon: CheckCircle2,
          iconClassName: "text-success",
          title: `${task.title} completed`,
          secondary: context,
          actor: task.statusChangedBy?.fullName,
        });
      } else if (task.status !== "todo" && task.statusChangedAt) {
        // Only the CURRENT (most recent) transition is ever known — no full status history is
        // stored, so this is the single most-recent move, never a fabricated multi-step history.
        list.push({
          id: `task-status-${task.id}`,
          timestamp: task.statusChangedAt,
          icon: ArrowRightCircle,
          iconClassName: "text-info",
          title: `${task.title} moved to ${TASK_STATUS_SELECT_ITEMS[task.status]}`,
          secondary: context,
          actor: task.statusChangedBy?.fullName,
        });
      }
    }

    for (const report of reports) {
      list.push({
        id: `report-${report.id}`,
        timestamp: report.generatedAt,
        icon: FileText,
        iconClassName: "text-primary",
        title: `${new Date(report.rangeStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })} Client Report generated`,
        actor: report.generatedByName,
      });
    }

    for (const note of notes) {
      list.push({
        id: `note-${note.id}`,
        timestamp: note.createdAt,
        icon: MessageSquare,
        iconClassName: "text-muted-foreground",
        title: "Shared note added",
        secondary: note.body.length > 100 ? `${note.body.slice(0, 100)}…` : note.body,
        actor: note.author.fullName,
      });
    }

    for (const workstream of workstreams) {
      list.push({
        id: `service-${workstream.id}`,
        timestamp: workstream.createdAt,
        icon: Sparkles,
        iconClassName: "text-primary",
        title: `${workstream.name} Service created`,
      });
    }

    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [tasks, notes, reports, workstreams]);

  const visible = events.slice(0, visibleCount);

  const groups = useMemo(() => {
    const byDay = new Map<string, TimelineEvent[]>();
    for (const e of visible) {
      // The LOCAL calendar day this event falls on — must match `formatDay`'s own local
      // `toLocaleDateString` below exactly, or an event could be grouped under one date while its
      // displayed label shows a different one (a real risk near local midnight with a raw UTC slice).
      const key = dateKeyFromTimestamp(e.timestamp);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(e);
    }
    return Array.from(byDay.entries());
  }, [visible]);

  if (events.length === 0) {
    return <p className="p-10 text-center text-sm text-muted-foreground">No project activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(([day, dayEvents]) => (
        <div key={day} className="flex flex-col gap-2">
          <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{formatDay(dayEvents[0].timestamp)}</span>
          <div className="flex flex-col gap-3 border-l pl-4">
            {dayEvents.map((e) => {
              const Icon = e.icon;
              return (
                <div key={e.id} className="relative flex items-start gap-2 text-sm">
                  <Icon className={`absolute -left-[21px] size-3.5 shrink-0 bg-background ${e.iconClassName}`} aria-hidden="true" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate">{e.title}</span>
                    {e.secondary && <span className="truncate text-xs text-muted-foreground">{e.secondary}</span>}
                    {e.actor && <span className="text-xs text-muted-foreground">by {e.actor}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {events.length > visibleCount && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          Load older activity
        </button>
      )}
    </div>
  );
}
