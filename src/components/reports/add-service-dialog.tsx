"use client";

import { useMemo, useState } from "react";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import type { AccomplishmentsReportBrandSection } from "@/lib/data/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  section: AccomplishmentsReportBrandSection;
  onAddActivity: (departmentId: string, departmentName: string, activityId: string, activityName: string) => void;
  onAddOther: () => void;
}

/** Picks an activity that wasn't auto-detected this period — the direct sibling of Client Report's own `AddSectionDialog`, same search-a-catalog-grouped-by-department shape. Picking one appends a single blank activity line to its department (creating the department if it isn't already in the report); "Other" is offered the same way once it isn't already showing. */
export function AddServiceDialog({ open, onOpenChange, brandId, section, onAddActivity, onAddOther }: AddServiceDialogProps) {
  const { departments: catalog } = useActivityCatalog(brandId);
  const [search, setSearch] = useState("");

  const includedActivityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const dept of section.departments) {
      for (const activity of dept.activities) {
        if (activity.activityId) ids.add(activity.activityId);
      }
    }
    return ids;
  }, [section.departments]);

  const query = search.trim().toLowerCase();
  const filteredCatalog = catalog
    .map((dept) => ({
      ...dept,
      activities: dept.activities.filter(
        (a) => !includedActivityIds.has(a.id) && (query === "" || a.name.toLowerCase().includes(query))
      ),
    }))
    .filter((dept) => dept.activities.length > 0);
  const otherAvailable = !section.otherIncluded && (query === "" || "other".includes(query));

  function handlePick(departmentId: string, departmentName: string, activityId: string, activityName: string) {
    onAddActivity(departmentId, departmentName, activityId, activityName);
    onOpenChange(false);
    setSearch("");
  }

  function handlePickOther() {
    onAddOther();
    onOpenChange(false);
    setSearch("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add service</DialogTitle>
          <DialogDescription>Pick an activity that wasn&apos;t auto-detected this period.</DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services…"
          aria-label="Search services"
        />

        <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
          {filteredCatalog.length === 0 && !otherAvailable ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {catalog.length === 0 ? "No services set up for this brand yet." : "Everything matching is already in the report."}
            </p>
          ) : (
            <>
              {filteredCatalog.map((dept) => (
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
              ))}
              {otherAvailable && (
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Other</span>
                  <button
                    type="button"
                    onClick={handlePickOther}
                    className="rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    Other (untagged)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
