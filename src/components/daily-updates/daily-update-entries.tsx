"use client";

import { ArrowDownLeft, ArrowUpRight, Clock3, NotebookPen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { formatMinutes } from "@/lib/format-minutes";
import { cn } from "@/lib/utils";
import type { DailyUpdateEntry, DailyUpdateEntrySource, TaskStatus } from "@/lib/data/types";

interface DailyUpdateEntriesProps {
  entries: DailyUpdateEntry[];
  /** Read-only for Team Updates; editable for the owner's own draft on My Day. */
  editable: boolean;
  onDetailChange?: (entryId: string, details: string) => void;
  /** Only rendered when `editable` — opens the "Add entry" dialog for a manual entry. Omit entirely for a read-only view (Team Updates), where there's no one to add on behalf of. */
  onAddEntry?: () => void;
  emptyMessage?: string;
}

/** A colored left rail per entry — the quick "scan the shape of the day" cue Toggl/Harvest-style timesheets use, derived entirely from real status data (never a fabricated signal). Non-task sources (handoffs, manual notes) get a plain primary accent, since they have no status of their own. */
const STATUS_ACCENT: Record<TaskStatus, string> = {
  todo: "border-l-muted-foreground/30",
  "in-progress": "border-l-info",
  blocked: "border-l-destructive",
  "waiting-on-client": "border-l-warning",
  done: "border-l-success",
};
const NON_TASK_ACCENT = "border-l-primary/50";

const SOURCE_ICON: Partial<Record<DailyUpdateEntrySource, typeof ArrowUpRight>> = {
  "handoff-sent": ArrowUpRight,
  "handoff-received": ArrowDownLeft,
  manual: NotebookPen,
};

/**
 * Shared between My Day's own editable "Today's Update" card and Team Updates' read-only drill-down
 * — every field but `details` is a computed fact, never editable regardless of `editable`. "Add entry"
 * is offered whenever `editable` and `onAddEntry` are both present, whether the day already has
 * auto-drafted entries or not — the daily update is auto-draft plus manual, not auto-only, so a manual
 * entry is never gated on the day otherwise being empty.
 */
export function DailyUpdateEntries({ entries, editable, onDetailChange, onAddEntry, emptyMessage }: DailyUpdateEntriesProps) {
  const canAddEntry = editable && !!onAddEntry;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
        <ContainedIcon size="lg" tone="neutral">
          <NotebookPen aria-hidden="true" />
        </ContainedIcon>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {emptyMessage ? emptyMessage : canAddEntry ? "No tracked work yet today" : "Nothing tracked yet today"}
          </p>
          {!emptyMessage && (
            <p className="max-w-xs text-xs text-muted-foreground">
              {canAddEntry
                ? "Log time or update a task and it'll show up here — or add one yourself."
                : "Nothing logged for this day."}
            </p>
          )}
        </div>
        {canAddEntry && (
          <Button type="button" size="sm" onClick={onAddEntry} className="mt-1">
            <Plus /> Add entry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map((entry, i) => (
        <div key={entry.id} className={STAGGER_ITEM_CLASS} style={staggerDelay(i)}>
          <DailyUpdateEntryRow entry={entry} editable={editable} onDetailChange={onDetailChange} />
        </div>
      ))}
      {canAddEntry && (
        <button
          type="button"
          onClick={onAddEntry}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="size-4" /> Add entry
        </button>
      )}
    </div>
  );
}

function DailyUpdateEntryRow({
  entry,
  editable,
  onDetailChange,
}: {
  entry: DailyUpdateEntry;
  editable: boolean;
  onDetailChange?: (entryId: string, details: string) => void;
}) {
  const SourceIcon = SOURCE_ICON[entry.source];
  const accent = entry.progressStatus ? STATUS_ACCENT[entry.progressStatus] : NON_TASK_ACCENT;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border border-l-4 bg-card p-3 transition-colors hover:bg-muted/30",
        accent
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Badge variant="neutral">{entry.companyLabel}</Badge>
          <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            {entry.activityLabel ?? "No activity tag"}
          </span>
          {entry.minutesLogged > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <Clock3 className="size-3" aria-hidden="true" />
              {formatMinutes(entry.minutesLogged)}
            </span>
          )}
        </div>
        {entry.progressStatus ? (
          <TaskStatusBadge status={entry.progressStatus} />
        ) : (
          <Badge variant="info">
            {SourceIcon && <SourceIcon aria-hidden="true" />}
            {entry.progressLabel}
          </Badge>
        )}
      </div>
      {editable ? (
        <Textarea
          key={`${entry.id}:${entry.details}`}
          defaultValue={entry.details}
          rows={2}
          placeholder="What happened here?"
          className="resize-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          onBlur={(e) => {
            if (e.target.value !== entry.details) onDetailChange?.(entry.id, e.target.value);
          }}
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{entry.details || "—"}</p>
      )}
    </div>
  );
}
