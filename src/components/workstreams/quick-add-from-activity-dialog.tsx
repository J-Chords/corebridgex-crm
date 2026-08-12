"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { tasksProvider } from "@/lib/data/providers";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_ACTIVITY = "none";

interface QuickAddFromActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workstream: WorkstreamWithRelations;
  onAdded: () => void;
}

/**
 * A lightweight, admin-curated alternative to "Apply template" for a single Activity rather than a
 * whole workstream — matches the Client → Workstream (service) → Activity → Task hierarchy by
 * letting a supervisor/superadmin one-click-add an activity's own default task titles as real,
 * unassigned tasks on this workstream. Title-only by design (see `Activity.defaultTaskTitles`), not
 * a full template with checklists/offsets.
 */
export function QuickAddFromActivityDialog({ open, onOpenChange, workstream, onAdded }: QuickAddFromActivityDialogProps) {
  const { user } = useAuth();
  const { departments } = useActivityCatalog(workstream.brandId, workstream.serviceLineId ?? undefined);
  const [activityId, setActivityId] = useState(NO_ACTIVITY);
  const [addedTitles, setAddedTitles] = useState<Set<string>>(new Set());
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivityId(NO_ACTIVITY);
    setAddedTitles(new Set());
    setError(null);
  }, [open]);

  if (!user) return null;

  const selectedActivity = departments.flatMap((d) => d.activities).find((a) => a.id === activityId) ?? null;

  async function handleAdd(title: string) {
    if (!user || !selectedActivity) return;
    setError(null);
    setPendingTitle(title);
    try {
      await tasksProvider.createTask(user, {
        title,
        description: "",
        workstreamId: workstream.id,
        assigneeIds: [],
        allowUnassigned: true,
        status: "todo",
        priority: "medium",
        dueDate: null,
        activityId: selectedActivity.id,
        checklistItems: [],
      });
      setAddedTitles((prev) => new Set(prev).add(title));
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add this task.");
    } finally {
      setPendingTitle(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add from activity</DialogTitle>
          <DialogDescription>
            Pick one of this workstream&apos;s own activities to see its curated quick-start tasks — click one to add it here, unassigned and ready to be picked up.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-add-activity">Activity</Label>
            <Select
              items={{
                [NO_ACTIVITY]: "Select an activity",
                ...Object.fromEntries(departments.flatMap((d) => d.activities.map((a) => [a.id, `${d.name}: ${a.name}`]))),
              }}
              value={activityId}
              onValueChange={(v) => setActivityId(v ?? NO_ACTIVITY)}
            >
              <SelectTrigger id="quick-add-activity" className="w-full">
                <SelectValue placeholder="Select an activity" />
              </SelectTrigger>
              <SelectContent>
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
            {departments.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {workstream.serviceLineId ? "No activities set up for this service yet." : "No activities set up for this brand yet."}
              </p>
            )}
          </div>

          {selectedActivity &&
            (selectedActivity.defaultTaskTitles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No default tasks set up for this activity yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {selectedActivity.defaultTaskTitles.map((title) => {
                  const added = addedTitles.has(title);
                  return (
                    <div key={title} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                      <span className="text-sm">{title}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant={added ? "ghost" : "outline"}
                        disabled={added || pendingTitle === title}
                        onClick={() => handleAdd(title)}
                      >
                        {added ? (
                          <>
                            <CheckCircle2 className="text-success" /> Added
                          </>
                        ) : pendingTitle === title ? (
                          "Adding…"
                        ) : (
                          <>
                            <Plus /> Add
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
