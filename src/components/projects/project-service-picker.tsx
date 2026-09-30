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
  serviceLineId: string;
  activityIds: string[];
  onChange: (activityIds: string[]) => void;
}

/** Reused by `ProjectServicePicker` below — one Service's own Activity checkboxes, grouped by Department, exactly mirroring `WorkstreamFormDialog`'s existing Activities section so the two configuration surfaces read identically. Phase 3 (CD-208) — canonical Template Activities are Brand-independent, so this queries the catalog by Service Line only, never scoped/gated by any Brand. */
function ServiceActivityFields({ serviceLineId, activityIds, onChange }: ServiceActivityFieldsProps) {
  const { departments } = useActivityCatalog(undefined, serviceLineId);

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...activityIds, id] : activityIds.filter((a) => a !== id));
  }

  if (departments.length === 0) {
    return <p className="text-xs text-muted-foreground">No activities set up for this template yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {departments.map((dept) => (
        <div key={dept.id} className="flex flex-col gap-1">
          {departments.length > 1 && <span className="text-xs font-medium text-muted-foreground">{dept.name}</span>}
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {/* This is always a brand-new configuration (freshly-added Service, activityIds starts
                empty) — never offer an inactive Activity as a new choice here (Activity Level,
                Section 21). */}
            {dept.activities.filter((activity) => activity.isActive).map((activity) => (
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
  value: ProjectServiceSelection[];
  onChange: (value: ProjectServiceSelection[]) => void;
  /** Service Lines to hide from "Add a service" — already attached to this Project. Adding more
   * Activities to one of those happens on that Service's own Edit, not here (Section 13). */
  excludeServiceLineIds?: string[];
}

/**
 * Shared "select an existing Service, then select its existing Activities" widget — reused by both
 * New Project creation's optional Services section and the Project Services tab's "Add Service"
 * flow (Section 27). Selects EXISTING global Service Lines/Activities only; never creates a new
 * catalog entry. Zero services selected is always valid. Phase 3 (CD-208) — canonical Template
 * Activities are Brand-independent (Partner Brand never gates which Templates/Activities are
 * available), so this no longer takes or requires a Brand at all.
 */
export function ProjectServicePicker({
  value,
  onChange,
  excludeServiceLineIds = [],
}: ProjectServicePickerProps) {
  const { serviceLines } = useCompanyLookups();
  const [pendingAdd, setPendingAdd] = useState("");

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
                aria-label={`Remove ${sl?.name ?? "template"}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <ServiceActivityFields
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
              <SelectValue placeholder="Select a Template to add…" />
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
          {value.length > 0 ? "All available Templates are added." : "No Templates available."}
        </p>
      )}
    </div>
  );
}
