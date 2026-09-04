"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, History, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { todayDateOnly } from "@/lib/planner-dates";
import { operationalProjectPickerLabels } from "@/lib/data/project-display";
import { workstreamDisplayHeading, splitWorkstreamQualifier } from "@/lib/data/workstream-name";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { useSubtasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useWorkstreamActivities } from "@/lib/data/hooks/use-workstream-activities";
import { tasksProvider } from "@/lib/data/providers";
import type { TaskReuseCandidate, TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { DepartmentWithActivities } from "@/lib/data/providers/activity-catalog-provider";
import { isEmployee } from "@/lib/data/permissions";
import type { TaskPriority, TaskStatus } from "@/lib/data/types";
import { TaskStatusPicker } from "@/components/tasks/task-status-picker";
import { TaskPriorityPicker } from "@/components/tasks/task-priority-picker";
import { MultiSelect } from "@/components/ui/multi-select";
import { ChecklistBuilder, type ChecklistBuilderRow } from "@/components/tasks/checklist-builder";
import { ReusePastTaskDialog } from "@/components/tasks/reuse-past-task-dialog";
import {
  FormDrawerHeader,
  FormDrawerBody,
  FormDrawerSection,
  FormDrawerPropertyGrid,
  FormDrawerField,
  FormDrawerFooter,
} from "@/components/ui/form-drawer";
import { FormDialog, FormDialogColumns } from "@/components/ui/form-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  /** Pre-selects an Activity tag — used by the workstream detail page's per-Activity "+ Add Task". */
  defaultActivityId?: string;
  /** Phase 12B — pre-selects a starting status, used by the Board's per-column "+ Add task" so a
   * card created from the "In Progress" column doesn't land in Todo and need an extra status change.
   * Purely a form-state default — the same `create_task`/status-change path runs either way. */
  defaultStatus?: TaskStatus;
  onSaved: () => void;
}

const ALL_PROJECTS = "all";

function emptyForm(userId: string, defaultWorkstreamId?: string, defaultActivityId?: string, defaultStatus?: TaskStatus) {
  return {
    title: "",
    description: "",
    projectId: ALL_PROJECTS,
    workstreamId: defaultWorkstreamId ?? "",
    activityId: defaultActivityId ?? NO_ACTIVITY,
    assigneeIds: [userId],
    status: defaultStatus ?? ("todo" as TaskStatus),
    priority: "medium" as TaskPriority,
    // Phase 13B final boss-feedback pass (Part E) — a brand-new Task's Start Date defaults to
    // today's real local calendar date (never createdAt, never a UTC-shifted value — see
    // `todayDateOnly`'s own doc comment), still fully editable/clearable before saving. Only ever
    // used here, for a genuinely new Task's initial form state — editing an existing Task always
    // seeds this field from that Task's own real `startDate` instead (see the `task` branch below).
    startDate: todayDateOnly(),
    dueDate: "",
    expectedMinutes: null as number | null,
    checklist: [] as ChecklistBuilderRow[],
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  mode,
  task,
  defaultWorkstreamId,
  defaultActivityId,
  defaultStatus,
  onSaved,
}: TaskFormDialogProps) {
  const { user } = useAuth();
  const { projects } = useProjects();
  // Phase 13B pre-apply correction (Correction 2) — ordinary Task Create/Edit picks a Project by its
  // Company name, never the redundant "Company + year range" form. See `project-display.ts` for the
  // (currently inert — every Company has exactly one Project today) same-Company collision fallback.
  const projectLabels = operationalProjectPickerLabels(projects);
  const [form, setForm] = useState(() => emptyForm(user?.id ?? "", defaultWorkstreamId, defaultActivityId, defaultStatus));
  const { workstreams } = useWorkstreams({
    projectId: form.projectId === ALL_PROJECTS ? undefined : form.projectId,
  });
  const { assignableStaff } = useCompanyLookups();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dismissedSuggestionId, setDismissedSuggestionId] = useState<string | null>(null);
  const [reuseOpen, setReuseOpen] = useState(false);

  const selectedWorkstream = workstreams.find((w) => w.id === form.workstreamId);
  // Service Visual Acceptance correction — primary identity is always the global Service name
  // ("Accounting"), never this Project Service's own reference/qualifier ("Accounting 2026").
  // Project context only gets appended for disambiguation when "All projects" makes two Services
  // of the same name genuinely ambiguous; a Project already selected makes every Service name in
  // the (filtered) list unique on its own (a Project can't attach the same Service Line twice).
  const showProjectContext = form.projectId === ALL_PROJECTS;
  function workstreamPrimaryLabel(w: typeof workstreams[number]): string {
    return workstreamDisplayHeading(w.name, w.serviceLine?.name ?? null);
  }
  function workstreamQualifierLabel(w: typeof workstreams[number]): string {
    return splitWorkstreamQualifier(w.name, w.serviceLine?.name ?? null);
  }
  function workstreamProjectName(w: typeof workstreams[number]): string {
    return (w.projectId && projects.find((p) => p.id === w.projectId)?.name) || "No Project";
  }
  // Flat single-line label for the closed trigger and keyboard typeahead only — the open dropdown
  // itself groups by Project (below) rather than repeating the project name on every row.
  function workstreamTriggerLabel(w: typeof workstreams[number]): string {
    const primary = workstreamPrimaryLabel(w);
    return showProjectContext ? `${primary} — ${workstreamProjectName(w)}` : primary;
  }
  const workstreamGroups = (() => {
    if (!showProjectContext) return null;
    const order: string[] = [];
    const byProject = new Map<string, typeof workstreams>();
    for (const w of workstreams) {
      const key = w.projectId ?? "none";
      if (!byProject.has(key)) {
        order.push(key);
        byProject.set(key, []);
      }
      byProject.get(key)!.push(w);
    }
    return order.map((key) => ({
      key,
      projectName: byProject.get(key)![0] ? workstreamProjectName(byProject.get(key)![0]) : "No Project",
      items: byProject.get(key)!,
    }));
  })();
  // Scoped to what THIS workstream actually enabled — falls back to the full service catalog for a
  // legacy workstream with no persisted Activity selections yet (see the hook's own doc comment).
  const { departments } = useWorkstreamActivities(selectedWorkstream);

  // A task prefilled from a workstream (a workstream detail page's own "Add task") knows its project
  // already but can't set `projectId` synchronously — the workstream list is still loading when the
  // form first mounts. This fills it in the moment it can, once only, never overwriting a project the
  // person picked themselves (edit mode leaves projectId at "all" the same way, relying on this same
  // backfill once the task's own workstream resolves).
  useEffect(() => {
    if (form.projectId === ALL_PROJECTS && selectedWorkstream?.projectId) {
      const projectId = selectedWorkstream.projectId;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((p) => (p.projectId === ALL_PROJECTS ? { ...p, projectId } : p));
    }
  }, [selectedWorkstream, form.projectId]);

  function handleProjectChange(projectId: string) {
    // Changing the project only clears the service when it genuinely no longer applies — picking
    // "All projects" (or the service's own project) leaves the current selection untouched.
    const stillValid = projectId === ALL_PROJECTS || selectedWorkstream?.projectId === projectId;
    setForm((p) => ({
      ...p,
      projectId,
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
      projectId: picked?.projectId ?? p.projectId,
    }));
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
        projectId: ALL_PROJECTS,
        workstreamId: task.workstreamId,
        activityId: task.activityId ?? NO_ACTIVITY,
        assigneeIds: task.assignees.map((a) => a.id),
        status: task.status,
        priority: task.priority,
        startDate: task.startDate ?? "",
        dueDate: task.dueDate ?? "",
        expectedMinutes: task.expectedMinutes,
        checklist: task.checklistItems.map((ci) => ({ id: ci.id, description: ci.description, key: ci.id })),
      });
    } else {
      setForm(emptyForm(user.id, defaultWorkstreamId, defaultActivityId, defaultStatus));
    }
  }, [open, task, user, defaultWorkstreamId, defaultActivityId, defaultStatus]);

  // A brand-new task on a workstream that actually has activities to choose from must be tagged to
  // one — "Workstream → Activity → Task" is the real hierarchy for normal client service work now.
  // Editing an existing task never forces this (a legacy untagged task stays untagged unless someone
  // deliberately retags it), and a workstream with nothing configured (legacy data, or a service with
  // no catalog, e.g. Internal Operations) never blocks task creation either — same as before.
  const activityRequired = mode === "create" && departments.length > 0;
  // Arriving from a specific Activity's own "+ Add Task" (the primary creation path now) means the
  // person already decided where this task belongs — re-presenting an editable picker would invite
  // second-guessing a choice they already made by clicking there. Locked to create-mode only: editing
  // an existing task should always allow retagging/removing its activity.
  const activityLocked = mode === "create" && Boolean(defaultActivityId);

  // Phase 10 hierarchy-authorization hardening (Section 12/17) — a Subtask's Client/Project/Service/
  // Activity are inherited from its parent and read-only (enforced server-side by
  // enforce_task_invariants); a top-level Task that already HAS Subtasks can't change Service/
  // Activity either, same trigger. Shown as fixed read-only context here rather than offering
  // editable selectors and waiting for the database to reject the change.
  const isEditingSubtask = mode === "edit" && Boolean(task?.parentTaskId);
  const { subtasks: existingChildTasksForLock } = useSubtasks(mode === "edit" && task && !task.parentTaskId ? task.id : null);
  const hasSubtasks = existingChildTasksForLock.length > 0;
  const contextLocked = isEditingSubtask || hasSubtasks;

  const canSubmit =
    !isSubmitting &&
    form.title.trim().length > 0 &&
    form.workstreamId.length > 0 &&
    (!activityRequired || form.activityId !== NO_ACTIVITY);

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
    if (form.startDate && form.dueDate && form.startDate > form.dueDate) {
      setError("Start Date must be on or before Due Date.");
      return;
    }
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
        startDate: form.startDate || null,
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      srTitle={mode === "create" ? "New task" : `Editing "${task?.title ?? "this task"}"`}
    >
      <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
        <FormDrawerHeader
          title={mode === "create" ? "New Task" : "Edit Task"}
          context={selectedWorkstream ? selectedWorkstream.company.name : undefined}
          secondaryContext={
            selectedWorkstream
              ? `${workstreamPrimaryLabel(selectedWorkstream)}${selectedActivityLabel ? ` · ${selectedActivityLabel}` : ""}`
              : undefined
          }
        />
        <FormDrawerBody>
          <FormDrawerSection label="Task">
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Task title"
              aria-label="Task title"
              className="h-auto rounded-none border-0 bg-transparent p-0 text-xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
            />
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Add a description…"
              rows={1}
              className="min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-1 text-sm shadow-none focus-visible:ring-0"
            />
          </FormDrawerSection>

          <FormDialogColumns>
          <FormDrawerSection label="Context">
              <div className="flex flex-col gap-4">
                {contextLocked ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>Client / Project / Service{selectedActivityLabel ? " / Activity" : ""}</Label>
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {selectedWorkstream?.company.name ?? "—"}
                      {(() => {
                        const projectName = selectedWorkstream?.projectId
                          ? (projects.find((p) => p.id === selectedWorkstream.projectId)?.name ?? null)
                          : null;
                        return projectName ? ` — ${projectName}` : "";
                      })()}
                      {" — "}
                      {selectedWorkstream ? workstreamPrimaryLabel(selectedWorkstream) : "—"}
                      {selectedActivityLabel ? ` — ${selectedActivityLabel}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isEditingSubtask
                        ? "Inherited from the parent Task — cannot be changed independently."
                        : "This Task has Subtasks. Service and Activity cannot be changed."}
                    </p>
                  </div>
                ) : (
                  <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-project">Project</Label>
                  <Select
                    items={{ [ALL_PROJECTS]: "All projects", ...projectLabels }}
                    value={form.projectId}
                    onValueChange={(v) => handleProjectChange(v ?? ALL_PROJECTS)}
                  >
                    <SelectTrigger id="task-project" className="w-full">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {projectLabels[project.id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Narrows the service list below — pick a project first, or just pick the service directly.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-workstream">Service</Label>
                  <Select
                    items={Object.fromEntries(workstreams.map((w) => [w.id, workstreamTriggerLabel(w)]))}
                    value={form.workstreamId}
                    onValueChange={(v) => handleWorkstreamChange(v ?? "")}
                  >
                    <SelectTrigger id="task-workstream" className="w-full">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      {workstreamGroups
                        ? workstreamGroups.map((group, gi) => (
                            <SelectGroup key={group.key}>
                              {gi > 0 && <SelectSeparator />}
                              <SelectLabel>{group.projectName}</SelectLabel>
                              {group.items.map((workstream) => (
                                <SelectItem key={workstream.id} value={workstream.id}>
                                  <span className="flex flex-col py-0.5">
                                    <span>{workstreamPrimaryLabel(workstream)}</span>
                                    {workstreamQualifierLabel(workstream) && (
                                      <span className="text-xs text-muted-foreground">
                                        Reference: {workstreamQualifierLabel(workstream)}
                                      </span>
                                    )}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))
                        : workstreams.map((workstream) => (
                            <SelectItem key={workstream.id} value={workstream.id}>
                              <span className="flex flex-col py-0.5">
                                <span>{workstreamPrimaryLabel(workstream)}</span>
                                {workstreamQualifierLabel(workstream) && (
                                  <span className="text-xs text-muted-foreground">
                                    Reference: {workstreamQualifierLabel(workstream)}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  {!selectedWorkstream && (
                    <p className="text-xs text-muted-foreground">
                      Only Services already attached to the selected Project appear here. Configure this Project&apos;s
                      Services from Project &gt; Services first.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-activity">Activity</Label>
                  {activityLocked ? (
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {selectedActivityLabel ?? "Activity"}
                    </p>
                  ) : (
                    <>
                      <Select
                        items={{
                          [NO_ACTIVITY]: "None",
                          ...Object.fromEntries(
                            departments.flatMap((d) => d.activities.map((a) => [a.id, `${d.name}: ${a.name}`]))
                          ),
                        }}
                        value={form.activityId}
                        onValueChange={(v) => setForm((p) => ({ ...p, activityId: v ?? NO_ACTIVITY }))}
                        disabled={!form.workstreamId || departments.length === 0}
                      >
                        <SelectTrigger id="task-activity" className="w-full">
                          <SelectValue placeholder="Select Activity…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ACTIVITY}>None</SelectItem>
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
                          Configure this Service and its Activities from Project &gt; Services first.
                        </p>
                      )}
                      {activityRequired && form.activityId === NO_ACTIVITY && (
                        <p className="text-xs text-warning">
                          Required — pick which activity this task belongs to.
                        </p>
                      )}
                    </>
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
                  {form.activityId !== NO_ACTIVITY && selectedActivityLabel && (
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
                  </>
                )}
              </div>
          </FormDrawerSection>

          <FormDrawerSection label="Workflow">
            <FormDrawerPropertyGrid>
              <FormDrawerField label="Status">
                <TaskStatusPicker
                  value={form.status}
                  onChange={(status) => setForm((p) => ({ ...p, status }))}
                />
              </FormDrawerField>
              <FormDrawerField label="Priority">
                <TaskPriorityPicker
                  value={form.priority}
                  onChange={(priority) => setForm((p) => ({ ...p, priority }))}
                />
              </FormDrawerField>
              <FormDrawerField label="Start date" htmlFor="task-start-date">
                <Input
                  id="task-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                />
              </FormDrawerField>
              <FormDrawerField label="Due date" htmlFor="task-due-date">
                <Input
                  id="task-due-date"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                />
              </FormDrawerField>
            </FormDrawerPropertyGrid>
          </FormDrawerSection>
          </FormDialogColumns>

          {/* Phase 12B final correction — Employee assignment is always self, automatically,
              regardless of what this form shows or doesn't; a read-only "you" chip added no
              information an Employee didn't already know, so this is dropped for them entirely.
              Supervisor/Superadmin keep full Assignees, unchanged. */}
          {!employeeView && (
            <FormDrawerSection label="Assignees">
              <MultiSelect
                options={assignableStaff.map((s) => ({ id: s.id, label: s.fullName, sublabel: s.email }))}
                value={form.assigneeIds}
                onChange={(ids) => setForm((p) => ({ ...p, assigneeIds: ids }))}
                placeholder="No assignees"
                searchPlaceholder="Search people…"
                aria-label="Task assignees"
              />
            </FormDrawerSection>
          )}

          <FormDrawerSection label="Checklist">
            <ChecklistBuilder
              items={form.checklist}
              onAdd={addChecklistRow}
              onUpdate={updateChecklistRow}
              onRemove={removeChecklistRow}
            />
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
            {isSubmitting ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
          </Button>
        </FormDrawerFooter>
      </form>
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
    </FormDialog>
  );
}
