"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { timeEntriesProvider } from "@/lib/data/providers";
import { formatMinutes } from "@/lib/format-minutes";
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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";

interface CorrectTimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeEntryId: string;
  recordedDurationMinutes: number;
  onCorrected: () => void;
}

/** Digits only, no decimal point — hours/minutes here are always whole numbers, which also sidesteps the same controlled `type="number"`-on-empty-focus bug `expected-time-input.tsx` was rewritten around. */
function digitsOnly(next: string): string | null {
  return /^\d*$/.test(next) ? next : null;
}

/** Manual, human-readable entry — no unit conversion, no decimals. Blank fields (mid-edit) and an out-of-range or zero combined duration all resolve to `null`, which the submit button's `disabled` state already keys off. */
function parseCorrectedMinutes(hours: string, minutes: string): number | null {
  if (hours.trim() === "" || minutes.trim() === "") return null;
  const h = Number(hours);
  const m = Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  return total > 0 ? total : null;
}

/**
 * Supervisor/Superadmin-only — for a genuinely inaccurate completed record (forgot to stop the
 * timer, a duplicate entry, a typo'd manual duration), never for "the work took longer than
 * estimated." A reason is always required; `timeEntriesProvider.correctTimeEntry` is the sole
 * enforcement point (this dialog doesn't re-check permissions, it just surfaces the provider's own
 * rejection if the attempt was somehow invalid).
 *
 * Duration is entered as plain Hours/Minutes — deliberately not the `ExpectedTimeInput` control
 * Task/Workstream estimates use elsewhere: correcting an *actual* logged duration shouldn't require
 * a Supervisor to convert "1h 10m" into "70 minutes" or "≈1.17 hours" in their head first. This is
 * the one duration field in the app that's intentionally unit-conversion-free; Task/Workstream
 * expected-time entry is untouched.
 */
export function CorrectTimeEntryDialog({
  open,
  onOpenChange,
  timeEntryId,
  recordedDurationMinutes,
  onCorrected,
}: CorrectTimeEntryDialogProps) {
  const { user } = useAuth();
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Prefilled from the entry's current effective duration, split into whole hours + the remainder
    // in minutes — the same split the "Recorded duration" line above already displays via formatMinutes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHours(String(Math.floor(recordedDurationMinutes / 60)));
    setMinutes(String(recordedDurationMinutes % 60));
    setReason("");
    setError(null);
  }, [open, recordedDurationMinutes]);

  if (!user) return null;

  const correctedMinutes = parseCorrectedMinutes(hours, minutes);
  const canSubmit = !isSubmitting && correctedMinutes != null && reason.trim().length > 0;

  function handleHoursChange(next: string) {
    const digits = digitsOnly(next);
    if (digits != null) setHours(digits);
  }

  function handleMinutesChange(next: string) {
    const digits = digitsOnly(next);
    if (digits == null) return;
    // Clamp at the keystroke rather than accepting then rejecting on submit — 60+ minutes should
    // never be typeable here, since the whole point is a Supervisor never needing to think in minutes
    // past an hour.
    if (digits !== "" && Number(digits) > 59) return;
    setMinutes(digits);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canSubmit || correctedMinutes == null) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await timeEntriesProvider.correctTimeEntry(user, timeEntryId, correctedMinutes, reason.trim());
      onCorrected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to correct this time entry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Correct time entry</DialogTitle>
            <DialogDescription>
              For a genuinely inaccurate record — not because the work took longer than estimated.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label>Recorded duration</Label>
            <p className="text-sm font-medium">{formatMinutes(recordedDurationMinutes)}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Corrected duration</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="corrected-hours" className="text-xs text-muted-foreground">
                  Hours
                </Label>
                <Input
                  id="corrected-hours"
                  type="text"
                  inputMode="numeric"
                  value={hours}
                  onChange={(e) => handleHoursChange(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="corrected-minutes" className="text-xs text-muted-foreground">
                  Minutes
                </Label>
                <Input
                  id="corrected-minutes"
                  type="text"
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => handleMinutesChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correction-reason">Reason</Label>
            <Textarea
              id="correction-reason"
              rows={2}
              placeholder="e.g. Employee forgot to stop timer"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

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
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Saving…" : "Confirm correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
