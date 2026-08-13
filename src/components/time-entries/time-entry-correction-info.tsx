"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTimeEntryCorrections } from "@/lib/data/hooks/use-time-entries";
import { formatMinutes } from "@/lib/format-minutes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatCorrectedAt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TimeEntryCorrectionInfoProps {
  timeEntryId: string;
  /** 0 means never corrected — renders nothing. */
  correctionCount: number;
}

/**
 * Quiet "this entry's duration was changed after the fact" disclosure — visible to anyone who can
 * already see the entry itself (the provider's `listCorrectionsForTimeEntry` enforces that, not this
 * component), including the employee whose time it is. Never hides that a correction happened.
 * History fetches lazily, only once expanded, so a row with corrections doesn't cost an extra
 * request until someone actually wants the detail.
 */
export function TimeEntryCorrectionInfo({ timeEntryId, correctionCount }: TimeEntryCorrectionInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const { corrections, isLoading } = useTimeEntryCorrections(expanded ? timeEntryId : null);

  if (correctionCount === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto w-fit gap-1.5 px-1.5 py-0.5"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Badge variant="warning">Corrected</Badge>
        {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </Button>
      {expanded && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-2.5">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            corrections.map((correction) => (
              <div key={correction.id} className="flex flex-col gap-0.5 text-xs">
                <span>
                  Previously{" "}
                  <span className="font-medium text-foreground">{formatMinutes(correction.previousDurationMinutes)}</span>
                  {" → "}
                  <span className="font-medium text-foreground">{formatMinutes(correction.correctedDurationMinutes)}</span>
                </span>
                <span className="text-muted-foreground">
                  Corrected by {correction.correctedByName} · {formatCorrectedAt(correction.correctedAt)}
                </span>
                <span className="text-muted-foreground">Reason: {correction.reason}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
