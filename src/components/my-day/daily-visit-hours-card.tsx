"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { useMyVisitEntries } from "@/lib/data/hooks/use-visit-entries";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { formatMinutes } from "@/lib/format-minutes";
import { todayDateOnly } from "@/lib/planner-dates";
import type { VisitEntry } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddVisitDialog } from "./add-visit-dialog";
import { RecordVisitHoursDialog } from "./record-visit-hours-dialog";

function formatTimeRange(startAt: string, endAt: string) {
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${fmt(startAt)} – ${fmt(endAt)}`;
}

interface DailyVisitHoursCardProps {
  className?: string;
  style?: CSSProperties;
}

type VisitFormState = { mode: "create" } | { mode: "edit"; visit: VisitEntry } | null;

/**
 * Phase 9F, redesigned per the Phase 9 final semantics fix — My Day surface for the locked Plan →
 * Complete Client Visit workflow. "Today's Visit Hours" counts ONLY completed, today-dated Visits
 * (`todayDateOnly()`, the viewer's own local date — never a UTC slice) — a Planned Visit has no
 * actual hours yet and contributes zero, matching the Client Report evidence rule exactly. Both
 * Planned and Completed Visits are listed with their Agenda always visible (multi-line preserved via
 * `whitespace-pre-wrap` — it's a list of questions/items, not a paragraph); "+ Plan Client Visit" is
 * the primary action, mirrored verbatim for Employee and Supervisor (Section 23 — same self-service
 * Visit workflow for both). A Planned Visit exposes both "Record hours" and "Edit" (date/Agenda,
 * Project locked) — `AddVisitDialog` handles both planning and editing through one shared form.
 */
export function DailyVisitHoursCard({ className, style }: DailyVisitHoursCardProps) {
  const { entries, isLoading, refresh } = useMyVisitEntries();
  const { projects } = useProjects();
  const [visitFormState, setVisitFormState] = useState<VisitFormState>(null);
  const [recordingVisit, setRecordingVisit] = useState<VisitEntry | null>(null);

  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, `${p.companyName} — ${p.name}`])), [projects]);

  const today = todayDateOnly();
  const todayCompletedTotal = entries.reduce(
    (sum, v) => (v.status === "completed" && v.visitDate === today && v.durationMinutes != null ? sum + v.durationMinutes : sum),
    0
  );

  const planned = useMemo(
    () => entries.filter((v) => v.status === "planned").sort((a, b) => a.visitDate.localeCompare(b.visitDate)),
    [entries]
  );
  const completed = useMemo(
    () => entries.filter((v) => v.status === "completed").sort((a, b) => b.visitDate.localeCompare(a.visitDate)),
    [entries]
  );

  return (
    <Card className={className} style={style}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Client Visits</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setVisitFormState({ mode: "create" })}>
          <Plus /> Plan Client Visit
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-heading text-2xl font-semibold text-primary">{formatMinutes(todayCompletedTotal)}</span>
            <span className="text-xs text-muted-foreground">Today&apos;s Visit Hours</span>
          </div>
        )}

        {!isLoading && planned.length === 0 && completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Client Visits planned yet.</p>
        ) : (
          <>
            {planned.length > 0 && (
              <ul className="flex flex-col gap-2 border-t pt-3">
                {planned.map((v) => (
                  <li key={v.id} className="flex flex-col gap-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        {projectNameById.get(v.projectId) ?? "Unknown Project"}
                        <Badge variant="info" className="text-[10px]">
                          PLANNED
                        </Badge>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{v.visitDate}</span>
                    </div>
                    <span className="text-xs whitespace-pre-wrap text-muted-foreground">{v.agenda}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setRecordingVisit(v)}>
                        Record hours
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setVisitFormState({ mode: "edit", visit: v })}>
                        Edit
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {completed.length > 0 && (
              <ul className="flex flex-col gap-2 border-t pt-3">
                {completed.map((v) => (
                  <li key={v.id} className="flex flex-col gap-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        {projectNameById.get(v.projectId) ?? "Unknown Project"}
                        <Badge variant="success" className="text-[10px]">
                          COMPLETED
                        </Badge>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {v.durationMinutes != null ? formatMinutes(v.durationMinutes) : ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {v.startAt && v.endAt ? `${v.visitDate} · ${formatTimeRange(v.startAt, v.endAt)}` : v.visitDate}
                    </span>
                    <span className="text-xs whitespace-pre-wrap text-muted-foreground">{v.agenda}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setRecordingVisit(v)}>
                        Edit hours
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">A planned visit contributes 0 hours until its actual time is recorded.</p>
      </CardContent>
      <AddVisitDialog
        open={visitFormState !== null}
        editVisit={visitFormState?.mode === "edit" ? visitFormState.visit : null}
        onOpenChange={(open) => {
          if (!open) setVisitFormState(null);
        }}
        onAdded={refresh}
      />
      <RecordVisitHoursDialog
        visit={recordingVisit}
        projectLabel={recordingVisit ? (projectNameById.get(recordingVisit.projectId) ?? "Unknown Project") : ""}
        onOpenChange={(open) => {
          if (!open) setRecordingVisit(null);
        }}
        onRecorded={refresh}
      />
    </Card>
  );
}
