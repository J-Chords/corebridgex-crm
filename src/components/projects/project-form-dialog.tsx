"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { projectsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import type { ProjectStatus } from "@/lib/data/types";
import { TaskAssigneeChips } from "@/components/tasks/task-assignee-chips";
import { Sheet, SheetContent, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const STATUS_ITEMS: Record<ProjectStatus, string> = {
  active: "Active",
  "on-hold": "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  project?: ProjectWithRelations;
  onSaved: () => void;
}

/** Suggests "{Company} {startYear}-{endYear}" once a real contract start date exists — the same
 * naming convention the Phase 8A backfill already established — never forced, always editable. */
function suggestedName(companyName: string, contractStartDate: string) {
  const startYear = new Date(contractStartDate).getUTCFullYear();
  return `${companyName} ${startYear}-${startYear + 1}`;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function emptyForm(defaultOwnerId: string) {
  return {
    companyId: "",
    name: "",
    ownerId: defaultOwnerId,
    status: "active" as ProjectStatus,
    contractStartDate: "",
    contractMonths: "12",
    contractEndDate: "",
    description: "",
    memberUserIds: [] as string[],
  };
}

function FormSection({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", className)}>
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  );
}

/** Superadmin-only Project create/edit — mirrors WorkstreamFormDialog's Sheet/form/FormSection
 * shell and Cmd/Ctrl+Enter/error-Alert conventions exactly, so a new admin surface doesn't
 * introduce a second visual language. */
export function ProjectFormDialog({ open, onOpenChange, mode, project, onSaved }: ProjectFormDialogProps) {
  const { user } = useAuth();
  const { companies } = useCompanies();
  const { assignableStaff } = useCompanyLookups();

  const [form, setForm] = useState(() => emptyForm(user?.id ?? ""));
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCompany = companies.find((c) => c.id === form.companyId);

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    if (project) {
      setForm({
        companyId: project.companyId,
        name: project.name,
        ownerId: project.ownerId,
        status: project.status,
        contractStartDate: project.contractStartDate ?? "",
        contractMonths: String(project.contractMonths ?? 12),
        contractEndDate: project.contractEndDate ?? "",
        description: project.description ?? "",
        memberUserIds: project.members.map((m) => m.id),
      });
      setNameTouched(true);
    } else {
      setForm(emptyForm(user.id));
      setNameTouched(false);
    }
  }, [open, project, user]);

  // Keeps the suggested name in sync with Company/start-date choices until the user types their
  // own name — the exact same "smart default until manually overridden" pattern the qualifier
  // field on WorkstreamFormDialog established, just applied to a full name instead of a suffix.
  useEffect(() => {
    if (nameTouched || mode === "edit" || !selectedCompany || !form.contractStartDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((p) => ({ ...p, name: suggestedName(selectedCompany.name, form.contractStartDate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.name, form.contractStartDate, nameTouched, mode]);

  const suggestedEnd =
    form.contractStartDate && form.contractMonths
      ? addMonths(form.contractStartDate, Number(form.contractMonths) || 12)
      : null;

  const canSubmit =
    !isSubmitting &&
    form.name.trim().length > 0 &&
    form.companyId.length > 0 &&
    form.ownerId.length > 0;

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (canSubmit) void submitForm();
      }
    }
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canSubmit]);

  if (!user) return null;

  function toggleMember(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      memberUserIds: checked ? [...prev.memberUserIds, id] : prev.memberUserIds.filter((uid) => uid !== id),
    }));
  }

  async function submitForm() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const input = {
        companyId: form.companyId,
        name: form.name.trim(),
        ownerId: form.ownerId,
        status: form.status,
        contractStartDate: form.contractStartDate || null,
        contractMonths: Number(form.contractMonths) || 12,
        contractEndDate: form.contractEndDate || null,
        description: form.description.trim() || null,
        memberUserIds: form.memberUserIds,
      };
      if (mode === "edit" && project) {
        await projectsProvider.updateProject(user, project.id, input);
      } else {
        await projectsProvider.createProject(user, input);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save project.");
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
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-2 px-6 pt-6 pb-2">
              <SheetTitle className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                {mode === "create" ? "New project" : "Edit project"}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {mode === "create" ? "Create a new annual client Project." : `Editing "${project?.name ?? "this project"}".`}
              </SheetDescription>
              <Input
                autoFocus
                value={form.name}
                onChange={(e) => {
                  setNameTouched(true);
                  setForm((p) => ({ ...p, name: e.target.value }));
                }}
                placeholder="Project name"
                aria-label="Project name"
                className="h-auto rounded-none border-0 bg-transparent p-0 font-heading text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
              />
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Add a description…"
                rows={1}
                className="min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-1 text-sm shadow-none focus-visible:ring-0"
              />
            </div>

            <div className="flex flex-col gap-4 px-6 py-4">
              <FormSection label="Client">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-company">Company</Label>
                  {mode === "edit" ? (
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{project?.companyName}</p>
                  ) : (
                    <Select
                      items={Object.fromEntries(companies.map((c) => [c.id, c.name]))}
                      value={form.companyId}
                      onValueChange={(v) => setForm((p) => ({ ...p, companyId: v ?? "" }))}
                    >
                      <SelectTrigger id="project-company" className="w-full">
                        <SelectValue placeholder="Select a company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A Project is one annual engagement — the Company itself is permanent and unaffected by which Projects it has.
                  </p>
                </div>
              </FormSection>

              <FormSection label="Details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Status</Label>
                    <Select
                      items={STATUS_ITEMS}
                      value={form.status}
                      onValueChange={(v) => setForm((p) => ({ ...p, status: (v ?? "active") as ProjectStatus }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_ITEMS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-owner">Owner</Label>
                    <Select
                      items={Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName]))}
                      value={form.ownerId}
                      onValueChange={(v) => setForm((p) => ({ ...p, ownerId: v ?? "" }))}
                    >
                      <SelectTrigger id="project-owner" className="w-full">
                        <SelectValue placeholder="Select owner" />
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
                    <Label htmlFor="project-start">Contract start</Label>
                    <Input
                      id="project-start"
                      type="date"
                      value={form.contractStartDate}
                      onChange={(e) => setForm((p) => ({ ...p, contractStartDate: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-months">Duration (months)</Label>
                    <Input
                      id="project-months"
                      type="number"
                      min="1"
                      value={form.contractMonths}
                      onChange={(e) => setForm((p) => ({ ...p, contractMonths: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-end">Contract end</Label>
                    <Input
                      id="project-end"
                      type="date"
                      value={form.contractEndDate}
                      onChange={(e) => setForm((p) => ({ ...p, contractEndDate: e.target.value }))}
                    />
                    {suggestedEnd && suggestedEnd !== form.contractEndDate && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, contractEndDate: suggestedEnd }))}
                        className="w-fit text-left text-xs text-primary hover:underline"
                      >
                        Use suggested: {suggestedEnd}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Both dates are optional and always independently stored — an Internal/Non-billable Project has no annual
                  contract. Duration only suggests an end date; it never overrides one you set yourself.
                </p>
              </FormSection>

              <FormSection label="Members">
                <TaskAssigneeChips staff={assignableStaff} selectedIds={form.memberUserIds} onToggle={toggleMember} />
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
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
