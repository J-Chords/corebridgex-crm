"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTemplates } from "@/lib/data/hooks/use-templates";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { isSupervisor } from "@/lib/data/permissions";
import { workstreamsProvider, tasksProvider } from "@/lib/data/providers";
import type { TemplateWithTasks } from "@/lib/data/providers/templates-provider";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import { addDaysToDateString, formatPeriodLabel } from "@/lib/data/recurrence";
import { formatExpectedTime } from "@/lib/data/expected-time";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ApplyTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: CompanyWithRelations;
  onApplied: () => void;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function suggestWorkstreamName(template: TemplateWithTasks, company: CompanyWithRelations, startDate: string) {
  return `${template.name} — ${company.name} (${formatPeriodLabel(startDate, template.recurrenceFrequency)})`;
}

/** Null when no template task carries an estimate — otherwise the sum, treating unestimated tasks as 0. */
function totalExpectedMinutes(template: TemplateWithTasks): number | null {
  if (!template.tasks.some((tt) => tt.expectedMinutes != null)) return null;
  return template.tasks.reduce((sum, tt) => sum + (tt.expectedMinutes ?? 0), 0);
}

function emptyForm(defaultLeadId: string) {
  return {
    templateId: "",
    name: "",
    leadUserId: defaultLeadId,
    teamUserIds: [] as string[],
    startDate: todayDateString(),
  };
}

export function ApplyTemplateDialog({ open, onOpenChange, company, onApplied }: ApplyTemplateDialogProps) {
  const { user } = useAuth();
  const { templates } = useTemplates();
  const { assignableStaff } = useCompanyLookups();
  const router = useRouter();

  const [step, setStep] = useState<"form" | "preview">("form");
  const [form, setForm] = useState(() => emptyForm(user?.id ?? ""));
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const template = templates.find((t) => t.id === form.templateId);

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("form");
    setError(null);
    setNameTouched(false);
    setForm(emptyForm(isSupervisor(user) ? user.id : ""));
  }, [open, user]);

  if (!user) return null;

  function selectTemplate(templateId: string) {
    const next = templates.find((t) => t.id === templateId);
    setForm((p) => ({
      ...p,
      templateId,
      name: !nameTouched && next ? suggestWorkstreamName(next, company, p.startDate) : p.name,
    }));
  }

  function updateStartDate(startDate: string) {
    setForm((p) => ({
      ...p,
      startDate,
      name: !nameTouched && template ? suggestWorkstreamName(template, company, startDate) : p.name,
    }));
  }

  function toggleTeamMember(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      teamUserIds: checked ? [...prev.teamUserIds, id] : prev.teamUserIds.filter((uid) => uid !== id),
    }));
  }

  async function handleConfirm() {
    if (!user || !template) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const workstream = await workstreamsProvider.createWorkstream(user, {
        name: form.name.trim(),
        description: template.description,
        companyId: company.id,
        serviceLineId: template.serviceLineId,
        // Templates have no Activity concept of their own — the new workstream starts with no
        // activities configured; a supervisor/superadmin can select them afterward via Edit.
        activityIds: [],
        leadUserId: form.leadUserId,
        teamUserIds: form.teamUserIds,
        status: "active",
        startDate: form.startDate,
        endDate: null,
        recurrenceFrequency: template.recurrenceFrequency,
        recurrenceAnchorDate: template.recurrenceFrequency ? form.startDate : null,
        recurrenceCustomIntervalDays: template.recurrenceCustomIntervalDays,
      });

      for (const templateTask of template.tasks) {
        const dueDate =
          templateTask.dueDaysAfterStart != null
            ? addDaysToDateString(form.startDate, templateTask.dueDaysAfterStart)
            : null;
        await tasksProvider.createTask(user, {
          title: templateTask.title,
          description: templateTask.description,
          workstreamId: workstream.id,
          assigneeIds: [],
          allowUnassigned: true,
          status: "todo",
          priority: "medium",
          dueDate,
          expectedMinutes: templateTask.expectedMinutes,
          checklistItems: templateTask.checklistItems.map((ci) => ({ description: ci.description })),
          templateId: templateTask.id,
        });
      }

      onApplied();
      onOpenChange(false);
      router.push(`/dashboard/workstreams/${workstream.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply template.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canPreview = Boolean(form.templateId && form.name.trim() && form.leadUserId && form.startDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply template</DialogTitle>
          <DialogDescription>
            {step === "form"
              ? `Create a new workstream for ${company.name} from a standard template.`
              : "Review what this will create before it commits."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <>
            <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="apply-template-select">Template</Label>
                <Select
                  items={Object.fromEntries(templates.map((t) => [t.id, t.name]))}
                  value={form.templateId}
                  onValueChange={(v) => selectTemplate(v ?? "")}
                >
                  <SelectTrigger id="apply-template-select" className="w-full">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {template && (
                  <p className="text-xs text-muted-foreground">
                    {template.description} {template.tasks.length} task{template.tasks.length === 1 ? "" : "s"} will
                    be created.
                  </p>
                )}
              </div>

              <FloatingLabelInput
                label="Workstream name"
                required
                value={form.name}
                onChange={(e) => {
                  setNameTouched(true);
                  setForm((p) => ({ ...p, name: e.target.value }));
                }}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="apply-template-start-date">Start date</Label>
                  <Input
                    id="apply-template-start-date"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => updateStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="apply-template-lead">Lead</Label>
                  <Select
                    items={Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName]))}
                    value={form.leadUserId}
                    onValueChange={(v) => setForm((p) => ({ ...p, leadUserId: v ?? "" }))}
                  >
                    <SelectTrigger id="apply-template-lead" className="w-full">
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
                </div>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Team</legend>
                {assignableStaff.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No assignable staff found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {assignableStaff.map((staff) => (
                      <label key={staff.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.teamUserIds.includes(staff.id)}
                          onCheckedChange={(checked) => toggleTeamMember(staff.id, checked === true)}
                        />
                        {staff.fullName}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!canPreview} onClick={() => setStep("preview")}>
                Preview
              </Button>
            </DialogFooter>
          </>
        ) : (
          template && (
            <>
              <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{form.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {company.name} · {template.serviceLine?.name ?? "No service line"} · Starts{" "}
                    {formatDate(form.startDate)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lead: {assignableStaff.find((s) => s.id === form.leadUserId)?.fullName ?? "—"}
                    {form.teamUserIds.length > 0 &&
                      ` · Team: ${form.teamUserIds
                        .map((id) => assignableStaff.find((s) => s.id === id)?.fullName)
                        .filter(Boolean)
                        .join(", ")}`}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">
                    {template.tasks.length} task{template.tasks.length === 1 ? "" : "s"} will be created (unassigned
                    — assign owners from the workstream afterward)
                    {totalExpectedMinutes(template) != null &&
                      ` · ${formatExpectedTime(totalExpectedMinutes(template))} expected total`}
                  </p>
                  <div className="flex flex-col gap-1">
                    {template.tasks.map((tt, i) => (
                      <div key={tt.id}>
                        {i > 0 && <Separator className="my-2" />}
                        <div className="flex items-start justify-between gap-3 py-1">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium">{tt.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {tt.checklistItems.length} checklist item{tt.checklistItems.length === 1 ? "" : "s"}
                              {tt.dueDaysAfterStart != null &&
                                ` · Due ${formatDate(addDaysToDateString(form.startDate, tt.dueDaysAfterStart))}`}
                              {tt.expectedMinutes != null && ` · ${formatExpectedTime(tt.expectedMinutes)}`}
                            </span>
                          </div>
                          {tt.defaultOwnerRole && (
                            <Badge variant="neutral" className="shrink-0 capitalize">
                              Suggested: {tt.defaultOwnerRole}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
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
                <Button type="button" variant="outline" onClick={() => setStep("form")}>
                  Back
                </Button>
                <Button type="button" disabled={isSubmitting} onClick={handleConfirm}>
                  {isSubmitting ? "Creating…" : `Create workstream & ${template.tasks.length} tasks`}
                </Button>
              </DialogFooter>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
