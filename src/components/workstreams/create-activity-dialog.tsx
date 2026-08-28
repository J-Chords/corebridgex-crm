"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { workstreamsProvider } from "@/lib/data/providers";
import type { Activity } from "@/lib/data/types";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface CreateActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workstream: WorkstreamWithRelations;
  /** Called with the newly-created (or reused, if an equivalent name already existed) Activity —
   * the caller both refreshes its own Workstream data and selects it for the current Task. */
  onCreated: (activity: Activity) => void;
}

/**
 * Phase 13B final boss-feedback pass (Part B) — creates a genuinely new, reusable Activity Catalog
 * entry (via `create_activity_for_workstream`) when no suitable Activity exists yet for the current
 * Service, without leaving Task creation. Deliberately just one field: Department is auto-resolved
 * (or auto-created, matching every Department's own 1:1-with-service-line convention) server-side
 * from the current Workstream's own brand/service line — never a second field the user has to
 * understand. Available to Employee/Supervisor/Superadmin alike, scoped to a Project/Service they
 * can already legitimately work in (the caller only renders this when `canExtendActivities` — the
 * same scope the existing single-activity flow already uses — is true).
 */
export function CreateActivityDialog({ open, onOpenChange, workstream, onCreated }: CreateActivityDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSave() {
    if (!user || !name.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const activity = await workstreamsProvider.createActivityForWorkstream(user, workstream.id, name.trim());
      onCreated(activity);
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that activity.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create activity</DialogTitle>
          <DialogDescription>
            Adds a new, reusable activity to {workstream.name}&apos;s own service catalog — available
            immediately in &quot;Activity for this Task.&quot;
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-activity-name">Activity name</Label>
          <Input
            id="new-activity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Website Maintenance"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? "Creating…" : "Create activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
