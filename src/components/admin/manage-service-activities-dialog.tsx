"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { serviceLinesProvider } from "@/lib/data/providers";
import type { ServiceLine } from "@/lib/data/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus } from "lucide-react";

interface ManageServiceActivitiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceLine: ServiceLine;
}

/**
 * Service Level Phase B, Section 13 — catalog CRUD/configuration only (the full Activity-level
 * workflow redesign is deferred). Superadmin-only: create a new global Activity for this Service
 * Line, scoped to one Brand (find-or-create Department the same 1:1 convention every other
 * Department already follows) — reusing the existing Activity Catalog architecture rather than a
 * competing model. No rename/delete of an existing Activity here; that stays out of scope for V1.
 */
export function ManageServiceActivitiesDialog({ open, onOpenChange, serviceLine }: ManageServiceActivitiesDialogProps) {
  const { user } = useAuth();
  const { brands } = useCompanyLookups();
  const { departments, isLoading, refresh } = useActivityCatalog(undefined, serviceLine.id);
  const [brandId, setBrandId] = useState<string>("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const totalActivities = departments.reduce((sum, d) => sum + d.activities.length, 0);

  return (
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
            <div className="flex max-h-56 flex-col gap-3 overflow-y-auto rounded-md border p-3">
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
                      <ul className="flex flex-col gap-0.5 text-sm">
                        {dept.activities.map((a) => (
                          <li key={a.id}>{a.name}</li>
                        ))}
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
  );
}
