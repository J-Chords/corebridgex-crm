"use client";

import { useMemo, useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { visitEntriesProvider } from "@/lib/data/providers";
import { formatMinutes } from "@/lib/format-minutes";
import type { VisitEntry } from "@/lib/data/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle } from "@/components/ui/alert";

interface RecordVisitHoursDialogProps {
  visit: VisitEntry | null;
  projectLabel: string;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}

/**
 * Records (or corrects) the actual Start/End for a Planned or already-Completed Visit — the second
 * half of the locked Plan → Complete workflow. Duration is always calculated, never entered
 * directly. First-time completion of a Planned Visit starts with BOTH fields blank — never a guessed
 * default like 09:00–10:00 — so Save stays disabled until the user deliberately enters a real Start
 * and End; correcting an already-Completed Visit pre-fills its real stored values instead, which is
 * legitimate correction context, not an invented one. The submitted interval must fall on the Visit's
 * own already-chosen `visitDate` and must not overlap tracked Task time or another completed Visit —
 * both enforced server-side by `complete_visit_entry`; this dialog only surfaces the resulting error.
 */
export function RecordVisitHoursDialog({ visit, projectLabel, onOpenChange, onRecorded }: RecordVisitHoursDialogProps) {
  const { user } = useAuth();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visit) return;
    if (visit.status === "completed" && visit.startAt && visit.endAt) {
      const toLocalInput = (iso: string) => {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStart(toLocalInput(visit.startAt));
      setEnd(toLocalInput(visit.endAt));
    } else {
      // First-time completion of a Planned Visit — deliberately blank. Inventing a default (e.g.
      // 09:00–10:00) would let a real Visit hour get saved without the user ever entering it.
      setStart("");
      setEnd("");
    }
    setError(null);
  }, [visit]);

  const durationMinutes = useMemo(() => {
    if (!start || !end) return null;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (!(s < e)) return null;
    return Math.round((e - s) / 60000);
  }, [start, end]);

  const bothEntered = start !== "" && end !== "";
  const canSave = bothEntered && durationMinutes !== null;

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!user || !visit) return;
    setError(null);
    if (!canSave) {
      setError("Enter both Actual Start and Actual End, with End after Start.");
      return;
    }
    setIsSubmitting(true);
    try {
      await visitEntriesProvider.completeVisitEntry(user, visit.id, {
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
      });
      handleOpenChange(false);
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record these hours.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={visit !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Visit Hours</DialogTitle>
          <DialogDescription>
            {projectLabel} · Planned for {visit?.visitDate}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {visit && (
            <p className="rounded-md border bg-muted/40 p-2.5 text-xs whitespace-pre-wrap text-muted-foreground">
              <span className="font-medium text-foreground">Agenda: </span>
              {visit.agenda}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visit-actual-start">Actual start</Label>
              <Input id="visit-actual-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visit-actual-end">Actual end</Label>
              <Input id="visit-actual-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {!bothEntered
              ? "Enter both Actual Start and Actual End."
              : durationMinutes !== null
                ? `Duration: ${formatMinutes(durationMinutes)}`
                : "End must be after start."}
          </p>
          <p className="text-xs text-muted-foreground">Actual time must fall on the Visit&apos;s planned date and cannot overlap tracked Task time.</p>
          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isSubmitting || !canSave} onClick={handleSubmit}>
            {isSubmitting ? "Saving…" : "Save hours"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
