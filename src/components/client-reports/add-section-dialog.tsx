"use client";

import { useMemo, useState } from "react";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import type { ClientReportDepartmentSection } from "@/lib/data/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  departments: ClientReportDepartmentSection[];
  onAdd: (input: { departmentId: string; departmentName: string; activityId: string; activityName: string }) => void;
}

/** Picks an activity from the brand's full catalog to add as an empty section — "+ Add section" from the request. Already-included activities are filtered out; picking one appends a section with zero line items the generator fills in by hand via "Add line." */
export function AddSectionDialog({ open, onOpenChange, brandId, departments, onAdd }: AddSectionDialogProps) {
  const { departments: catalog } = useActivityCatalog(brandId);
  const [search, setSearch] = useState("");

  const includedActivityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const dept of departments) {
      for (const activity of dept.activities) {
        if (activity.activityId) ids.add(activity.activityId);
      }
    }
    return ids;
  }, [departments]);

  const query = search.trim().toLowerCase();
  const filteredCatalog = catalog
    .map((dept) => ({
      ...dept,
      activities: dept.activities.filter(
        (a) => !includedActivityIds.has(a.id) && (query === "" || a.name.toLowerCase().includes(query))
      ),
    }))
    .filter((dept) => dept.activities.length > 0);

  function handlePick(departmentId: string, departmentName: string, activityId: string, activityName: string) {
    onAdd({ departmentId, departmentName, activityId, activityName });
    onOpenChange(false);
    setSearch("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add section</DialogTitle>
          <DialogDescription>Pick an activity that wasn&apos;t auto-detected this period.</DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activities…"
          aria-label="Search activities"
        />

        <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
          {filteredCatalog.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {catalog.length === 0 ? "No activities set up for this brand yet." : "Everything matching is already in the report."}
            </p>
          ) : (
            filteredCatalog.map((dept) => (
              <div key={dept.id} className="flex flex-col gap-1">
                <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{dept.name}</span>
                <div className="flex flex-col">
                  {dept.activities.map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => handlePick(dept.id, dept.name, activity.id, activity.name)}
                      className="rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                      {activity.name}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
