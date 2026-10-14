"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, ListChecks, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { templatesProvider } from "@/lib/data/providers";
import type { TemplateWithTasks, TemplateBundleInput } from "@/lib/data/providers/templates-provider";
import type { RecurrenceFrequency, Role, ServiceLine } from "@/lib/data/types";
import { FREQUENCY_LABEL } from "@/lib/data/recurrence";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormDrawerHeader, FormDrawerBody } from "@/components/ui/form-drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ExpectedTimeInput } from "@/components/ui/expected-time-input";
import { ChecklistBuilder } from "@/components/tasks/checklist-builder";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BuilderChecklistItem {
  key: string;
  id: string | null;
  description: string;
}

interface BuilderTask {
  key: string;
  id: string | null;
  title: string;
  description: string;
  dueDaysAfterStart: string;
  expectedMinutes: number | null;
  defaultOwnerRole: Role | null;
  checklistItems: BuilderChecklistItem[];
}

interface BuilderDetails {
  name: string;
  description: string;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceCustomIntervalDays: string;
}

type Step = "details" | "tasks" | "preview";

function emptyDetails(): BuilderDetails {
  return { name: "", description: "", recurrenceFrequency: null, recurrenceCustomIntervalDays: "" };
}

function emptyTask(): BuilderTask {
  return {
    key: crypto.randomUUID(),
    id: null,
    title: "",
    description: "",
    dueDaysAfterStart: "",
    expectedMinutes: null,
    defaultOwnerRole: null,
    checklistItems: [],
  };
}

function hydrateFromTemplate(template: TemplateWithTasks): { details: BuilderDetails; tasks: BuilderTask[] } {
  return {
    details: {
      name: template.name,
      description: template.description ?? "",
      recurrenceFrequency: template.recurrenceFrequency,
      recurrenceCustomIntervalDays:
        template.recurrenceFrequency === "custom" && template.recurrenceCustomIntervalDays != null
          ? String(template.recurrenceCustomIntervalDays)
          : "",
    },
    tasks: template.tasks.map((task) => ({
      key: crypto.randomUUID(),
      id: task.id,
      title: task.title,
      description: task.description,
      dueDaysAfterStart: task.dueDaysAfterStart != null ? String(task.dueDaysAfterStart) : "",
      expectedMinutes: task.expectedMinutes,
      defaultOwnerRole: task.defaultOwnerRole,
      checklistItems: task.checklistItems.map((ci) => ({ key: crypto.randomUUID(), id: ci.id, description: ci.description })),
    })),
  };
}

/** CD-222 (A2) — same copy as `hydrateFromTemplate`, except every persistence id is stripped (`id:
 * null`) and the name gets a "(Copy)" suffix. Used only to pre-fill a Duplicate — never passed to
 * `template`, so `isEdit` stays false and Save always goes through `createTemplateBundle`, never
 * `updateTemplateBundle`. The source Reusable Template's own rows, and any real Task already
 * materialized from it, are never read for writing and never touched. */
function hydrateForDuplicate(source: TemplateWithTasks): { details: BuilderDetails; tasks: BuilderTask[] } {
  const hydrated = hydrateFromTemplate(source);
  return {
    details: { ...hydrated.details, name: `${source.name} (Copy)` },
    tasks: hydrated.tasks.map((task) => ({
      ...task,
      id: null,
      checklistItems: task.checklistItems.map((ci) => ({ ...ci, id: null })),
    })),
  };
}

function moveItem<T>(arr: T[], index: number, direction: "up" | "down"): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

interface ReusableTemplateBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The parent Template (the `service_lines` row whose detail page this dialog was opened from) —
   * always known from context, so this dialog never asks the admin to choose a Service. Fixed for
   * both create and edit; there is no "move to a different parent Template" action in V1. */
  serviceLine: ServiceLine;
  /** Omit to create a new Reusable Template under `serviceLine`. */
  template?: TemplateWithTasks;
  /** CD-222 (A2) — pre-fills a Duplicate of this Reusable Template (same parent, fresh identities,
   * "(Copy)"-suffixed name). Mutually exclusive with `template` in practice — a caller should only
   * ever set one of the two at a time; if both were somehow set, `template` (edit) wins, matching
   * `isEdit`'s own derivation below. Never causes `isEdit` to become true. */
  duplicateFrom?: TemplateWithTasks;
  onSaved: (saved: TemplateWithTasks) => void;
}

/**
 * CD-218 — Reusable Template Builder. ONE component for both Create and Edit (never two forms),
 * reached from inside an existing Template's own detail page
 * (`/dashboard/admin/templates/[id]`) rather than a separate top-level admin surface — the parent
 * Template (`service_lines` row) is always already known from that context, so Step 1 never asks
 * for a Service. Structurally modeled on `ApplyTemplateDialog`'s own proven form-state -> preview
 * -> commit shape, but authoring a Reusable Template rather than applying one. Tasks and their own
 * Checklist Items are combined into a single "Tasks" step (each Task card owns an inline
 * `ChecklistBuilder`) rather than two disconnected steps. Preview performs zero writes: it is
 * rendered purely from this component's own in-memory state, exactly like every other step.
 */
export function ReusableTemplateBuilderDialog({
  open,
  onOpenChange,
  serviceLine,
  template,
  duplicateFrom,
  onSaved,
}: ReusableTemplateBuilderDialogProps) {
  const { user } = useAuth();
  const isEdit = Boolean(template);
  const isDuplicate = !isEdit && Boolean(duplicateFrom);

  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<BuilderDetails>(emptyDetails);
  const [tasks, setTasks] = useState<BuilderTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("details");
    setError(null);
    if (template) {
      const hydrated = hydrateFromTemplate(template);
      setDetails(hydrated.details);
      setTasks(hydrated.tasks);
    } else if (duplicateFrom) {
      const hydrated = hydrateForDuplicate(duplicateFrom);
      setDetails(hydrated.details);
      setTasks(hydrated.tasks);
    } else {
      setDetails(emptyDetails());
      setTasks([]);
    }
  }, [open, template, duplicateFrom]);

  if (!user) return null;

  function updateTask(key: string, patch: Partial<BuilderTask>) {
    setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  function removeTask(key: string) {
    setTasks((prev) => prev.filter((t) => t.key !== key));
  }

  function addTask() {
    setTasks((prev) => [...prev, emptyTask()]);
  }

  function moveTask(key: string, direction: "up" | "down") {
    setTasks((prev) => {
      const index = prev.findIndex((t) => t.key === key);
      if (index === -1) return prev;
      return moveItem(prev, index, direction);
    });
  }

  function addChecklistItem(taskKey: string, description: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.key === taskKey
          ? { ...t, checklistItems: [...t.checklistItems, { key: crypto.randomUUID(), id: null, description }] }
          : t
      )
    );
  }

  function updateChecklistItem(taskKey: string, itemKey: string, description: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.key === taskKey
          ? { ...t, checklistItems: t.checklistItems.map((ci) => (ci.key === itemKey ? { ...ci, description } : ci)) }
          : t
      )
    );
  }

  function removeChecklistItem(taskKey: string, itemKey: string) {
    setTasks((prev) =>
      prev.map((t) => (t.key === taskKey ? { ...t, checklistItems: t.checklistItems.filter((ci) => ci.key !== itemKey) } : t))
    );
  }

  function moveChecklistItem(taskKey: string, itemKey: string, direction: "up" | "down") {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.key !== taskKey) return t;
        const index = t.checklistItems.findIndex((ci) => ci.key === itemKey);
        if (index === -1) return t;
        return { ...t, checklistItems: moveItem(t.checklistItems, index, direction) };
      })
    );
  }

  /** Mirrors the backend's own validation (see the CD-218 migration's comments) — run client-side
   * purely to gate reaching Preview with a clear message, never as the source of truth; the RPC/mock
   * re-validates everything regardless, including the parent Template's own active state (not
   * re-checked here — it's fixed, not a user choice, so any rejection surfaces as an ordinary
   * server error rather than a pre-emptive client block). */
  function firstValidationError(): string | null {
    if (!details.name.trim()) return "Reusable Template name is required.";
    if (details.recurrenceFrequency === "custom") {
      const n = Number(details.recurrenceCustomIntervalDays);
      if (!details.recurrenceCustomIntervalDays.trim() || !Number.isInteger(n) || n <= 0) {
        return "Custom recurrence requires a positive interval in days.";
      }
    }
    for (const task of tasks) {
      if (!task.title.trim()) return "Every Task requires a title.";
      if (task.dueDaysAfterStart.trim()) {
        const n = Number(task.dueDaysAfterStart);
        if (!Number.isInteger(n) || n < 0) return "Due offset must be zero or a positive number of days.";
      }
      if (task.expectedMinutes != null && task.expectedMinutes < 0) {
        return "Estimated time must be zero or a positive number of minutes.";
      }
      for (const ci of task.checklistItems) {
        if (!ci.description.trim()) return "A Checklist item cannot be blank.";
      }
    }
    return null;
  }

  function goToPreview() {
    const problem = firstValidationError();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep("preview");
  }

  function buildPayload(): TemplateBundleInput {
    return {
      name: details.name.trim(),
      description: details.description.trim() || null,
      serviceLineId: serviceLine.id,
      recurrenceFrequency: details.recurrenceFrequency,
      recurrenceCustomIntervalDays:
        details.recurrenceFrequency === "custom" ? Number(details.recurrenceCustomIntervalDays) : null,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title.trim(),
        description: task.description.trim(),
        defaultOwnerRole: task.defaultOwnerRole,
        dueDaysAfterStart: task.dueDaysAfterStart.trim() ? Number(task.dueDaysAfterStart) : null,
        expectedMinutes: task.expectedMinutes,
        checklistItems: task.checklistItems.map((ci) => ({ id: ci.id, description: ci.description.trim() })),
      })),
    };
  }

  async function handleSave() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const payload = buildPayload();
      // Saving an edit never implicitly reactivates — Active/Inactive is its own separate action,
      // untouched by this bundle call either way.
      const saved = isEdit
        ? await templatesProvider.updateTemplateBundle(user, template!.id, payload)
        : await templatesProvider.createTemplateBundle(user, payload);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      // Keep every field exactly as the admin left it — only the error banner changes.
      setError(err instanceof Error ? err.message : "Unable to save this Reusable Template.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalChecklistItems = tasks.reduce((sum, t) => sum + t.checklistItems.length, 0);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      srTitle={isEdit ? "Edit Reusable Template" : isDuplicate ? "Duplicate Reusable Template" : "New Reusable Template"}
    >
      <div className="flex h-full min-h-0 flex-col">
        <FormDrawerHeader
          title={isEdit ? "Edit Reusable Template" : isDuplicate ? "Duplicate Reusable Template" : "New Reusable Template"}
          context={
            step === "details"
              ? isDuplicate
                ? `For ${serviceLine.name} — review the duplicated name, description, and recurrence before creating it.`
                : `For ${serviceLine.name} — name, description, and recurrence.`
              : step === "tasks"
                ? "Add the Tasks this Reusable Template creates, and each Task's own Checklist Items."
                : isDuplicate
                  ? "Review the duplicated Reusable Template before it saves. Nothing is saved yet — this is a new, independent copy."
                  : "Review the full Reusable Template before it saves. Nothing is saved yet."
          }
        />

        <FormDrawerBody>
          {step === "details" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reusable-template-name">Reusable Template Name</Label>
                  <Input
                    id="reusable-template-name"
                    autoFocus
                    value={details.name}
                    onChange={(e) => setDetails((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Payroll Client Onboarding"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reusable-template-description">Description (optional)</Label>
                  <Textarea
                    id="reusable-template-description"
                    value={details.description}
                    onChange={(e) => setDetails((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What this Reusable Template is for…"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reusable-template-recurrence">Recurrence</Label>
                    <Select
                      items={{ none: "None", ...FREQUENCY_LABEL }}
                      value={details.recurrenceFrequency ?? "none"}
                      onValueChange={(v) =>
                        setDetails((p) => ({
                          ...p,
                          recurrenceFrequency: !v || v === "none" ? null : (v as RecurrenceFrequency),
                        }))
                      }
                    >
                      <SelectTrigger id="reusable-template-recurrence" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(Object.keys(FREQUENCY_LABEL) as RecurrenceFrequency[]).map((freq) => (
                          <SelectItem key={freq} value={freq}>
                            {FREQUENCY_LABEL[freq]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {details.recurrenceFrequency === "custom" && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reusable-template-custom-interval">Custom interval (days)</Label>
                      <Input
                        id="reusable-template-custom-interval"
                        type="text"
                        inputMode="numeric"
                        value={details.recurrenceCustomIntervalDays}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^\d*$/.test(v)) setDetails((p) => ({ ...p, recurrenceCustomIntervalDays: v }));
                        }}
                        placeholder="e.g. 45"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === "tasks" && (
              <div className="flex flex-col gap-3">
                {tasks.length === 0 && (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No Tasks yet — a Reusable Template may have zero Tasks, or add one below.
                  </p>
                )}
                {tasks.map((task, index) => (
                  <Card key={task.key} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-5"
                          disabled={index === 0}
                          onClick={() => moveTask(task.key, "up")}
                          aria-label={`Move Task "${task.title || index + 1}" up`}
                        >
                          <ChevronUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-5"
                          disabled={index === tasks.length - 1}
                          onClick={() => moveTask(task.key, "down")}
                          aria-label={`Move Task "${task.title || index + 1}" down`}
                        >
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                            Task {index + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeTask(task.key)}
                            aria-label={`Remove Task ${index + 1}`}
                          >
                            <X />
                          </Button>
                        </div>
                        <Input
                          value={task.title}
                          onChange={(e) => updateTask(task.key, { title: e.target.value })}
                          placeholder="Task title"
                          aria-label={`Task ${index + 1} title`}
                        />
                        <Textarea
                          value={task.description}
                          onChange={(e) => updateTask(task.key, { description: e.target.value })}
                          placeholder="Description (optional)"
                          rows={2}
                          aria-label={`Task ${index + 1} description`}
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Due offset (days)</Label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={task.dueDaysAfterStart}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (/^\d*$/.test(v)) updateTask(task.key, { dueDaysAfterStart: v });
                              }}
                              placeholder="e.g. 5"
                            />
                          </div>
                          <div className="col-span-1 flex flex-col gap-1.5">
                            <Label className="text-xs">Estimate</Label>
                            <ExpectedTimeInput
                              valueMinutes={task.expectedMinutes}
                              onChange={(minutes) => updateTask(task.key, { expectedMinutes: minutes })}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Suggested owner</Label>
                            <Select
                              items={{ none: "No hint", ...ROLE_LABELS }}
                              value={task.defaultOwnerRole ?? "none"}
                              onValueChange={(v) =>
                                updateTask(task.key, { defaultOwnerRole: !v || v === "none" ? null : (v as Role) })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No hint</SelectItem>
                                {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          A hint only — Tasks are still created unassigned when this Reusable Template is applied.
                        </p>

                        <div className="flex flex-col gap-1.5 border-t pt-3">
                          <Label className="text-xs">
                            <ListChecks className="mr-1 inline size-3.5" aria-hidden="true" />
                            Checklist
                          </Label>
                          <ChecklistBuilder
                            items={task.checklistItems.map((ci) => ({ key: ci.key, description: ci.description }))}
                            onAdd={(description) => addChecklistItem(task.key, description)}
                            onUpdate={(key, description) => updateChecklistItem(task.key, key, description)}
                            onRemove={(key) => removeChecklistItem(task.key, key)}
                            onMove={(key, direction) => moveChecklistItem(task.key, key, direction)}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                <Button type="button" variant="outline" onClick={addTask}>
                  <Plus /> Add Task
                </Button>
              </div>
            )}

            {step === "preview" && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Parent Template: {serviceLine.name}</p>
                  <p className="text-sm font-medium">{details.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {details.recurrenceFrequency && FREQUENCY_LABEL[details.recurrenceFrequency]}
                    {details.recurrenceFrequency === "custom" &&
                      details.recurrenceCustomIntervalDays &&
                      ` (every ${details.recurrenceCustomIntervalDays} days)`}
                    {!details.recurrenceFrequency && "No recurrence"}
                  </p>
                  {details.description && <p className="mt-2 text-sm">{details.description}</p>}
                </div>

                <p className="text-sm font-medium">
                  {tasks.length} Task{tasks.length === 1 ? "" : "s"} · {totalChecklistItems} Checklist item
                  {totalChecklistItems === 1 ? "" : "s"}
                </p>

                <div className="flex flex-col gap-1">
                  {tasks.map((task, i) => (
                    <div key={task.key}>
                      {i > 0 && <Separator className="my-2" />}
                      <div className="flex items-start justify-between gap-3 py-1">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{task.title}</span>
                          {task.description && <span className="text-xs text-muted-foreground">{task.description}</span>}
                          <span className="text-xs text-muted-foreground">
                            {task.dueDaysAfterStart && `Due ${task.dueDaysAfterStart} days after start`}
                            {task.dueDaysAfterStart && task.expectedMinutes != null && " · "}
                            {task.expectedMinutes != null && `${task.expectedMinutes} min estimate`}
                          </span>
                          {task.checklistItems.length > 0 && (
                            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                              {task.checklistItems.map((ci) => (
                                <li key={ci.key}>{ci.description}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {task.defaultOwnerRole && (
                          <Badge variant="neutral" className="shrink-0 capitalize">
                            Suggested: {ROLE_LABELS[task.defaultOwnerRole]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
        </FormDrawerBody>

        <div className="mt-auto flex flex-row items-center justify-between gap-2 border-t bg-card px-6 py-4 max-sm:px-4">
          <div>
            {step !== "details" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(step === "preview" ? "tasks" : "details")}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step === "details" && (
              <Button type="button" onClick={() => setStep("tasks")} disabled={!details.name.trim()}>
                Next
              </Button>
            )}
            {step === "tasks" && (
              <Button type="button" onClick={goToPreview}>
                Preview
              </Button>
            )}
            {step === "preview" && (
              <Button type="button" disabled={isSubmitting} onClick={handleSave}>
                {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : isDuplicate ? "Create Duplicate" : "Create Reusable Template"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
