"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { isEmployee, isSupervisor } from "@/lib/data/permissions";
import { INTERNAL_COMPANY_ID } from "@/lib/data/constants";
import { workstreamsProvider } from "@/lib/data/providers";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import type { RecurrenceFrequency, WorkstreamStatus } from "@/lib/data/types";
import { FREQUENCY_LABEL } from "@/lib/data/recurrence";
import { deriveWorkstreamName, splitWorkstreamQualifier } from "@/lib/data/workstream-name";
import { WorkstreamStatusPicker } from "@/components/workstreams/workstream-status-picker";
import { TaskAssigneeChips } from "@/components/tasks/task-assignee-chips";
import {
  FormDrawer,
  FormDrawerHeader,
  FormDrawerBody,
  FormDrawerSection,
  FormDrawerPropertyGrid,
  FormDrawerField,
  FormDrawerFooter,
} from "@/components/ui/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
const NO_SERVICE_LINE = "none";

interface WorkstreamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** The workstream's company is fixed context, not user-editable — this dialog only opens from a company page or a Project workspace. */
  company: CompanyWithRelations;
  /** The Project this Service belongs to — required when opened from a Project workspace's own
   * "+ Add Service" action (Employee flow); omitted for the legacy Company-page flow, where the
   * provider resolves it from the Company's own single Project. */
  projectId?: string;
  workstream?: WorkstreamWithRelations;
  onSaved: () => void;
  /** Fires with the newly-created workstream on create — lets an embedded caller (e.g. the task form's inline "+ New workstream") pick it up directly instead of re-fetching. Never fires on edit. */
  onCreated?: (workstream: WorkstreamWithRelations) => void;
}

function emptyForm(defaultLeadId: string) {
  return {
    qualifier: "",
    description: "",
    serviceLineId: NO_SERVICE_LINE,
    activityIds: [] as string[],
    leadUserId: defaultLeadId,
    teamUserIds: [] as string[],
    status: "active" as WorkstreamStatus,
    startDate: "",
    endDate: "",
    recurring: false,
    recurrenceFrequency: "monthly" as RecurrenceFrequency,
    recurrenceAnchorDate: "",
    recurrenceCustomIntervalDays: "",
  };
}

export function WorkstreamFormDialog({
  open,
  onOpenChange,
  mode,
  company,
  projectId,
  workstream,
  onSaved,
  onCreated,
}: WorkstreamFormDialogProps) {
  const { user } = useAuth();
  const { assignableStaff, serviceLines } = useCompanyLookups();

  const [form, setForm] = useState(() => emptyForm(user?.id ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedServiceLine = serviceLines.find((sl) => sl.id === form.serviceLineId) ?? null;
  // Only fetch a real, service-scoped catalog once a service is actually picked — while "None" is
  // selected the Activities section below is hidden entirely, so an unscoped fetch here would never
  // be shown, just wasted.
  const { departments: activityDepartments } = useActivityCatalog(
    selectedServiceLine ? company.brand?.id : undefined,
    selectedServiceLine ? selectedServiceLine.id : undefined
  );

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    if (workstream) {
      setForm({
        qualifier: splitWorkstreamQualifier(workstream.name, workstream.serviceLine?.name ?? null),
        description: workstream.description ?? "",
        serviceLineId: workstream.serviceLineId ?? NO_SERVICE_LINE,
        activityIds: workstream.activities.map((a) => a.id),
        leadUserId: workstream.leadUserId,
        teamUserIds: workstream.team.map((u) => u.id),
        status: workstream.status,
        startDate: workstream.startDate ?? "",
        endDate: workstream.endDate ?? "",
        recurring: workstream.recurrenceFrequency != null,
        recurrenceFrequency: workstream.recurrenceFrequency ?? "monthly",
        recurrenceAnchorDate: workstream.recurrenceAnchorDate ?? workstream.startDate ?? "",
        recurrenceCustomIntervalDays:
          workstream.recurrenceCustomIntervalDays != null ? String(workstream.recurrenceCustomIntervalDays) : "",
      });
    } else {
      // An Employee always leads their own new Service — never optional, never someone else's
      // (mirrors the real workstreams_insert RLS check). A creating Supervisor defaults onto
      // themselves too, but can still pick someone else; superadmins pick explicitly since they
      // don't personally lead client work.
      setForm(emptyForm(isEmployee(user) || isSupervisor(user) ? user.id : ""));
    }
  }, [open, workstream, user]);

  // The Internal/Non-billable company is the one canonical exception (same INTERNAL_COMPANY_ID
  // sentinel every other visibility/access check in this app already keys off) — every other,
  // normal client company must have a real Service. Editing an already-existing legacy workstream
  // that predates this requirement (serviceLineId already null) is also allowed to keep "None," so
  // opening Edit and saving without touching Service never destroys it; a brand-new workstream, or
  // one that already has a real service, never gets that option.
  const isInternalCompany = company.id === INTERNAL_COMPANY_ID;
  const allowNoService = isInternalCompany || (mode === "edit" && (workstream?.serviceLineId ?? null) === null);
  const serviceSatisfied = allowNoService || form.serviceLineId !== NO_SERVICE_LINE;

  // A service with real catalog activities requires at least one selected — a service with none
  // configured yet (or "no service" in the allowed cases above) never blocks saving on this.
  const activityRequired = form.serviceLineId !== NO_SERVICE_LINE && activityDepartments.length > 0;
  const activitiesSatisfied = !activityRequired || form.activityIds.length > 0;

  const canSubmit = !isSubmitting && form.leadUserId.length > 0 && serviceSatisfied && activitiesSatisfied;

  // Cmd/Ctrl+Enter submits from anywhere in the panel, guarded by the same validity check the submit
  // button itself uses — same document-level-listener pattern the Task form panel uses, since a
  // form-level onKeyDown misses cases where focus lands on <body>.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        // Capture phase, ahead of whatever control currently has focus — a status pill or the
        // recurrence Switch both treat a bare Enter as their own activation key, which would
        // otherwise re-toggle that control (e.g. flipping the switch back off) before this handler
        // ever saw the event, since bubble-phase listeners run after the focused element's own.
        e.preventDefault();
        e.stopPropagation();
        if (canSubmit) void submitForm();
      }
    }
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [open, canSubmit, submitForm]);

  if (!user) return null;

  function setLead(id: string) {
    setForm((prev) => ({ ...prev, leadUserId: id }));
  }

  function toggleTeamMember(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      teamUserIds: checked ? [...prev.teamUserIds, id] : prev.teamUserIds.filter((uid) => uid !== id),
    }));
  }

  function toggleActivity(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      activityIds: checked ? [...prev.activityIds, id] : prev.activityIds.filter((aid) => aid !== id),
    }));
  }

  /** Picking a different service starts activity selection fresh — the old service's activities never carry over as a stale, invisible selection. */
  function handleServiceLineChange(next: string) {
    setForm((prev) => (prev.serviceLineId === next ? prev : { ...prev, serviceLineId: next, activityIds: [] }));
  }

  async function submitForm() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const serviceLineId = form.serviceLineId === NO_SERVICE_LINE ? null : form.serviceLineId;
      const input = {
        name: deriveWorkstreamName(selectedServiceLine?.name ?? null, form.qualifier),
        description: form.description.trim() || null,
        companyId: company.id,
        projectId,
        serviceLineId,
        activityIds: form.activityIds,
        leadUserId: isEmployee(user) ? user.id : form.leadUserId,
        teamUserIds: isEmployee(user) ? [] : form.teamUserIds,
        status: form.status,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        recurrenceFrequency: form.recurring ? form.recurrenceFrequency : null,
        recurrenceAnchorDate: form.recurring ? form.recurrenceAnchorDate || form.startDate || null : null,
        recurrenceCustomIntervalDays:
          form.recurring && form.recurrenceFrequency === "custom" && form.recurrenceCustomIntervalDays
            ? Number(form.recurrenceCustomIntervalDays)
            : null,
      };
      if (mode === "edit" && workstream) {
        await workstreamsProvider.updateWorkstream(user, workstream.id, input);
        onSaved();
        onOpenChange(false);
      } else {
        const created = await workstreamsProvider.createWorkstream(user, input);
        onSaved();
        onCreated?.(created);
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save workstream.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitForm();
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      srTitle={mode === "create" ? `New service for ${company.name}` : `Editing "${workstream?.name ?? "this service"}"`}
    >
      <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
        <FormDrawerHeader
          title={mode === "create" ? "New Service" : "Edit Service"}
          context={company.name}
          secondaryContext={company.brand ? `Partner brand: ${company.brand.name}` : "No Brand set for this client yet"}
        />
        <FormDrawerBody>
          <FormDrawerSection label="Service">
            <div className="flex flex-col gap-1.5">
              <Select
                items={{
                  ...(allowNoService ? { [NO_SERVICE_LINE]: "Select a service…" } : {}),
                  ...Object.fromEntries(serviceLines.map((sl) => [sl.id, sl.name])),
                }}
                value={form.serviceLineId}
                onValueChange={(v) => handleServiceLineChange(v ?? NO_SERVICE_LINE)}
              >
                <SelectTrigger
                  autoFocus
                  id="workstream-service-line"
                  aria-label="Service / Workstream"
                  className="h-auto w-full justify-start gap-2 rounded-none border-0 bg-transparent p-0 text-xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
                >
                  <SelectValue placeholder="Select a service…" />
                </SelectTrigger>
                <SelectContent>
                  {allowNoService && <SelectItem value={NO_SERVICE_LINE}>None</SelectItem>}
                  {serviceLines.map((sl) => (
                    <SelectItem key={sl.id} value={sl.id}>
                      {sl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!serviceSatisfied && (
                <p className="text-xs text-warning">Required — every client workstream represents one service.</p>
              )}
            </div>

            <FormDrawerField label="Reference / qualifier (optional)" htmlFor="workstream-qualifier">
              <Input
                id="workstream-qualifier"
                value={form.qualifier}
                onChange={(e) => setForm((p) => ({ ...p, qualifier: e.target.value }))}
                placeholder="e.g. UK Payroll, Monthly Payroll, 2026"
              />
            </FormDrawerField>

            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Add a description…"
              rows={1}
              className="min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-1 text-sm shadow-none focus-visible:ring-0"
            />
          </FormDrawerSection>

          <FormDrawerSection label="Ownership">
            {isEmployee(user) ? (
              <FormDrawerField label="Lead">
                <p className="text-sm text-muted-foreground">You — Services you create are always your own.</p>
              </FormDrawerField>
            ) : (
              <>
                <FormDrawerField label="Lead" htmlFor="workstream-lead">
                  <Select
                    items={Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName]))}
                    value={form.leadUserId}
                    onValueChange={(v) => setLead(v ?? "")}
                  >
                    <SelectTrigger id="workstream-lead" className="w-full">
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
                </FormDrawerField>

                <FormDrawerField label="Team">
                  <TaskAssigneeChips staff={assignableStaff} selectedIds={form.teamUserIds} onToggle={toggleTeamMember} />
                </FormDrawerField>
              </>
            )}
          </FormDrawerSection>

          <FormDrawerSection label="Schedule">
            <FormDrawerPropertyGrid>
              <FormDrawerField label="Status">
                <WorkstreamStatusPicker value={form.status} onChange={(status) => setForm((p) => ({ ...p, status }))} />
              </FormDrawerField>
              <div />
              <FormDrawerField label="Start date" htmlFor="workstream-start-date">
                <Input
                  id="workstream-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                />
              </FormDrawerField>
              <FormDrawerField label="Service end date" htmlFor="workstream-end-date">
                <Input
                  id="workstream-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                />
              </FormDrawerField>
            </FormDrawerPropertyGrid>
            <p className="text-xs text-muted-foreground">
              Start/end are both optional — an ongoing service doesn&apos;t need a fixed end date.
            </p>

            <label className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">This service recurs</span>
                <span className="text-xs text-muted-foreground">
                  Set a cadence so &quot;Generate next occurrence&quot; knows when the next period is due.
                </span>
              </div>
              <Switch
                checked={form.recurring}
                onCheckedChange={(checked) =>
                  setForm((p) => ({
                    ...p,
                    recurring: checked,
                    recurrenceAnchorDate: p.recurrenceAnchorDate || p.startDate,
                  }))
                }
              />
            </label>

            {/* Progressive disclosure via the Switch itself, not a separate "More options" toggle —
                recurrence is either on or off, so its own on/off control IS the disclosure trigger. */}
            {form.recurring && (
              <FormDrawerPropertyGrid>
                <FormDrawerField label="Frequency" htmlFor="workstream-recurrence-frequency">
                  <Select
                    items={FREQUENCY_LABEL}
                    value={form.recurrenceFrequency}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, recurrenceFrequency: (v ?? "monthly") as RecurrenceFrequency }))
                    }
                  >
                    <SelectTrigger id="workstream-recurrence-frequency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormDrawerField>
                <FormDrawerField label="Anchor date" htmlFor="workstream-recurrence-anchor">
                  <Input
                    id="workstream-recurrence-anchor"
                    type="date"
                    value={form.recurrenceAnchorDate}
                    onChange={(e) => setForm((p) => ({ ...p, recurrenceAnchorDate: e.target.value }))}
                  />
                </FormDrawerField>
                {form.recurrenceFrequency === "custom" && (
                  <div className="col-span-2">
                    <FormDrawerField label="Repeat every (days)" htmlFor="workstream-recurrence-custom-days">
                      <Input
                        id="workstream-recurrence-custom-days"
                        type="number"
                        min="1"
                        value={form.recurrenceCustomIntervalDays}
                        onChange={(e) => setForm((p) => ({ ...p, recurrenceCustomIntervalDays: e.target.value }))}
                      />
                    </FormDrawerField>
                  </div>
                )}
                <p className="col-span-2 text-xs text-muted-foreground">
                  The anchor is the fixed reference date the cadence steps from — it stays put even as new
                  occurrences get generated, so the schedule never drifts.
                </p>
              </FormDrawerPropertyGrid>
            )}
          </FormDrawerSection>

          <FormDrawerSection label={selectedServiceLine ? `${selectedServiceLine.name} Activities` : "Activities"}>
            {form.serviceLineId === NO_SERVICE_LINE ? (
              <p className="text-sm text-muted-foreground">Select a service to configure its activities.</p>
            ) : activityDepartments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activities set up for this service yet.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Select the Activities this Project will use for this Service.
                </p>
                <div className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
                  {activityDepartments.map((dept) => (
                    <div key={dept.id} className="flex flex-col gap-1.5">
                      {activityDepartments.length > 1 && (
                        <span className="text-xs font-medium text-muted-foreground">{dept.name}</span>
                      )}
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {dept.activities.map((activity) => (
                          <label key={activity.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={form.activityIds.includes(activity.id)}
                              onCheckedChange={(checked) => toggleActivity(activity.id, checked === true)}
                            />
                            {activity.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {!activitiesSatisfied && (
                  <p className="text-xs text-warning">Select at least one activity to continue.</p>
                )}
              </>
            )}
          </FormDrawerSection>

          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </FormDrawerBody>

        <FormDrawerFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? "Saving…" : mode === "create" ? "Create service" : "Save changes"}
          </Button>
        </FormDrawerFooter>
      </form>
    </FormDrawer>
  );
}
