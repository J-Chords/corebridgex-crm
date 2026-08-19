"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { projectsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { TaskAssigneeChips } from "@/components/tasks/task-assignee-chips";
import { Sheet, SheetContent, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function nextAnnualName(currentName: string, currentStart: string | null, newStart: string): string {
  if (!currentStart) return currentName;
  const oldYear = new Date(currentStart).getUTCFullYear();
  const newYear = new Date(newStart).getUTCFullYear();
  // "{Company} 2025-2026" -> "{Company} 2026-2027" when the name follows the exact established
  // pattern; otherwise fall back to appending the new period rather than guessing at a rewrite.
  const pattern = `${oldYear}-${oldYear + 1}`;
  if (currentName.includes(pattern)) {
    return currentName.replace(pattern, `${newYear}-${newYear + 1}`);
  }
  return `${currentName} ${newYear}-${newYear + 1}`;
}

function FormSection({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", className)}>
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  );
}

interface ProjectRenewalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithRelations;
  onRenewed: (newProject: ProjectWithRelations) => void;
}

/**
 * Superadmin-only "Renew Project" (Phase 8E) — an explicit review/preview surface, never a blind
 * one-click duplication: the new annual Project's name/dates/owner/members are all editable before
 * submission, and every current Service is an individually-uncheckable carry-forward candidate.
 * Nothing is copied until "Renew project" is pressed; the source Project is never touched.
 */
export function ProjectRenewalDialog({ open, onOpenChange, project, onRenewed }: ProjectRenewalDialogProps) {
  const { user } = useAuth();
  const { assignableStaff } = useCompanyLookups();
  const { workstreams: services } = useWorkstreams({ projectId: project.id });

  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState(project.ownerId);
  const [memberUserIds, setMemberUserIds] = useState<string[]>(project.members.map((m) => m.id));
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractMonths, setContractMonths] = useState(String(project.contractMonths ?? 12));
  const [contractEndDate, setContractEndDate] = useState("");
  const [carryForwardIds, setCarryForwardIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    const defaultStart = project.contractEndDate
      ? addMonths(project.contractEndDate, 0)
      : project.contractStartDate
        ? addMonths(project.contractStartDate, project.contractMonths ?? 12)
        : "";
    setContractStartDate(defaultStart);
    setContractMonths(String(project.contractMonths ?? 12));
    setOwnerId(project.ownerId);
    setMemberUserIds(project.members.map((m) => m.id));
    // Every current Service is a pre-checked carry-forward candidate — Superadmin reviews and
    // unchecks any they don't want, rather than opting in from zero.
    setCarryForwardIds(new Set(services.map((s) => s.id)));
  }, [open, project, services]);

  useEffect(() => {
    if (!contractStartDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(nextAnnualName(project.name, project.contractStartDate, contractStartDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractStartDate]);

  const suggestedEnd = contractStartDate ? addMonths(contractStartDate, Number(contractMonths) || 12) : null;

  if (!user) return null;

  function toggleService(id: string, checked: boolean) {
    setCarryForwardIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleMember(id: string, checked: boolean) {
    setMemberUserIds((prev) => (checked ? [...prev, id] : prev.filter((uid) => uid !== id)));
  }

  const canSubmit = !isSubmitting && name.trim().length > 0 && ownerId.length > 0;

  async function submit() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const newProject = await projectsProvider.renewProject(user, project.id, {
        name: name.trim(),
        contractStartDate: contractStartDate || null,
        contractMonths: Number(contractMonths) || 12,
        contractEndDate: contractEndDate || suggestedEnd || null,
        ownerId,
        memberUserIds,
        workstreamIdsToCarryForward: Array.from(carryForwardIds),
      });
      onRenewed(newProject);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to renew project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1 px-6 pt-6 pb-2">
              <SheetTitle className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                Renew project
              </SheetTitle>
              <SheetDescription>
                Creates a new annual Project under {project.companyName}, for the period below. {project.name} is kept
                exactly as-is — its own history, Tasks, and time are never touched or moved.
              </SheetDescription>
            </div>

            <div className="flex flex-col gap-4 px-6 py-4">
              <FormSection label="New project">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="renewal-name">Name</Label>
                  <Input id="renewal-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Owner</Label>
                    <Select
                      items={Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName]))}
                      value={ownerId}
                      onValueChange={(v) => setOwnerId(v ?? "")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableStaff.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="renewal-start">Contract start</Label>
                    <Input id="renewal-start" type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="renewal-months">Duration (months)</Label>
                    <Input id="renewal-months" type="number" min="1" value={contractMonths} onChange={(e) => setContractMonths(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="renewal-end">Contract end</Label>
                    <Input id="renewal-end" type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} />
                    {suggestedEnd && suggestedEnd !== contractEndDate && (
                      <button
                        type="button"
                        onClick={() => setContractEndDate(suggestedEnd)}
                        className="w-fit text-left text-xs text-primary hover:underline"
                      >
                        Use suggested: {suggestedEnd}
                      </button>
                    )}
                  </div>
                </div>
              </FormSection>

              <FormSection label="Members">
                <TaskAssigneeChips staff={assignableStaff} selectedIds={memberUserIds} onToggle={toggleMember} />
              </FormSection>

              <FormSection label="Services to carry forward">
                <p className="text-xs text-muted-foreground">
                  Each Service becomes a brand-new Service under the new Project — its own current lead (if still active),
                  team, and selected Activities carry forward; start date resets to the new contract start, end date is
                  left blank for review, and status starts Active. No Tasks, time, notes, or history are ever copied.
                </p>
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This project has no Services yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {services.map((service) => (
                      <label key={service.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={carryForwardIds.has(service.id)}
                          onCheckedChange={(checked) => toggleService(service.id, checked === true)}
                        />
                        {workstreamDisplayHeading(service.name, service.serviceLine?.name ?? null)}
                      </label>
                    ))}
                  </div>
                )}
              </FormSection>

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
            <Button type="button" disabled={!canSubmit} onClick={submit}>
              {isSubmitting ? "Renewing…" : "Renew project"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
