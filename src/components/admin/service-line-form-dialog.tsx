"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { serviceLinesProvider } from "@/lib/data/providers";
import type { ServiceLine } from "@/lib/data/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface ServiceLineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new Service. */
  serviceLine?: ServiceLine;
  onSaved: () => void;
  /** Create mode only — fires instead of `onSaved` when the Admin chose "Create & Add Activities."
   * The caller should open that Service's existing Activities manager (never build a second one). */
  onCreatedAndConfigure?: (created: ServiceLine) => void;
}

type SubmitIntent = "save" | "save-and-configure";

/**
 * Service Level Phase B, Section 10 — the global Service catalog's own create/edit surface.
 * Admin-only (the page that renders this already gates on `canManageAdminUsers`). Deliberately
 * minimal — name + description are the only catalog fields V1 asks for; active/inactive and
 * Team Lead/Employee staffing are edited inline from the catalog table row itself. Activities are
 * optional at creation — a Service may legitimately exist before its Activity catalog is configured;
 * "Create & Add Activities" (create mode only) is a pure convenience that reuses the existing
 * `ManageServiceActivitiesDialog` afterward rather than duplicating any Activity UI here.
 */
export function ServiceLineFormDialog({ open, onOpenChange, serviceLine, onSaved, onCreatedAndConfigure }: ServiceLineFormDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<SubmitIntent | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setName(serviceLine?.name ?? "");
    setDescription(serviceLine?.description ?? "");
  }, [open, serviceLine]);

  async function submit(intent: SubmitIntent) {
    if (!user) return;
    setError(null);
    setPendingIntent(intent);
    try {
      const input = { name: name.trim(), description: description.trim() || null };
      if (serviceLine) {
        await serviceLinesProvider.update(user, serviceLine.id, input);
        onSaved();
        onOpenChange(false);
      } else {
        const created = await serviceLinesProvider.create(user, input);
        onOpenChange(false);
        if (intent === "save-and-configure" && onCreatedAndConfigure) {
          onCreatedAndConfigure(created);
        } else {
          onSaved();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save Service.");
    } finally {
      setPendingIntent(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit("save");
  }

  const isSubmitting = pendingIntent !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{serviceLine ? "Edit Service" : "New Service"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="service-line-name">Name</Label>
            <Input id="service-line-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Payroll" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="service-line-description">Description (optional)</Label>
            <Textarea
              id="service-line-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              rows={3}
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
            {!serviceLine && onCreatedAndConfigure && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || !name.trim()}
                onClick={() => void submit("save-and-configure")}
              >
                {pendingIntent === "save-and-configure" ? "Creating…" : "Create & Add Activities"}
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {pendingIntent === "save" ? "Saving…" : serviceLine ? "Save changes" : "Create Service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
