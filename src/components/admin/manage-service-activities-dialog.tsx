"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useAdminUsers } from "@/lib/data/hooks/use-admin-users";
import { serviceLinesProvider, activityCatalogProvider } from "@/lib/data/providers";
import type { Activity, ServiceLine } from "@/lib/data/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToastManager } from "@/components/ui/toast";
import { ActivityEditDialog } from "@/components/admin/activity-edit-dialog";
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";

interface ManageServiceActivitiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceLine: ServiceLine;
}

/**
 * Service Level Phase B, Section 13's original create-only surface, upgraded in Activity Level
 * (Sections 11-12) into the ONE global Activity catalog manager — reused rather than replaced by a
 * competing module. Superadmin-only: create new Activities, and now also edit name/description/
 * Suggested Tasks/Active-Inactive in place (never Brand/Service reassignment — scope is immutable,
 * Section 4) and safely delete an Activity proven completely unused, or deactivate one that isn't.
 */
export function ManageServiceActivitiesDialog({ open, onOpenChange, serviceLine }: ManageServiceActivitiesDialogProps) {
  const { user } = useAuth();
  const { brands } = useCompanyLookups();
  const { users } = useAdminUsers();
  const { departments, isLoading, refresh } = useActivityCatalog(undefined, serviceLine.id);
  const toastManager = useToastManager();
  const [brandId, setBrandId] = useState<string>("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editing, setEditing] = useState<{ activity: Activity; brandName: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);

  async function handleAdd() {
    if (!user || !brandId || !name.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await serviceLinesProvider.createActivity(user, serviceLine.id, brandId, name.trim());
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create activity.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(activity: Activity) {
    if (!user) return;
    try {
      await activityCatalogProvider.deleteActivity(user, activity.id);
      toastManager.add({ description: `"${activity.name}" deleted.` });
      await refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Unable to delete this Activity." });
    }
  }

  const totalActivities = departments.reduce((sum, d) => sum + d.activities.length, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{serviceLine.name} — Activities</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {isLoading ? "Loading…" : `${totalActivities} configured`}
              </span>
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-md border p-3">
                {!isLoading && departments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No Activities set up for this Service yet.</p>
                )}
                {departments.map((dept) => {
                  const brand = brands.find((b) => b.id === dept.brandId);
                  return (
                    <div key={dept.id} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">{brand?.name ?? "Unknown brand"}</span>
                      {dept.activities.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No activities yet.</p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {dept.activities.map((a) => {
                            const createdByLabel = a.createdById
                              ? (users.find((u) => u.id === a.createdById)?.fullName ?? "Unknown")
                              : "Legacy — not recorded";
                            return (
                              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate font-medium">{a.name}</span>
                                    <Badge variant={a.isActive ? "outline" : "secondary"} className="shrink-0 text-[10px]">
                                      {a.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                  </div>
                                  <span className="truncate text-xs text-muted-foreground">
                                    {a.defaultTaskTitles.length} suggested task{a.defaultTaskTitles.length === 1 ? "" : "s"} · Created by{" "}
                                    {createdByLabel}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Edit ${a.name}`}
                                    onClick={() => setEditing({ activity: a, brandName: brand?.name ?? "Unknown brand" })}
                                  >
                                    <Pencil />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Delete ${a.name}`}
                                    onClick={() => setPendingDelete(a)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t pt-3">
              <span className="text-sm font-medium">Add a new Activity</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select items={Object.fromEntries(brands.map((b) => [b.id, b.name]))} value={brandId} onValueChange={(v) => setBrandId(v ?? "")}>
                  <SelectTrigger className="w-full sm:w-40" aria-label="Brand">
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Activity name"
                  aria-label="New activity name"
                  className="flex-1"
                />
                <Button type="button" onClick={() => void handleAdd()} disabled={isSubmitting || !brandId || !name.trim()}>
                  <Plus /> Add
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <ActivityEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          activity={editing.activity}
          serviceLine={serviceLine}
          brandName={editing.brandName}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Delete Activity?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will be permanently removed. This can't be undone. If it has any historical usage, the delete will be blocked and you'll be offered to deactivate it instead.`
            : ""
        }
        confirmLabel="Delete Activity"
        confirmVariant="destructive"
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete);
        }}
      />
    </>
  );
}
