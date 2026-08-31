"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, History, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { todayDateOnly } from "@/lib/planner-dates";
import { operationalProjectPickerLabels } from "@/lib/data/project-display";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { useSubtasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useWorkstreamActivities } from "@/lib/data/hooks/use-workstream-activities";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { tasksProvider } from "@/lib/data/providers";
import type { TaskReuseCandidate, TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { DepartmentWithActivities } from "@/lib/data/providers/activity-catalog-provider";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import {
  canAccessWorkstream,
  canCreateWorkstreamInProject,
  canExtendServiceActivities,
  canManageWorkstreams,
  isEmployee,
} from "@/lib/data/permissions";
import type { Activity, TaskPriority, TaskStatus } from "@/lib/data/types";
import { TaskStatusPicker } from "@/components/tasks/task-status-picker";
import { TaskPriorityPicker } from "@/components/tasks/task-priority-picker";
import { TaskAssigneeChips } from "@/components/tasks/task-assignee-chips";
import { ChecklistBuilder, type ChecklistBuilderRow } from "@/components/tasks/checklist-builder";
import { ReusePastTaskDialog } from "@/components/tasks/reuse-past-task-dialog";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { AddServiceActivitiesDialog } from "@/components/workstreams/add-service-activities-dialog";
import { CreateActivityDialog } from "@/components/workstreams/create-activity-dialog";
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
  const { companies } = useCompanies();
  const { projects } = useProjects();
  // Phase 13B pre-apply correction (Correction 2) — ordinary Task Create/Edit picks a Project by its
  // Company name, never the redundant "Company + year range" form. See `project-display.ts` for the
  // (currently inert — every Company has exactly one Project today) same-Company collision fallback.
  const projectLabels = operationalProjectPickerLabels(projects);
  const [form, setForm] = useState(() => emptyForm(user?.id ?? "", defaultWorkstreamId, defaultActivityId, defaultStatus));
  const { workstreams, refresh: refreshWorkstreams } = useWorkstreams({
    projectId: form.projectId === ALL_PROJECTS ? undefined : form.projectId,
  });
  const { assignableStaff } = useCompanyLookups();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dismissedSuggestionId, setDismissedSuggestionId] = useState<string | null>(null);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [newWorkstreamOpen, setNewWorkstreamOpen] = useState(false);
  const [addingNewActivity, setAddingNewActivity] = useState(false);
  const [addActivitiesOpen, setAddActivitiesOpen] = useState(false);
  const [createActivityOpen, setCreateActivityOpen] = useState(false);

  const selectedWorkstream = workstreams.find((w) => w.id === form.workstreamId);
  // Scoped to what THIS workstream actually enabled — falls back to the full service catalog for a
  // legacy workstream with no persisted Activity selections yet (see the hook's own doc comment).
  const { departments, refresh: refreshEnabledActivities } = useWorkstreamActivities(selectedWorkstream);
  // "+ New service" needs a concrete Project to create into — mirrors WorkstreamFormDialog's own
  // requirement (it only ever opens with a specific company/project already in hand).
  const selectedProject = form.projectId === ALL_PROJECTS ? null : projects.find((p) => p.id === form.projectId);
  const companyForNewWorkstream = selectedProject ? (companies.find((c) => c.id === selectedProject.companyId) ?? null) : null;
  // Same gate the Project workspace's own "+ Add Service" already uses — an Employee may create a
  // Service inside a Project they can already access (server-enforced self-lead-only via the
  // `create_workstream` RPC). The Task form previously hid this behind a blanket `!employeeView`
  // check, which was stricter than the real backend authorization — fixed here to match.
  const canAddServiceHere =
    user != null && selectedProject != null
      ? canCreateWorkstreamInProject(
          user,
          { companyId: selectedProject.companyId, ownerId: selectedProject.ownerId, memberUserIds: selectedProject.members.map((m) => m.id) },
          selectedProject.members
        )
      : false;

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

  /** The inline "+ New service" flow already ran inside a specific Project's context, so the created workstream is selected directly — no need to wait for `workstreams` to refetch before picking it. */
  function handleWorkstreamCreated(created: WorkstreamWithRelations) {
    refreshWorkstreams();
    setForm((p) => ({ ...p, workstreamId: created.id, activityId: NO_ACTIVITY, projectId: created.projectId ?? p.projectId }));
    setNewWorkstreamOpen(false);
  }

  /** A brand-new Activity is immediately selected for the current Task, matching the requested
   * "select it for the Task if practical" outcome. Refreshing `refreshWorkstreams()` alone isn't
   * enough here — unlike enabling an *already-cataloged* Activity (where only the Workstream's own
   * enabled-id list changes), creating a genuinely new Activity (and possibly a new Department)
   * changes the catalog data itself, which `useWorkstreamActivities`/`useActivityCatalog` each cache
   * in their own separate hook state; both need their own explicit `refresh()` too. */
  function handleActivityCreated(created: Activity) {
    refreshWorkstreams();
    refreshEnabledActivities();
    refreshFullCatalog();
    setForm((p) => ({ ...p, activityId: created.id }));
    setCreateActivityOpen(false);
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

  // Phase 8C — "+ Add another Activity to this Service": the full catalog for this Service's own
  // service line, minus what's already configured, is what a Service lead may enable in-context
  // during Task creation. `create_task`/mock createTask enable it and create the Task atomically —
  // this UI never enables anything on its own; it only decides what to *offer* and *ask for*.
  const { departments: fullServiceCatalog, refresh: refreshFullCatalog } = useActivityCatalog(
    selectedWorkstream?.brand.id,
    selectedWorkstream?.serviceLineId ?? undefined
  );
  const enabledActivityIds = new Set(departments.flatMap((d) => d.activities.map((a) => a.id)));
  const unconfiguredActivities = fullServiceCatalog.flatMap((d) =>
    d.activities.filter((a) => !enabledActivityIds.has(a.id)).map((a) => ({ ...a, departmentName: d.name }))
  );
  // Phase 13B final polish (Part H) — the real, richer "add several existing catalog Activities to
  // this Service at once" capability. Gated on `canManageWorkstreams` (Supervisor/Superadmin) only —
  // it calls `updateWorkstream` directly, which the `workstreams_update` RLS policy (and the mock
  // provider's own `requireManage`) restrict to Supervisor/Superadmin unconditionally, even for the
  // Employee who leads this exact Workstream. Unlike the single-activity flow below, this isn't tied
  // to Task-create/-edit at all — it persists immediately, so it's offered in both modes.
  const canAddServiceActivities = user != null && canManageWorkstreams(user) && selectedWorkstream != null;
  const canExtendActivities =
    user != null && mode === "create" && !activityLocked && selectedWorkstream != null
      ? canExtendServiceActivities(user, selectedWorkstream, assignableStaff)
      : false;
  // Pre-apply correction — "+ Create Activity" (create_activity_for_workstream) now shares the exact
  // same authorization boundary as normal Task creation itself (`can_access_workstream`/
  // `canAccessWorkstream`), never the narrower lead-only `canExtendServiceActivities` above (which
  // still, correctly, gates only the *other*, backend-unchanged "add another activity to this
  // service" flow that persists via create_task's own untouched lead-only branch). Not tied to
  // create/edit mode or `activityLocked` — enriching the Service's own catalog is independent of the
  // current Task's own state, matching `canAddServiceActivities` just above.
  const canCreateNewActivity =
    user != null && selectedWorkstream != null
      ? canAccessWorkstream(
          user,
          {
            leadUserId: selectedWorkstream.leadUserId,
            teamUserIds: selectedWorkstream.team.map((m) => m.id),
            companyId: selectedWorkstream.companyId,
          },
          assignableStaff
        )
      : false;
  const pendingNewActivity =
    form.activityId !== NO_ACTIVITY && !enabledActivityIds.has(form.activityId)
      ? (unconfiguredActivities.find((a) => a.id === form.activityId) ?? null)
      : null;

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
    <FormDrawer
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
              ? `${selectedWorkstream.name}${selectedActivityLabel ? ` · ${selectedActivityLabel}` : ""}`
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
                      {selectedWorkstream?.name ?? "—"}
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="task-workstream">Service</Label>
                    {canAddServiceHere && companyForNewWorkstream && selectedProject && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto py-0.5 text-xs"
                        onClick={() => setNewWorkstreamOpen(true)}
                      >
                        <Plus className="size-3" /> New service
                      </Button>
                    )}
                  </div>
                  <Select
                    items={Object.fromEntries(workstreams.map((w) => [w.id, w.name]))}
                    value={form.workstreamId}
                    onValueChange={(v) => handleWorkstreamChange(v ?? "")}
                  >
                    <SelectTrigger id="task-workstream" className="w-full">
                      <SelectValue placeholder="Select service" />
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
                  ) : (!employeeView || projects.length > 0) && form.projectId === ALL_PROJECTS ? (
                    <p className="text-xs text-muted-foreground">Pick a project above to add a new service for it.</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-activity">{activityRequired ? "Activity for this Task" : "Activity for this Task (optional)"}</Label>
                  {activityLocked ? (
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {selectedActivityLabel ?? "Activity"}
                    </p>
                  ) : pendingNewActivity ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-sm">
                      <span>
                        <span className="font-medium">
                          {pendingNewActivity.departmentName}: {pendingNewActivity.name}
                        </span>{" "}
                        — will be added to this service
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Undo — don't add this activity"
                        onClick={() => setForm((p) => ({ ...p, activityId: NO_ACTIVITY }))}
                      >
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <>
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
                      {activityRequired && form.activityId === NO_ACTIVITY && (
                        <p className="text-xs text-warning">
                          Required — pick which activity this task belongs to.
                        </p>
                      )}
                    </>
                  )}

                  {/* Phase 13B final polish (Part G) — the Service's own full set of already-
                      enabled Activities, always visible regardless of what's happening in the
                      Task-Activity select above (including while a new one is staged below) — so
                      it never looks like adding one Activity replaced or hid the others. */}
                  {selectedWorkstream && (departments.length > 0 || pendingNewActivity) && (
                    <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-2.5 text-xs">
                      <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                        Activities in this Service
                      </span>
                      {departments.flatMap((d) =>
                        d.activities.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              <Check className="size-3 shrink-0 text-success" aria-hidden="true" />
                              {d.name}: {a.name}
                            </span>
                            {a.id === form.activityId && <span className="shrink-0 text-muted-foreground">Selected for Task</span>}
                          </div>
                        ))
                      )}
                      {pendingNewActivity && (
                        <div className="flex items-center justify-between gap-2 text-primary">
                          <span className="flex items-center gap-1.5">
                            <Check className="size-3 shrink-0" aria-hidden="true" />
                            {pendingNewActivity.departmentName}: {pendingNewActivity.name}
                          </span>
                          <span className="shrink-0">Will be added</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!pendingNewActivity && (canExtendActivities || canAddServiceActivities || canCreateNewActivity) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {canAddServiceActivities && unconfiguredActivities.length > 0 && (
                        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setAddActivitiesOpen(true)}>
                          <Plus className="size-3" /> Add existing activities to Service
                        </Button>
                      )}
                      {!canAddServiceActivities && canExtendActivities && unconfiguredActivities.length > 0 && !addingNewActivity && (
                        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setAddingNewActivity(true)}>
                          <Plus className="size-3" /> Add an activity to this Service
                        </Button>
                      )}
                      {/* Pre-apply correction — available to anyone who could legitimately create a
                          normal Task in this Workstream (`canCreateNewActivity`, mirroring the real
                          `create_activity_for_workstream`/`can_access_workstream` boundary): Employee
                          as lead OR as a plain team member; Supervisor for their own team's
                          Workstreams; Superadmin unconditionally. Deliberately NOT the narrower
                          `canExtendActivities` above — that one still gates only the separate,
                          backend-unchanged "add another activity" flow. */}
                      {canCreateNewActivity && (
                        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setCreateActivityOpen(true)}>
                          <Plus className="size-3" /> Create Activity
                        </Button>
                      )}
                    </div>
                  )}

                  {!canAddServiceActivities && addingNewActivity && (
                    <div className="flex flex-col gap-1.5">
                      <Select
                        items={Object.fromEntries(unconfiguredActivities.map((a) => [a.id, `${a.departmentName}: ${a.name}`]))}
                        value=""
                        onValueChange={(v) => {
                          if (v) setForm((p) => ({ ...p, activityId: v }));
                          setAddingNewActivity(false);
                        }}
                      >
                        <SelectTrigger aria-label="Choose an activity to add to this service" className="w-full">
                          <SelectValue placeholder="Choose an activity to add…" />
                        </SelectTrigger>
                        <SelectContent>
                          {unconfiguredActivities.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.departmentName}: {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setAddingNewActivity(false)}>
                        Cancel
                      </Button>
                    </div>
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

            {/* Phase 12B final correction — Employee assignment is always self, automatically,
                regardless of what this form shows or doesn't; a read-only "you" chip added no
                information an Employee didn't already know, so this is dropped for them entirely.
                Supervisor/Superadmin keep full Assignees, unchanged. */}
            {!employeeView && (
              <FormDrawerField label="Assignee">
                <TaskAssigneeChips
                  staff={assignableStaff}
                  selectedIds={form.assigneeIds}
                  onToggle={toggleAssignee}
                />
              </FormDrawerField>
            )}
          </FormDrawerSection>

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
      {companyForNewWorkstream && selectedProject && (
        <WorkstreamFormDialog
          open={newWorkstreamOpen}
          onOpenChange={setNewWorkstreamOpen}
          mode="create"
          company={companyForNewWorkstream}
          // Bug fix — this dialog was being opened with `projectId` omitted even though a specific
          // Project was already required (and resolved) just to show the "+ New service" button.
          // Omitting it let the new-service RPC fall back to its own company-wide auto-resolution
          // (`enforce_workstream_project_link`), which raises rather than guessing whenever that
          // company has zero or more than one Project — surfacing a confusing late error instead of
          // simply using the Project context the Task form already had in hand.
          projectId={selectedProject.id}
          onSaved={() => {}}
          onCreated={handleWorkstreamCreated}
        />
      )}
      {selectedWorkstream && (
        <AddServiceActivitiesDialog
          open={addActivitiesOpen}
          onOpenChange={setAddActivitiesOpen}
          workstream={selectedWorkstream}
          onSaved={refreshWorkstreams}
        />
      )}
      {selectedWorkstream && (
        <CreateActivityDialog
          open={createActivityOpen}
          onOpenChange={setCreateActivityOpen}
          workstream={selectedWorkstream}
          onCreated={handleActivityCreated}
        />
      )}
    </FormDrawer>
  );
}
