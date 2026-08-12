"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { timeEntriesProvider } from "@/lib/data/providers";
import { INTERNAL_COMPANY_ID } from "@/lib/data/constants";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle } from "@/components/ui/alert";

interface ManualTimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  companyId: string;
  onSaved: () => void;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function ManualTimeEntryDialog({ open, onOpenChange, taskId, companyId, onSaved }: ManualTimeEntryDialogProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"range" | "duration">("range");
  const [date, setDate] = useState(todayDateString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(companyId !== INTERNAL_COMPANY_ID);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset the form each time the dialog opens, defaulting billable to the task's company.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode("range");
    setDate(todayDateString());
    setStartTime("");
    setEndTime("");
    setDurationMinutes("");
    setNotes("");
    setBillable(companyId !== INTERNAL_COMPANY_ID);
    setError(null);
  }, [open, companyId]);

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    let startISO: string;
    let endISO: string | null;
    let minutes: number;

    if (mode === "range") {
      if (!date || !startTime || !endTime) {
        setError("Enter a date, start time, and end time.");
        return;
      }
      const start = new Date(`${date}T${startTime}:00`);
      const end = new Date(`${date}T${endTime}:00`);
      if (end.getTime() <= start.getTime()) {
        setError("End time must be after start time.");
        return;
      }
      startISO = start.toISOString();
      endISO = end.toISOString();
      minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    } else {
      const parsed = Number(durationMinutes);
      if (!date || !parsed || parsed <= 0) {
        setError("Enter a date and a duration greater than 0.");
        return;
      }
      startISO = new Date(`${date}T00:00:00`).toISOString();
      endISO = null;
      minutes = Math.round(parsed);
    }

    setIsSubmitting(true);
    try {
      await timeEntriesProvider.createManualEntry(user, taskId, {
        startTime: startISO,
        endTime: endISO,
        durationMinutes: minutes,
        notes: notes.trim() || null,
        billable,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log time.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Log time</DialogTitle>
            <DialogDescription>Add a time entry for work already done.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 rounded-md bg-muted p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "range" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setMode("range")}
            >
              Time range
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "duration" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setMode("duration")}
            >
              Duration
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-date">Date</Label>
            <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          {mode === "range" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-start">Start time</Label>
                <Input
                  id="entry-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-end">End time</Label>
                <Input
                  id="entry-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-duration">Duration (minutes)</Label>
              <Input
                id="entry-duration"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-notes">Note</Label>
            <Textarea id="entry-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={billable} onCheckedChange={(checked) => setBillable(checked === true)} />
            Billable
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Log time"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
