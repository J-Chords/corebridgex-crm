"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { workstreamsProvider, tasksProvider } from "@/lib/data/providers";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { addDaysToDateString, daysBetween, formatPeriodLabel, formatRecurrenceDate } from "@/lib/data/recurrence";
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GenerateOccurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The recurring, active (not-yet-superseded) workstream this occurrence continues from. */
  workstream: WorkstreamWithRelations;
  /** The source workstream's current tasks — cloned into the new occurrence. Passed in rather than re-fetched since the detail page already has them. */
  sourceTasks: TaskWithRelations[];
  onGenerated: () => void;
}

function suggestName(workstream: WorkstreamWithRelations, startDate: string): string {
  const frequency = workstream.recurrence?.frequency ?? null;
  return `${workstream.name} (${formatPeriodLabel(startDate, frequency)})`;
}

/** Shifts an end date by the same day-span the workstream itself had, so a multi-week engagement keeps its own length in the new period. */
function shiftEndDate(oldStart: string | null, oldEnd: string | null, newStart: string): string | null {
  if (!oldStart || !oldEnd) return null;
  return addDaysToDateString(newStart, daysBetween(oldStart, oldEnd));
}

function emptyForm(workstream: WorkstreamWithRelations, startDate: string) {
  return {
    name: suggestName(workstream, startDate),
    startDate,
    endDate: shiftEndDate(workstream.startDate, workstream.endDate, startDate) ?? "",
    leadUserId: workstream.leadUserId,
    teamUserIds: workstream.team.map((u) => u.id),
  };
}

export function GenerateOccurrenceDialog({
  open,
  onOpenChange,
  workstream,
  sourceTasks,
  onGenerated,
}: GenerateOccurrenceDialogProps) {
  const { user } = useAuth();
  const { assignableStaff } = useCompanyLookups();
  const router = useRouter();

  const nextStartDate = workstream.recurrence?.nextOccurrenceDate ?? null;

  const [step, setStep] = useState<"form" | "preview">("form");
  const [nameTouched, setNameTouched] = useState(false);
  const [form, setForm] = useState(() => emptyForm(workstream, nextStartDate ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || nextStartDate == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("form");
    setError(null);
    setNameTouched(false);
    setForm(emptyForm(workstream, nextStartDate));
    // Only re-derive the starting form when the dialog opens for a (possibly different) workstream —
    // not on every keystroke, which would stomp on in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workstream.id, nextStartDate]);

  if (!user || nextStartDate == null) return null;

  const referenceStartDate = workstream.startDate ?? workstream.recurrenceAnchorDate;

  function updateStartDate(startDate: string) {
    setForm((p) => ({
      ...p,
      startDate,
      endDate: shiftEndDate(workstream.startDate, workstream.endDate, startDate) ?? p.endDate,
      name: !nameTouched ? suggestName(workstream, startDate) : p.name,
    }));
  }

  function toggleTeamMember(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      teamUserIds: checked ? [...prev.teamUserIds, id] : prev.teamUserIds.filter((uid) => uid !== id),
    }));
  }

  function shiftedDueDate(task: TaskWithRelations): string | null {
    if (!task.dueDate || !referenceStartDate) return null;
    return addDaysToDateString(form.startDate, daysBetween(referenceStartDate, task.dueDate));
  }

  /** Same real, deliberate recurrence-shift math as `shiftedDueDate` — carries a source Task's own
   * real Start Date forward by the same interval, never fabricating one for a Task that didn't
   * have one. */
  function shiftedStartDate(task: TaskWithRelations): string | null {
    if (!task.startDate || !referenceStartDate) return null;
    return addDaysToDateString(form.startDate, daysBetween(referenceStartDate, task.startDate));
  }

  async function handleConfirm() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      // Carry forward exactly the source workstream's configured activity scope — never silently
      // expand to the whole service's catalog. The cloned tasks' own activityIds are unioned in too,
      // as a safety net for a legacy source workstream with no persisted associations of its own
      // (its tasks' activities came from the old brand/service-wide fallback, not an explicit list).
      const carriedActivityIds = Array.from(
        new Set([
          ...workstream.activities.map((a) => a.id),
          ...sourceTasks.map((t) => t.activityId).filter((id): id is string => id != null),
        ])
      );

      const created = await workstreamsProvider.createWorkstream(user, {
        name: form.name.trim(),
        description: workstream.description,
        companyId: workstream.companyId,
        projectId: workstream.projectId,
        serviceLineId: workstream.serviceLineId,
        activityIds: carriedActivityIds,
        leadUserId: form.leadUserId,
        teamUserIds: form.teamUserIds,
        status: "active",
        startDate: form.startDate,
        endDate: form.endDate || null,
        recurrenceFrequency: workstream.recurrenceFrequency,
        recurrenceAnchorDate: workstream.recurrenceAnchorDate,
        recurrenceCustomIntervalDays: workstream.recurrenceCustomIntervalDays,
        previousOccurrenceWorkstreamId: workstream.id,
      });

      for (const task of sourceTasks) {
        const assigneeIds = task.assignees.map((a) => a.id);
        await tasksProvider.createTask(user, {
          title: task.title,
          description: task.description,
          workstreamId: created.id,
          assigneeIds,
          allowUnassigned: assigneeIds.length === 0,
          status: "todo",
          priority: task.priority,
          startDate: shiftedStartDate(task),
          dueDate: shiftedDueDate(task),
          expectedMinutes: task.expectedMinutes,
          activityId: task.activityId,
          checklistItems: task.checklistItems.map((ci) => ({ description: ci.description })),
          templateId: task.templateId ?? undefined,
        });
      }

      onGenerated();
      onOpenChange(false);
      router.push(`/dashboard/workstreams/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate the next occurrence.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canPreview = Boolean(form.name.trim() && form.leadUserId && form.startDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate next occurrence</DialogTitle>
          <DialogDescription>
            {step === "form"
              ? `Create the next period's service for "${workstream.name}", reusing its current tasks with due dates shifted forward.`
              : "Review what this will create before it commits."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <>
            <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
              <FloatingLabelInput
                label="Service name"
                required
                value={form.name}
                onChange={(e) => {
                  setNameTouched(true);
                  setForm((p) => ({ ...p, name: e.target.value }));
                }}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="generate-occurrence-start-date">Start date</Label>
                  <Input
                    id="generate-occurrence-start-date"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => updateStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="generate-occurrence-end-date">End date</Label>
                  <Input
                    id="generate-occurrence-end-date"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="generate-occurrence-lead">Lead</Label>
                <Select
                  items={Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName]))}
                  value={form.leadUserId}
                  onValueChange={(v) => setForm((p) => ({ ...p, leadUserId: v ?? "" }))}
                >
                  <SelectTrigger id="generate-occurrence-lead" className="w-full">
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
          <>
            <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">{form.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {workstream.company.name} · Starts {formatRecurrenceDate(form.startDate)}
                  {form.endDate && ` · Ends ${formatRecurrenceDate(form.endDate)}`}
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
                  {`${sourceTasks.length} task${sourceTasks.length === 1 ? "" : "s"} will be created, reusing this service's current tasks and assignees`}
                </p>
                {sourceTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This service has no tasks yet — only the service itself will be created.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {sourceTasks.map((task, i) => {
                      const dueDate = shiftedDueDate(task);
                      return (
                        <div key={task.id}>
                          {i > 0 && <Separator className="my-2" />}
                          <div className="flex flex-col gap-0.5 py-1">
                            <span className="text-sm font-medium">{task.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {task.checklistItems.length} checklist item{task.checklistItems.length === 1 ? "" : "s"}
                              {dueDate && ` · Due ${formatRecurrenceDate(dueDate)}`}
                              {task.assignees.length > 0 &&
                                ` · ${task.assignees.map((a) => a.fullName).join(", ")}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                {isSubmitting ? "Creating…" : `Create service & ${sourceTasks.length} task${sourceTasks.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
