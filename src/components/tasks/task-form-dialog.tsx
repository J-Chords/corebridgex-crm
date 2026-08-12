"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, History, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { tasksProvider } from "@/lib/data/providers";
import type { TaskReuseCandidate, TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { DepartmentWithActivities } from "@/lib/data/providers/activity-catalog-provider";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { isEmployee } from "@/lib/data/permissions";
import type { TaskPriority, TaskStatus } from "@/lib/data/types";
import { TaskStatusPicker } from "@/components/tasks/task-status-picker";
import { TaskPriorityPicker } from "@/components/tasks/task-priority-picker";
import { TaskAssigneeChips } from "@/components/tasks/task-assignee-chips";
import { ChecklistBuilder, type ChecklistBuilderRow } from "@/components/tasks/checklist-builder";
import { ReusePastTaskDialog } from "@/components/tasks/reuse-past-task-dialog";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { ExpectedTimeInput } from "@/components/ui/expected-time-input";
import { Sheet, SheetContent, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NO_ACTIVITY = "none";

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at", "by", "with", "from"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

interface ActivitySuggestion {
  activityId: string;
  activityName: string;
  departmentName: string;
}

/** Dead-simple keyword overlap between the task title and each activity's name — no fuzzy matching, just a starting-point hint the user can apply or dismiss. */
function suggestActivity(title: string, departments: DepartmentWithActivities[]): ActivitySuggestion | null {
  const titleTokens = new Set(tokenize(title));
  if (titleTokens.size === 0) return null;

  let best: ActivitySuggestion | null = null;
  let bestScore = 0;
  for (const dept of departments) {
    for (const activity of dept.activities) {
      const score = tokenize(activity.name).filter((t) => titleTokens.has(t)).length;
      if (score > bestScore) {
        bestScore = score;
        best = { activityId: activity.id, activityName: activity.name, departmentName: dept.name };
      }
    }
  }
  return best;
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  task?: TaskWithRelations;
  defaultWorkstreamId?: string;
  onSaved: () => void;
}

const ALL_COMPANIES = "all";

function emptyForm(userId: string, defaultWorkstreamId?: string) {
  return {
    title: "",
    description: "",
    companyId: ALL_COMPANIES,
    workstreamId: defaultWorkstreamId ?? "",
    activityId: NO_ACTIVITY,
    assigneeIds: [userId],
    status: "todo" as TaskStatus,
    priority: "medium" as TaskPriority,
    dueDate: "",
    expectedMinutes: null as number | null,
    checklist: [] as ChecklistBuilderRow[],
  };
}

/** Mono micro-label + bordered group — the "grouped sections, not one long stack" shape every group in this panel shares. */
function FormSection({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", className)}>
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  );
}

export function TaskFormDialog({ open, onOpenChange, mode, task, defaultWorkstreamId, onSaved }: TaskFormDialogProps) {
  const { user } = useAuth();
  const { companies } = useCompanies();
  const [form, setForm] = useState(() => emptyForm(user?.id ?? "", defaultWorkstreamId));
  const { workstreams, refresh: refreshWorkstreams } = useWorkstreams({
    companyId: form.companyId === ALL_COMPANIES ? undefined : form.companyId,
  });
  const { assignableStaff } = useCompanyLookups();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dismissedSuggestionId, setDismissedSuggestionId] = useState<string | null>(null);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [newWorkstreamOpen, setNewWorkstreamOpen] = useState(false);

  const selectedWorkstream = workstreams.find((w) => w.id === form.workstreamId);
  const { departments } = useActivityCatalog(selectedWorkstream?.brand.id, selectedWorkstream?.serviceLineId ?? undefined);
  // "+ New workstream" needs a concrete client to create into — same constraint WorkstreamFormDialog
  // already has everywhere else it's used (it only ever opens from within a specific company's page).
  const companyForNewWorkstream = form.companyId === ALL_COMPANIES ? null : companies.find((c) => c.id === form.companyId);

  // A task prefilled from a workstream (a workstream detail page's own "Add task") knows its client
  // already but can't set `companyId` synchronously — the workstream list is still loading when the
  // form first mounts. This fills it in the moment it can, once only, never overwriting a company
  // the person picked themselves (edit mode sets `companyId` directly below, with no such gap).
  useEffect(() => {
    if (form.companyId === ALL_COMPANIES && selectedWorkstream) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((p) => (p.companyId === ALL_COMPANIES ? { ...p, companyId: selectedWorkstream.companyId } : p));
    }
  }, [selectedWorkstream, form.companyId]);

  function handleCompanyChange(companyId: string) {
    // Changing the client only clears the workstream when it genuinely no longer applies — picking
    // "All clients" (or the workstream's own client) leaves the current selection untouched.
    const stillValid = companyId === ALL_COMPANIES || selectedWorkstream?.companyId === companyId;
    setForm((p) => ({
      ...p,
      companyId,
      workstreamId: stillValid ? p.workstreamId : "",
      activityId: stillValid ? p.activityId : NO_ACTIVITY,
    }));
  }

  function handleWorkstreamChange(workstreamId: string) {
    const picked = workstreams.find((w) => w.id === workstreamId);
    setForm((p) => ({
      ...p,
      workstreamId,
      activityId: NO_ACTIVITY,
      companyId: picked ? picked.companyId : p.companyId,
    }));
  }

  /** The inline "+ New workstream" flow already ran inside a specific client's context, so the created workstream is selected directly — no need to wait for `workstreams` to refetch before picking it. */
  function handleWorkstreamCreated(created: WorkstreamWithRelations) {
    refreshWorkstreams();
    setForm((p) => ({ ...p, workstreamId: created.id, activityId: NO_ACTIVITY, companyId: created.companyId }));
    setNewWorkstreamOpen(false);
  }
  const suggestion = form.workstreamId ? suggestActivity(form.title, departments) : null;
  const showSuggestion =
    suggestion !== null && form.activityId === NO_ACTIVITY && suggestion.activityId !== dismissedSuggestionId;

  const selectedActivityLabel = (() => {
    if (form.activityId === NO_ACTIVITY) return null;
    for (const dept of departments) {
      const activity = dept.activities.find((a) => a.id === form.activityId);
      if (activity) return `${dept.name}: ${activity.name}`;
    }
    return null;
  })();

  useEffect(() => {
    if (!open || !user) return;
    // Reset the form to match whichever task (or blank) the dialog was opened for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setDismissedSuggestionId(null);
    setReuseOpen(false);
    if (task) {
      setForm({
        title: task.title,
        description: task.description,
        companyId: task.companyId,
        workstreamId: task.workstreamId,
        activityId: task.activityId ?? NO_ACTIVITY,
        assigneeIds: task.assignees.map((a) => a.id),
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate ?? "",
        expectedMinutes: task.expectedMinutes,
        checklist: task.checklistItems.map((ci) => ({ id: ci.id, description: ci.description, key: ci.id })),
      });
    } else {
      setForm(emptyForm(user.id, defaultWorkstreamId));
    }
  }, [open, task, user, defaultWorkstreamId]);

  const canSubmit = !isSubmitting && form.title.trim().length > 0 && form.workstreamId.length > 0;

  // Cmd/Ctrl+Enter submits from anywhere in the panel, guarded by the same validity check the submit
  // button itself uses. A document-level listener (not a form onKeyDown) because focus can end up on
  // <body> — e.g. right after a focused "remove checklist item" button unmounts — and a keydown
  // targeting <body> never bubbles back down into the form. `submitForm` is a hoisted function
  // declaration (defined further below), so referencing it here is valid.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canSubmit) void submitForm();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, canSubmit, submitForm]);

  if (!user) return null;
  const employeeView = isEmployee(user);

  function toggleAssignee(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      assigneeIds: checked ? [...prev.assigneeIds, id] : prev.assigneeIds.filter((aid) => aid !== id),
    }));
  }

  function addChecklistRow(description: string) {
    setForm((prev) => ({
      ...prev,
      checklist: [...prev.checklist, { description, key: crypto.randomUUID() }],
    }));
  }

  function updateChecklistRow(key: string, description: string) {
    setForm((prev) => ({
      ...prev,
      checklist: prev.checklist.map((row) => (row.key === key ? { ...row, description } : row)),
    }));
  }

  function removeChecklistRow(key: string) {
    setForm((prev) => ({ ...prev, checklist: prev.checklist.filter((row) => row.key !== key) }));
  }

  /** Replaces the current checklist draft with fresh, unchecked copies of a past task's items — an explicit, opt-in starting point, never merged with whatever was already typed. */
  function handleUseReuseCandidate(candidate: TaskReuseCandidate, copyDescription: boolean) {
    setForm((prev) => ({
      ...prev,
      description: copyDescription && candidate.description ? candidate.description : prev.description,
      checklist: candidate.checklistItemDescriptions.map((description) => ({
        description,
        key: crypto.randomUUID(),
      })),
    }));
  }

  async function submitForm() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const input = {
        title: form.title.trim(),
        description: form.description.trim(),
        workstreamId: form.workstreamId,
        activityId: form.activityId === NO_ACTIVITY ? null : form.activityId,
        assigneeIds: form.assigneeIds,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || null,
        expectedMinutes: form.expectedMinutes,
        checklistItems: form.checklist
          .filter((row) => row.description.trim().length > 0)
          .map((row) => ({ id: row.id, description: row.description.trim() })),
      };
      if (mode === "edit" && task) {
        await tasksProvider.updateTask(user, task.id, input);
        onSaved();
        onOpenChange(false);
      } else {
        const created = await tasksProvider.createTask(user, input);
        onSaved();
        onOpenChange(false);
        router.push(`/dashboard/tasks/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save task.");
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
                {mode === "create" ? "New task" : "Edit task"}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {mode === "create" ? "Create a new task." : `Editing "${task?.title ?? "this task"}".`}
              </SheetDescription>
              <Input
                autoFocus
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Task title"
                aria-label="Task title"
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
              <FormSection label="Where it belongs">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-company">Client</Label>
                  <Select
                    items={{ [ALL_COMPANIES]: "All clients", ...Object.fromEntries(companies.map((c) => [c.id, c.name])) }}
                    value={form.companyId}
                    onValueChange={(v) => handleCompanyChange(v ?? ALL_COMPANIES)}
                  >
                    <SelectTrigger id="task-company" className="w-full">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_COMPANIES}>All clients</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Narrows the workstream list below — pick a client first, or just pick the workstream directly.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="task-workstream">Workstream</Label>
                    {!employeeView && companyForNewWorkstream && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto py-0.5 text-xs"
                        onClick={() => setNewWorkstreamOpen(true)}
                      >
                        <Plus className="size-3" /> New workstream
                      </Button>
                    )}
                  </div>
                  <Select
                    items={Object.fromEntries(workstreams.map((w) => [w.id, w.name]))}
                    value={form.workstreamId}
                    onValueChange={(v) => handleWorkstreamChange(v ?? "")}
                  >
                    <SelectTrigger id="task-workstream" className="w-full">
                      <SelectValue placeholder="Select workstream" />
                    </SelectTrigger>
                    <SelectContent>
                      {workstreams.map((workstream) => (
                        <SelectItem key={workstream.id} value={workstream.id}>
                          {workstream.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedWorkstream ? (
                    <p className="text-xs text-muted-foreground">
                      Client: <span className="font-medium text-foreground">{selectedWorkstream.company.name}</span>
                    </p>
                  ) : !employeeView && form.companyId === ALL_COMPANIES ? (
                    <p className="text-xs text-muted-foreground">Pick a client above to add a new workstream for them.</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-activity">Activity (optional)</Label>
                  <Select
                    items={{
                      [NO_ACTIVITY]: "No tag",
                      ...Object.fromEntries(
                        departments.flatMap((d) => d.activities.map((a) => [a.id, `${d.name}: ${a.name}`]))
                      ),
                    }}
                    value={form.activityId}
                    onValueChange={(v) => setForm((p) => ({ ...p, activityId: v ?? NO_ACTIVITY }))}
                    disabled={!form.workstreamId || departments.length === 0}
                  >
                    <SelectTrigger id="task-activity" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ACTIVITY}>No tag</SelectItem>
                      {departments.map((d) => (
                        <div key={d.id}>
                          {d.activities.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {d.name}: {a.name}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.workstreamId && departments.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedWorkstream?.serviceLineId
                        ? "No activities set up for this service yet."
                        : "No activities set up for this brand yet."}
                    </p>
                  )}
                  {showSuggestion && suggestion && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5 text-sm">
                      <span>
                        Suggested:{" "}
                        <span className="font-medium">
                          {suggestion.departmentName}: {suggestion.activityName}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setForm((p) => ({ ...p, activityId: suggestion.activityId }))}
                        >
                          Apply
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Dismiss suggestion"
                          onClick={() => setDismissedSuggestionId(suggestion.activityId)}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  )}
                  {form.activityId !== NO_ACTIVITY && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => setReuseOpen(true)}
                    >
                      <History /> Reuse from past
                    </Button>
                  )}
                </div>
              </FormSection>

              <FormSection label="Details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Status</Label>
                    <TaskStatusPicker
                      value={form.status}
                      onChange={(status) => setForm((p) => ({ ...p, status }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Priority</Label>
                    <TaskPriorityPicker
                      value={form.priority}
                      onChange={(priority) => setForm((p) => ({ ...p, priority }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-due-date">Due date</Label>
                    <Input
                      id="task-due-date"
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-1 flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="task-expected-time">Expected time</Label>
                    <ExpectedTimeInput
                      key={task?.id ?? "new"}
                      id="task-expected-time"
                      valueMinutes={form.expectedMinutes}
                      onChange={(expectedMinutes) => setForm((p) => ({ ...p, expectedMinutes }))}
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection label="People">
                {employeeView ? (
                  <>
                    <TaskAssigneeChips staff={[user]} selectedIds={[user.id]} />
                    {mode === "create" && (
                      <p className="text-xs text-muted-foreground">
                        Self-added tasks go live immediately — your supervisor and superadmin are notified.
                      </p>
                    )}
                  </>
                ) : (
                  <TaskAssigneeChips
                    staff={assignableStaff}
                    selectedIds={form.assigneeIds}
                    onToggle={toggleAssignee}
                  />
                )}
              </FormSection>

              <FormSection label="Checklist">
                <ChecklistBuilder
                  items={form.checklist}
                  onAdd={addChecklistRow}
                  onUpdate={updateChecklistRow}
                  onRemove={removeChecklistRow}
                />
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
              {isSubmitting ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
      {form.activityId !== NO_ACTIVITY && selectedActivityLabel && (
        <ReusePastTaskDialog
          open={reuseOpen}
          onOpenChange={setReuseOpen}
          activityId={form.activityId}
          activityLabel={selectedActivityLabel}
          excludeTaskId={task?.id}
          onSelect={handleUseReuseCandidate}
        />
      )}
      {companyForNewWorkstream && (
        <WorkstreamFormDialog
          open={newWorkstreamOpen}
          onOpenChange={setNewWorkstreamOpen}
          mode="create"
          company={companyForNewWorkstream}
          onSaved={() => {}}
          onCreated={handleWorkstreamCreated}
        />
      )}
    </Sheet>
  );
}
