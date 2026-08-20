"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock3, NotebookPen, PenLine, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { formatMinutes } from "@/lib/format-minutes";
import { cn } from "@/lib/utils";
import { getEntryActualMinutes } from "@/lib/data/types/daily-update";
import type { DailyUpdateEntry, DailyUpdateEntrySource, TaskStatus } from "@/lib/data/types";

/** A compact minutes-only editor for Scheduled Time — deliberately not the full ExpectedTimeInput
 * (value + unit + stepper), which is far too wide for a narrow row cell here; this is an inline
 * timesheet-row field, not a form. Commits on blur, matching Details' own autosave-on-blur pattern
 * rather than firing on every keystroke. */
function CompactMinutesInput({ id, valueMinutes, onChange }: { id: string; valueMinutes: number | null; onChange: (minutes: number | null) => void }) {
  const [text, setText] = useState(valueMinutes != null ? String(valueMinutes) : "");
  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          if (!/^\d*$/.test(e.target.value)) return;
          setText(e.target.value);
        }}
        onBlur={() => {
          const next = text.trim() === "" ? null : Math.max(0, parseInt(text, 10));
          if (next !== valueMinutes) onChange(next);
        }}
        placeholder="—"
        aria-label="Scheduled minutes"
        className="h-8 w-14 px-2 text-center text-xs"
      />
      <span className="text-xs text-muted-foreground">min</span>
    </div>
  );
}

interface DailyUpdateEntriesProps {
  entries: DailyUpdateEntry[];
  /** Read-only for Team Updates; editable for the owner's own draft on My Day. */
  editable: boolean;
  onDetailChange?: (entryId: string, details: string) => void;
  /** Scheduled Time is the one other field the owner may edit on an auto-drafted entry — see the
   * type's own doc comment for why it's never auto-derived. Only called when `editable`. */
  onScheduledMinutesChange?: (entryId: string, scheduledMinutes: number | null) => void;
  /** Only rendered when `editable` — opens the "Add entry" dialog for a manual entry. Omit entirely for a read-only view (Team Updates), where there's no one to add on behalf of. */
  onAddEntry?: () => void;
  emptyMessage?: string;
}

/** A colored left rail per entry — the quick "scan the shape of the day" cue Toggl/Harvest-style timesheets use, derived entirely from real status data (never a fabricated signal). Non-task sources (legacy handoff rows, manual notes) get a plain primary accent, since they have no status of their own. */
const STATUS_ACCENT: Record<TaskStatus, string> = {
  todo: "border-l-muted-foreground/30",
  "in-progress": "border-l-info",
  blocked: "border-l-destructive",
  "waiting-on-client": "border-l-warning",
  done: "border-l-success",
};
const NON_TASK_ACCENT = "border-l-primary/50";

/** Legacy-only — a fresh entry is never produced with these sources post-Phase 9C (a Handoff folds
 * into its Task's own entry instead), but an old stored row may still have one. */
const SOURCE_ICON: Partial<Record<DailyUpdateEntrySource, typeof ArrowUpRight>> = {
  "handoff-sent": ArrowUpRight,
  "handoff-received": ArrowDownLeft,
  manual: NotebookPen,
};

/**
 * Shared between My Day's own editable "Today's Update" card and Team Updates' read-only drill-down.
 * Every field but `details` and `scheduledMinutes` is a computed fact, never editable regardless of
 * `editable` — if a Task-backed row's Client/Project/Service/Activity/Task/Actual/Progress is wrong,
 * the source Task/Time Entry is what needs correcting, not this screen (Phase 9C locked rule).
 * "Add entry" is offered whenever `editable` and `onAddEntry` are both present, whether the day
 * already has auto-drafted entries or not — the daily update is auto-draft plus manual, not
 * auto-only, so a manual entry is never gated on the day otherwise being empty.
 */
export function DailyUpdateEntries({
  entries,
  editable,
  onDetailChange,
  onScheduledMinutesChange,
  onAddEntry,
  emptyMessage,
}: DailyUpdateEntriesProps) {
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
      {/* Column labels — desktop only; each row below lays its own cells out to line up under these. */}
      <div className="hidden gap-3 px-3 text-[10px] font-mono tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_5.5rem_5.5rem_minmax(0,1fr)]">
        <span>Task / work</span>
        <span>Client / Project</span>
        <span>Service / Activity</span>
        <span>Scheduled</span>
        <span>Actual</span>
        <span>Progress</span>
      </div>
      {entries.map((entry, i) => (
        <div key={entry.id} className={STAGGER_ITEM_CLASS} style={staggerDelay(i)}>
          <DailyUpdateEntryRow
            entry={entry}
            editable={editable}
            onDetailChange={onDetailChange}
            onScheduledMinutesChange={onScheduledMinutesChange}
          />
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
  onScheduledMinutesChange,
}: {
  entry: DailyUpdateEntry;
  editable: boolean;
  onDetailChange?: (entryId: string, details: string) => void;
  onScheduledMinutesChange?: (entryId: string, scheduledMinutes: number | null) => void;
}) {
  const SourceIcon = SOURCE_ICON[entry.source];
  const accent = entry.progressStatus ? STATUS_ACCENT[entry.progressStatus] : NON_TASK_ACCENT;
  const actualMinutes = getEntryActualMinutes(entry);
  const isManual = entry.source === "manual";
  const workTitle = entry.taskLabel ?? (isManual ? entry.details || "Manual entry" : null);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-l-4 bg-card p-3 transition-colors hover:bg-muted/30",
        accent
      )}
    >
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_5.5rem_5.5rem_minmax(0,1fr)] md:items-center">
        {/* Task / work */}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{workTitle ?? "Untitled work"}</p>
          {isManual && <span className="text-[10px] font-mono tracking-wide text-muted-foreground uppercase">Manual entry</span>}
        </div>

        {/* Client / Project */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <Badge variant="neutral" className="w-fit">
            {entry.companyLabel}
          </Badge>
          {entry.projectLabel && <span className="truncate text-xs text-muted-foreground">{entry.projectLabel}</span>}
        </div>

        {/* Service / Activity */}
        <div className="flex min-w-0 flex-col gap-0.5">
          {entry.workstreamLabel && <span className="truncate text-xs font-medium">{entry.workstreamLabel}</span>}
          <span className="truncate font-mono text-xs tracking-wide text-muted-foreground uppercase">
            {entry.activityLabel ?? "No activity tag"}
          </span>
        </div>

        {/* Scheduled */}
        <div>
          {editable ? (
            <CompactMinutesInput
              id={`scheduled-${entry.id}`}
              valueMinutes={entry.scheduledMinutes ?? null}
              onChange={(minutes) => onScheduledMinutesChange?.(entry.id, minutes)}
            />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {entry.scheduledMinutes ? formatMinutes(entry.scheduledMinutes) : "—"}
            </span>
          )}
        </div>

        {/* Actual */}
        <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          {actualMinutes > 0 ? (
            <>
              <Clock3 className="size-3" aria-hidden="true" />
              {formatMinutes(actualMinutes)}
              {isManual && (
                <span title="Manually entered, not tracked time">
                  <PenLine className="size-3 text-muted-foreground/70" aria-hidden="true" />
                </span>
              )}
            </>
          ) : (
            "—"
          )}
        </div>

        {/* Progress */}
        <div>
          {entry.progressStatus ? (
            <TaskStatusBadge status={entry.progressStatus} />
          ) : (
            <Badge variant="info">
              {SourceIcon && <SourceIcon aria-hidden="true" />}
              {entry.progressLabel}
            </Badge>
          )}
        </div>
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
