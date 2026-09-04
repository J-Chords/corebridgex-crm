"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAdminUsers } from "@/lib/data/hooks/use-admin-users";
import { activityCatalogProvider } from "@/lib/data/providers";
import type { Activity, ServiceLine } from "@/lib/data/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus } from "lucide-react";

interface ActivityEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity;
  serviceLine: ServiceLine;
  brandName: string;
  onSaved: () => void;
}

/**
 * Activity Level, Section 12 — the global Activity catalog's own edit surface: name, description,
 * active/inactive, and Suggested Tasks (`defaultTaskTitles`), all in a clean centered dialog. Brand
 * and Service are read-only context here — an Activity's scope is immutable once created (Section
 * 4): historical Tasks/Project Services already reference its id, so it never moves between
 * Brands/Services. If an Activity genuinely belongs elsewhere, create the correct one there and
 * deactivate this one instead.
 */
export function ActivityEditDialog({ open, onOpenChange, activity, serviceLine, brandName, onSaved }: ActivityEditDialogProps) {
  const { user } = useAuth();
  const { users } = useAdminUsers();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [suggestedTasks, setSuggestedTasks] = useState<string[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setName(activity.name);
    setDescription(activity.description ?? "");
    setIsActive(activity.isActive);
    setSuggestedTasks(activity.defaultTaskTitles);
    setNewTaskTitle("");
  }, [open, activity]);

  const createdByLabel = activity.createdById
    ? (users.find((u) => u.id === activity.createdById)?.fullName ?? "Unknown")
    : "Legacy — not recorded";

  function addSuggestedTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    setSuggestedTasks((prev) => [...prev, title]);
    setNewTaskTitle("");
  }

  function updateSuggestedTask(index: number, value: string) {
    setSuggestedTasks((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeSuggestedTask(index: number) {
    setSuggestedTasks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const cleanedTitles = suggestedTasks.map((t) => t.trim()).filter(Boolean);
      if (isActive !== activity.isActive) {
        await activityCatalogProvider.setActivityActive(user, activity.id, isActive);
      }
      await activityCatalogProvider.updateActivity(user, activity.id, {
        name: name.trim(),
        description: description.trim() || null,
        defaultTaskTitles: cleanedTitles,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save Activity.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-name">Name</Label>
            <Input id="activity-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-description">Description (optional)</Label>
            <Textarea
              id="activity-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">Service</span>
              <span>{serviceLine.name}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">Brand</span>
              <span>{brandName}</span>
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Active</span>
              <span className="text-xs text-muted-foreground">
                Inactive Activities stay attached wherever already configured, but won&apos;t be offered as a new choice.
              </span>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>

          <div className="flex flex-col gap-2">
            <Label>Suggested Tasks</Label>
            {suggestedTasks.map((title, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={title} onChange={(e) => updateSuggestedTask(i, e.target.value)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove suggested task ${i + 1}`}
                  onClick={() => removeSuggestedTask(i)}
                >
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add a suggested task…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSuggestedTask();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addSuggestedTask} disabled={!newTaskTitle.trim()}>
                <Plus /> Add
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Created By</span>
            <span>{createdByLabel}</span>
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
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
