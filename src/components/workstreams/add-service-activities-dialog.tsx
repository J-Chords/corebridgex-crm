"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { workstreamsProvider } from "@/lib/data/providers";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface AddServiceActivitiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workstream: WorkstreamWithRelations;
  /** Called after a successful save — the caller should refetch its own Workstream/Activity data so
   * the newly-enabled Activities appear immediately (e.g. in the Task form's "Activity for this
   * Task" picker) without a hard reload. */
  onSaved: () => void;
}

/**
 * Phase 13B final polish (Part H) — lets a Service's existing catalog Activities be enabled for
 * this Workstream, multiple at once, from a compact picker rather than one-at-a-time. Reuses the
 * exact capability `WorkstreamFormDialog`'s own "Available Activities" checklist already has
 * (`updateWorkstream`'s `activityIds`, a full replace-all sync server-side) — no new RPC/RLS. Since
 * it's a replace-all, submit always sends the FULL desired set: every already-enabled Activity plus
 * whatever's newly checked here, reconstructed from this `WorkstreamWithRelations` object (never
 * only the new ids, which would silently drop the existing ones).
 *
 * Supervisor/Superadmin only — `updateWorkstream` is gated by the `workstreams_update` RLS policy
 * (Supervisor/Superadmin unconditionally; an Employee, even one who leads this very Workstream,
 * cannot call it — a deliberate, locked boundary, see `20260814120001_employee_workstream_creation
 * .sql`'s own comment). The caller is responsible for only rendering this for a viewer who passes
 * `canManageWorkstreams` — an Employee keeps the existing single-activity "stage it, persists when
 * the Task saves" flow instead, unchanged.
 */
export function AddServiceActivitiesDialog({ open, onOpenChange, workstream, onSaved }: AddServiceActivitiesDialogProps) {
  const { user } = useAuth();
  const { departments: fullCatalog } = useActivityCatalog(workstream.brand.id, workstream.serviceLineId ?? undefined);
  const enabledIds = new Set(workstream.activities.map((a) => a.id));
  const unconfigured = fullCatalog.flatMap((d) => d.activities.filter((a) => !enabledIds.has(a.id)).map((a) => ({ ...a, departmentName: d.name })));

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Resets on close (a real event, not an effect) — the next open always starts from a clean
   * slate, matching the "next open === fresh state" behavior a `useEffect` keyed on `open` would
   * give, without the cascading-render lint issue that pattern has. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setChecked(new Set());
      setError(null);
    }
    onOpenChange(next);
  }

  function toggle(id: string, isChecked: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleSave() {
    if (!user || checked.size === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      await workstreamsProvider.updateWorkstream(user, workstream.id, {
        name: workstream.name,
        description: workstream.description,
        companyId: workstream.companyId,
        projectId: workstream.projectId,
        serviceLineId: workstream.serviceLineId,
        leadUserId: workstream.leadUserId,
        teamUserIds: workstream.team.map((u) => u.id),
        status: workstream.status,
        startDate: workstream.startDate,
        endDate: workstream.endDate,
        recurrenceFrequency: workstream.recurrenceFrequency,
        recurrenceAnchorDate: workstream.recurrenceAnchorDate,
        recurrenceCustomIntervalDays: workstream.recurrenceCustomIntervalDays,
        activityIds: [...enabledIds, ...checked],
      });
      onSaved();
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add those activities.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add activities to {workstream.name}</DialogTitle>
          <DialogDescription>
            Pick any existing catalog activities not yet part of this service. They&apos;ll be
            available in every Task&apos;s own single &quot;Activity for this Task&quot; picker right away.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}

        {unconfigured.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every catalog activity for this service is already enabled.</p>
        ) : (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {unconfigured.map((activity) => (
              <label key={activity.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={checked.has(activity.id)} onCheckedChange={(c) => toggle(activity.id, c === true)} />
                {activity.departmentName}: {activity.name}
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={checked.size === 0 || isSaving}>
            {isSaving ? "Adding…" : `Add ${checked.size || ""} activit${checked.size === 1 ? "y" : "ies"}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
