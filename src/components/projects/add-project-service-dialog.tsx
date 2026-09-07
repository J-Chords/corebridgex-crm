"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { workstreamsProvider } from "@/lib/data/providers";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import { deriveWorkstreamName } from "@/lib/data/workstream-name";
import { isEmployee, isSuperadmin } from "@/lib/data/permissions";
import { ProjectServicePicker, type ProjectServiceSelection } from "@/components/projects/project-service-picker";
import { Sheet, SheetContent, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface AddProjectServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyWithRelations;
  projectId: string;
  /** Service Lines already attached to this Project — hidden from the picker so this can never create
   * a duplicate Project Service (Section 13); adding more Activities to an existing one happens on
   * that Service's own Edit instead. */
  existingServiceLineIds: string[];
  onSaved: () => void;
}

/**
 * Plain "attach an existing Service (+ existing Activities) to this Project" flow — the Project
 * Services tab's "Add Service" action, reachable by any role `canCreateWorkstreamInProject` allows
 * (Admin/Team Lead always; an Employee who can already access this Project). Reuses the same
 * `ProjectServicePicker` as New Project creation's optional Services section (Section 27) and the
 * same canonical `createWorkstream` call — no team/dates/recurrence, not the richer Workstream form
 * (Admin-only, reachable via a Service's own Edit for lead/team/schedule/recurrence — Boss Feedback
 * Alignment, Section 6).
 *
 * Boss Feedback Alignment, Sections 4-8 — Project Service Lead is a real, visible operational
 * responsibility here, never a silent side effect of who happened to click the button. An Employee
 * has no real choice under `create_workstream`'s own authorization (they may only ever lead a Service
 * they create themselves), so they get a locked, explicit line saying so instead of a picker with one
 * option. A Team Lead (Supervisor) or Admin (Superadmin) gets a real Lead `Select`, reusing
 * `assignableStaff` — the exact same viewer-scoped eligibility list (self + direct reports for a
 * Supervisor, every active user for a Superadmin) `WorkstreamFormDialog`'s own Lead field already
 * uses, so this never exposes a name `create_workstream` would reject, and never widens eligibility
 * via global Team Lead/Works In Services staffing. Created By (the actual creator, `createdById`)
 * stays entirely separate from Project Service Lead (`leadUserId`) — this dialog only ever sets the
 * latter.
 */
export function AddProjectServiceDialog({
  open,
  onOpenChange,
  company,
  projectId,
  existingServiceLineIds,
  onSaved,
}: AddProjectServiceDialogProps) {
  const { user } = useAuth();
  const { serviceLines, assignableStaff } = useCompanyLookups();
  const [services, setServices] = useState<ProjectServiceSelection[]>([]);
  const [leadUserId, setLeadUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServices([]);
    setLeadUserId(user.id);
    setError(null);
  }, [open, user]);

  if (!user) return null;

  const canSubmit = !isSubmitting && services.length > 0 && Boolean(leadUserId);

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
          leadUserId,
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-service-lead">Project Service Lead</Label>
                {isEmployee(user) ? (
                  <p className="text-sm text-muted-foreground">
                    You will be assigned as the Project Service Lead for this Service — the operational
                    owner within this Project.
                  </p>
                ) : (
                  <>
                    <Select
                      items={Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName]))}
                      value={leadUserId}
                      onValueChange={(v) => setLeadUserId(v ?? "")}
                    >
                      <SelectTrigger id="add-service-lead" className="w-full">
                        <SelectValue placeholder="Select lead" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableStaff.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {isSuperadmin(user)
                        ? "The operational owner of this Service within this Project — any active team member."
                        : "The operational owner of this Service within this Project — yourself or one of your own direct reports."}
                    </p>
                  </>
                )}
              </div>

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
