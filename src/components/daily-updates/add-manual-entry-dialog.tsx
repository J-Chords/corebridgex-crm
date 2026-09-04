"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { useCompanies } from "@/lib/data/hooks/use-companies";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { operationalProjectPickerLabels } from "@/lib/data/project-display";
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
import { ExpectedTimeInput } from "@/components/ui/expected-time-input";

const NO_COMPANY = "none";
const NO_PROJECT = "none";
const NO_ACTIVITY = "none";

interface AddManualEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: AddManualDailyUpdateEntryInput) => Promise<void>;
}

/** Logs work the auto-draft never sees (a meeting, a call, "Other") — same shape as an auto-drafted
 * entry, but Client/Project/Activity are all optional since a manual entry isn't necessarily tied to
 * any of them. The Project picker only appears once a Client is chosen AND that client has at least
 * one accessible Project — genuine internal/non-client work never gets forced into picking one. */
export function AddManualEntryDialog({ open, onOpenChange, onSave }: AddManualEntryDialogProps) {
  const { companies } = useCompanies();
  const { projects } = useProjects();
  const [companyId, setCompanyId] = useState(NO_COMPANY);
  const [projectId, setProjectId] = useState(NO_PROJECT);
  const [activityId, setActivityId] = useState(NO_ACTIVITY);
  const [scheduledMinutes, setScheduledMinutes] = useState<number | null>(null);
  const [actualMinutes, setActualMinutes] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCompany = companies.find((c) => c.id === companyId);
  const companyProjects = selectedCompany ? projects.filter((p) => p.companyId === selectedCompany.id) : [];
  const companyProjectLabels = operationalProjectPickerLabels(companyProjects);
  const { departments } = useActivityCatalog(selectedCompany?.brand?.id);

  useEffect(() => {
    if (!open) return;
    // Reset the form every time the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompanyId(NO_COMPANY);
    setProjectId(NO_PROJECT);
    setActivityId(NO_ACTIVITY);
    setScheduledMinutes(null);
    setActualMinutes("");
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
        projectId: projectId === NO_PROJECT ? null : projectId,
        activityId: activityId === NO_ACTIVITY ? null : activityId,
        actualMinutes: actualMinutes ? Math.max(0, Math.round(Number(actualMinutes))) : 0,
        scheduledMinutes,
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
                  setProjectId(NO_PROJECT);
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

          {/* Project only ever appears once a client is picked and has an accessible Project —
              genuine internal/non-client work is never forced to pick one. */}
          {selectedCompany && companyProjects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-entry-project">Project (optional)</Label>
              <Select
                items={{ [NO_PROJECT]: "No project", ...companyProjectLabels }}
                value={projectId}
                onValueChange={(v) => setProjectId(v ?? NO_PROJECT)}
              >
                <SelectTrigger id="manual-entry-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>No project</SelectItem>
                  {companyProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {companyProjectLabels[p.id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-entry-scheduled">Scheduled (optional)</Label>
              <ExpectedTimeInput id="manual-entry-scheduled" valueMinutes={scheduledMinutes} onChange={setScheduledMinutes} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-entry-actual">Actual time (minutes, optional)</Label>
              <Input
                id="manual-entry-actual"
                type="number"
                min={0}
                value={actualMinutes}
                onChange={(e) => setActualMinutes(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">A fallback value — not a real Time Entry.</p>
            </div>
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
