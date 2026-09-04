"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { workstreamsProvider } from "@/lib/data/providers";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import { deriveWorkstreamName } from "@/lib/data/workstream-name";
import { ProjectServicePicker, type ProjectServiceSelection } from "@/components/projects/project-service-picker";
import { Sheet, SheetContent, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface AddProjectServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyWithRelations;
  projectId: string;
  /** Defaults each newly-attached Service's lead — the Project's own owner, matching the New Project
   * "Services" section's same default. */
  ownerId: string;
  /** Service Lines already attached to this Project — hidden from the picker so this can never create
   * a duplicate Project Service (Section 13); adding more Activities to an existing one happens on
   * that Service's own Edit instead. */
  existingServiceLineIds: string[];
  onSaved: () => void;
}

/**
 * Plain "attach an existing Service (+ existing Activities) to this Project" flow — the Project
 * Services tab's "Add Service" action. Reuses the same `ProjectServicePicker` as New Project
 * creation's optional Services section (Section 27) and the same canonical `createWorkstream` call,
 * with sensible defaults (lead = Project owner, no team/dates/recurrence) since this is a plain
 * association, not the richer Workstream form (still reachable via a Service's own Edit for
 * lead/team/schedule/recurrence).
 */
export function AddProjectServiceDialog({
  open,
  onOpenChange,
  company,
  projectId,
  ownerId,
  existingServiceLineIds,
  onSaved,
}: AddProjectServiceDialogProps) {
  const { user } = useAuth();
  const { serviceLines } = useCompanyLookups();
  const [services, setServices] = useState<ProjectServiceSelection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServices([]);
    setError(null);
  }, [open]);

  if (!user) return null;

  const canSubmit = !isSubmitting && services.length > 0;

  async function submitForm() {
    setError(null);
    setIsSubmitting(true);
    try {
      for (const svc of services) {
        const serviceLineName = serviceLines.find((sl) => sl.id === svc.serviceLineId)?.name ?? null;
        await workstreamsProvider.createWorkstream(user!, {
          name: deriveWorkstreamName(serviceLineName, ""),
          description: null,
          companyId: company.id,
          projectId,
          serviceLineId: svc.serviceLineId,
          leadUserId: ownerId,
          teamUserIds: [],
          status: "active",
          startDate: null,
          endDate: null,
          recurrenceFrequency: null,
          recurrenceAnchorDate: null,
          recurrenceCustomIntervalDays: null,
          activityIds: svc.activityIds,
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add service.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitForm();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-2 px-6 pt-6 pb-2">
              <SheetTitle className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                Add service
              </SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                Select an existing Service for {company.name} and the Activities that apply.
              </SheetDescription>
            </div>
            <div className="flex flex-col gap-4 px-6 py-4">
              <ProjectServicePicker
                brandId={company.brand?.id ?? null}
                value={services}
                onChange={setServices}
                excludeServiceLineIds={existingServiceLineIds}
                context="add-service"
              />
              {error && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
            </div>
          </div>
          <SheetFooter className="flex-row justify-end gap-2 border-t bg-card">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Adding…" : "Add service"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
