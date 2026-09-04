"use client";

import { useState } from "react";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** One selected existing Service (Service Line) plus the subset of its existing Activities to enable. */
export interface ProjectServiceSelection {
  serviceLineId: string;
  activityIds: string[];
}

interface ServiceActivityFieldsProps {
  brandId: string;
  serviceLineId: string;
  activityIds: string[];
  onChange: (activityIds: string[]) => void;
}

/** Reused by `ProjectServicePicker` below — one Service's own Activity checkboxes, grouped by Department, exactly mirroring `WorkstreamFormDialog`'s existing Activities section so the two configuration surfaces read identically. */
function ServiceActivityFields({ brandId, serviceLineId, activityIds, onChange }: ServiceActivityFieldsProps) {
  const { departments } = useActivityCatalog(brandId, serviceLineId);

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...activityIds, id] : activityIds.filter((a) => a !== id));
  }

  if (departments.length === 0) {
    return <p className="text-xs text-muted-foreground">No activities set up for this service yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {departments.map((dept) => (
        <div key={dept.id} className="flex flex-col gap-1">
          {departments.length > 1 && <span className="text-xs font-medium text-muted-foreground">{dept.name}</span>}
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {dept.activities.map((activity) => (
              <label key={activity.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={activityIds.includes(activity.id)}
                  onCheckedChange={(checked) => toggle(activity.id, checked === true)}
                />
                {activity.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ProjectServicePickerProps {
  /** The underlying Company's Brand — Activities are organized per Brand, so a Brand-less client
   * can't browse a catalog yet (Brand remains optional for the client/Project itself; this is the
   * point where configuring a Service genuinely needs one). Null renders a guard message instead of
   * the picker. */
  brandId: string | null;
  value: ProjectServiceSelection[];
  onChange: (value: ProjectServiceSelection[]) => void;
  /** Service Lines to hide from "Add a service" — already attached to this Project. Adding more
   * Activities to one of those happens on that Service's own Edit, not here (Section 13). */
  excludeServiceLineIds?: string[];
  /** Which surface this renders on — only changes the no-Brand guard's wording (Manual Acceptance
   * Step 2 Correction, Section 3): "new-project" never names the underlying Company/client layer and
   * offers to keep going without Services; "add-service" (an already-real Project) can say "this
   * Project" directly. Defaults to the more common "new-project" phrasing. */
  context?: "new-project" | "add-service";
}

/**
 * Shared "select an existing Service, then select its existing Activities" widget — reused by both
 * New Project creation's optional Services section and the Project Services tab's "Add Service"
 * flow (Section 27). Selects EXISTING global Service Lines/Activities only; never creates a new
 * catalog entry. Zero services selected is always valid.
 */
export function ProjectServicePicker({
  brandId,
  value,
  onChange,
  excludeServiceLineIds = [],
  context = "new-project",
}: ProjectServicePickerProps) {
  const { serviceLines } = useCompanyLookups();
  const [pendingAdd, setPendingAdd] = useState("");

  if (!brandId) {
    return (
      <p className="text-sm text-muted-foreground">
        {context === "new-project"
          ? "Choose a Partner Brand to configure Services and Activities. You can also create the Project now and add Services later."
          : "This Project has no Partner Brand set yet — add one before configuring Services."}
      </p>
    );
  }

  const usedIds = new Set([...value.map((v) => v.serviceLineId), ...excludeServiceLineIds]);
  const available = serviceLines.filter((sl) => !usedIds.has(sl.id));

  function addService(id: string) {
    if (!id) return;
    onChange([...value, { serviceLineId: id, activityIds: [] }]);
    setPendingAdd("");
  }

  function removeService(id: string) {
    onChange(value.filter((v) => v.serviceLineId !== id));
  }

  function setActivities(id: string, activityIds: string[]) {
    onChange(value.map((v) => (v.serviceLineId === id ? { ...v, activityIds } : v)));
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((entry) => {
        const sl = serviceLines.find((s) => s.id === entry.serviceLineId);
        return (
          <div key={entry.serviceLineId} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{sl?.name ?? entry.serviceLineId}</span>
              <button
                type="button"
                onClick={() => removeService(entry.serviceLineId)}
                aria-label={`Remove ${sl?.name ?? "service"}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <ServiceActivityFields
              brandId={brandId}
              serviceLineId={entry.serviceLineId}
              activityIds={entry.activityIds}
              onChange={(ids) => setActivities(entry.serviceLineId, ids)}
            />
          </div>
        );
      })}

      {available.length > 0 ? (
        <div className="flex gap-1.5">
          <Select
            items={Object.fromEntries(available.map((s) => [s.id, s.name]))}
            value={pendingAdd}
            onValueChange={(v) => setPendingAdd(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a service to add…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" disabled={!pendingAdd} onClick={() => addService(pendingAdd)}>
            Add
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {value.length > 0 ? "All available services are added." : "No services available."}
        </p>
      )}
    </div>
  );
}
