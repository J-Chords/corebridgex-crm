"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { visitEntriesProvider } from "@/lib/data/providers";
import { INTERNAL_COMPANY_ID } from "@/lib/data/constants";
import { todayDateOnly } from "@/lib/planner-dates";
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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AddVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
  /** When present, the dialog edits this still-Planned Visit's date/Agenda instead of planning a new one — same form, same validation, just a different provider call and a locked Project field. */
  editVisit?: VisitEntry | null;
}

function emptyForm() {
  return { projectId: "", visitDate: todayDateOnly(), agenda: "" };
}

/**
 * Plan Client Visit / Edit Planned Visit (Phase 9 final semantics fix + UX polish) — one shared form
 * for both: planning a new Visit (Project, intended visit date, Agenda) and editing an existing
 * Planned Visit's date/Agenda before it happens. Project is immutable once planned (`updateVisitPlan`'s
 * own contract) — the edit mode shows it as read-only context rather than a picker. Deliberately asks
 * for NO actual time in either mode: a plan has no hours yet to report, and reserves nothing (no
 * overlap check). Recording real hours afterward happens separately, via Record Visit Hours.
 */
export function AddVisitDialog({ open, onOpenChange, onAdded, editVisit = null }: AddVisitDialogProps) {
  const { user } = useAuth();
  const { projects } = useProjects();
  const isEditing = editVisit !== null;
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clientProjects = useMemo(() => projects.filter((p) => p.companyId !== INTERNAL_COMPANY_ID), [projects]);
  const projectItems = useMemo(
    () => Object.fromEntries(clientProjects.map((p) => [p.id, `${p.companyName} — ${p.name}`])),
    [clientProjects]
  );
  const editingProjectLabel = useMemo(() => {
    if (!editVisit) return "";
    const project = projects.find((p) => p.id === editVisit.projectId);
    return project ? `${project.companyName} — ${project.name}` : "Unknown Project";
  }, [projects, editVisit]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(editVisit ? { projectId: editVisit.projectId, visitDate: editVisit.visitDate, agenda: editVisit.agenda } : emptyForm());
    setError(null);
  }, [open, editVisit]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!user) return;
    setError(null);
    if (!isEditing && !form.projectId) {
      setError("Pick a Client Project.");
      return;
    }
    if (!form.agenda.trim()) {
      setError("Agenda is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditing && editVisit) {
        await visitEntriesProvider.updateVisitPlan(user, editVisit.id, {
          visitDate: form.visitDate,
          agenda: form.agenda.trim(),
        });
      } else {
        await visitEntriesProvider.createVisitEntry(user, {
          projectId: form.projectId,
          visitDate: form.visitDate,
          agenda: form.agenda.trim(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
      handleOpenChange(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditing ? "Couldn't save these changes." : "Couldn't plan this Visit.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Planned Visit" : "Plan Client Visit"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the date or Agenda before this visit happens — record actual hours afterward, separately."
              : "What you're taking into the visit — record actual hours afterward, once it happens."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Client / Project</Label>
            {isEditing ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{editingProjectLabel}</p>
            ) : (
              <Select items={projectItems} value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v ?? "" }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a Project…" />
                </SelectTrigger>
                <SelectContent>
                  {clientProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.companyName} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visit-date">Visit date</Label>
            <Input
              id="visit-date"
              type="date"
              min={todayDateOnly()}
              value={form.visitDate}
              onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visit-agenda">Agenda / Questions for Client</Label>
            <Textarea
              id="visit-agenda"
              value={form.agenda}
              onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
              placeholder="Questions/items to cover during this visit…"
              rows={4}
            />
          </div>
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
          <Button disabled={isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? "Saving…" : isEditing ? "Save changes" : "Plan Visit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
