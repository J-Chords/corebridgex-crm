"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { useCompanies } from "@/lib/data/hooks/use-companies";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import type { AddManualDailyUpdateEntryInput } from "@/lib/data/providers/daily-updates-provider";
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
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_COMPANY = "none";
const NO_ACTIVITY = "none";

interface AddManualEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: AddManualDailyUpdateEntryInput) => Promise<void>;
}

/** Logs work the auto-draft never sees (a meeting, a call, "Other") — same shape as an auto-drafted entry, but client/activity are optional since a manual entry isn't necessarily tied to either. */
export function AddManualEntryDialog({ open, onOpenChange, onSave }: AddManualEntryDialogProps) {
  const { companies } = useCompanies();
  const [companyId, setCompanyId] = useState(NO_COMPANY);
  const [activityId, setActivityId] = useState(NO_ACTIVITY);
  const [minutes, setMinutes] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCompany = companies.find((c) => c.id === companyId);
  const { departments } = useActivityCatalog(selectedCompany?.brand.id);

  useEffect(() => {
    if (!open) return;
    // Reset the form every time the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompanyId(NO_COMPANY);
    setActivityId(NO_ACTIVITY);
    setMinutes("");
    setDetails("");
    setError(null);
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!details.trim()) {
      setError("Add a short description of what happened.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onSave({
        companyId: companyId === NO_COMPANY ? null : companyId,
        activityId: activityId === NO_ACTIVITY ? null : activityId,
        minutesLogged: minutes ? Math.max(0, Math.round(Number(minutes))) : 0,
        details: details.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add entry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add entry</DialogTitle>
            <DialogDescription>Log something the app didn&apos;t track — a meeting, a call, or anything else.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-entry-company">Client (optional)</Label>
              <Select
                items={{ [NO_COMPANY]: "No client", ...Object.fromEntries(companies.map((c) => [c.id, c.name])) }}
                value={companyId}
                onValueChange={(v) => {
                  setCompanyId(v ?? NO_COMPANY);
                  setActivityId(NO_ACTIVITY);
                }}
              >
                <SelectTrigger id="manual-entry-company" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COMPANY}>No client</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-entry-activity">Activity (optional)</Label>
              <Select
                items={{
                  [NO_ACTIVITY]: "No tag",
                  ...Object.fromEntries(
                    departments.flatMap((d) => d.activities.map((a) => [a.id, `${d.name}: ${a.name}`]))
                  ),
                }}
                value={activityId}
                onValueChange={(v) => setActivityId(v ?? NO_ACTIVITY)}
                disabled={!selectedCompany || departments.length === 0}
              >
                <SelectTrigger id="manual-entry-activity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACTIVITY}>No tag</SelectItem>
                  {departments.map((d) => (
                    <div key={d.id}>
                      {d.activities.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {d.name}: {a.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {selectedCompany && departments.length === 0 && (
                <p className="text-xs text-muted-foreground">No activities set up for this brand yet.</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-entry-minutes">Time (minutes, optional)</Label>
            <Input
              id="manual-entry-minutes"
              type="number"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-entry-details">Details</Label>
            <Textarea
              id="manual-entry-details"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happened?"
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
