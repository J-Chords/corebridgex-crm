"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { tasksProvider } from "@/lib/data/providers";
import { isEmployee } from "@/lib/data/permissions";
import type { TaskPriority, TaskStatus } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { TaskStatusPicker } from "@/components/tasks/task-status-picker";
import { TaskPriorityPicker } from "@/components/tasks/task-priority-picker";
import { TaskAssigneeChips } from "@/components/tasks/task-assignee-chips";
import { ChecklistBuilder, type ChecklistBuilderRow } from "@/components/tasks/checklist-builder";
import { ExpectedTimeInput } from "@/components/ui/expected-time-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";

interface AddSubtaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTask: TaskWithRelations;
  onCreated: () => void;
}

function emptyForm(userId: string) {
  return {
    title: "",
    description: "",
    assigneeIds: [userId],
    status: "todo" as TaskStatus,
    priority: "medium" as TaskPriority,
    dueDate: "",
    expectedMinutes: null as number | null,
    checklist: [] as ChecklistBuilderRow[],
  };
}

/**
 * Phase 10 — "+ Add Subtask" inside a parent Task's own Subtasks section. Deliberately lighter than
 * `TaskFormDialog`: no Client/Project/Service/Activity fields at all, since a Subtask always
 * inherits its parent's context server-side (`createSubtask`) — the Employee never reselects them.
 * Every other meaningful field an ordinary Task supports (title, description, assignees, status,
 * priority, due date, expected time, checklist) is still here, reusing the exact same widgets
 * `TaskFormDialog` uses so the two never drift in what a Task/Subtask can carry.
 */
export function AddSubtaskDialog({ open, onOpenChange, parentTask, onCreated }: AddSubtaskDialogProps) {
  const { user } = useAuth();
  const { assignableStaff } = useCompanyLookups();
  const [form, setForm] = useState(() => emptyForm(user?.id ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(emptyForm(user.id));
    setError(null);
  }, [open, user]);

  if (!user) return null;
  const employeeView = isEmployee(user);

  function toggleAssignee(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      assigneeIds: checked ? [...prev.assigneeIds, id] : prev.assigneeIds.filter((aid) => aid !== id),
    }));
  }
  function addChecklistRow(description: string) {
    setForm((prev) => ({ ...prev, checklist: [...prev.checklist, { description, key: crypto.randomUUID() }] }));
  }
  function updateChecklistRow(key: string, description: string) {
    setForm((prev) => ({ ...prev, checklist: prev.checklist.map((row) => (row.key === key ? { ...row, description } : row)) }));
  }
  function removeChecklistRow(key: string) {
    setForm((prev) => ({ ...prev, checklist: prev.checklist.filter((row) => row.key !== key) }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await tasksProvider.createSubtask(user, parentTask.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        assigneeIds: form.assigneeIds,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || null,
        expectedMinutes: form.expectedMinutes,
        checklistItems: form.checklist
          .filter((row) => row.description.trim().length > 0)
          .map((row) => ({ id: row.id, description: row.description.trim() })),
      });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create Subtask.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Subtask</DialogTitle>
          <DialogDescription>
            Subtask of <span className="font-medium text-foreground">{parentTask.title}</span> — same Client/Project/Service/Activity, inherited automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subtask-title">Title</Label>
            <Input
              id="subtask-title"
              autoFocus
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Subtask title"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subtask-description">Description</Label>
            <Textarea
              id="subtask-description"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Add a description…"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <TaskStatusPicker value={form.status} onChange={(status) => setForm((p) => ({ ...p, status }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <TaskPriorityPicker value={form.priority} onChange={(priority) => setForm((p) => ({ ...p, priority }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subtask-due-date">Due date</Label>
              <Input
                id="subtask-due-date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subtask-expected-time">Expected time</Label>
              <ExpectedTimeInput
                id="subtask-expected-time"
                valueMinutes={form.expectedMinutes}
                onChange={(expectedMinutes) => setForm((p) => ({ ...p, expectedMinutes }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Assignee(s)</Label>
            {employeeView ? (
              <TaskAssigneeChips staff={[user]} selectedIds={[user.id]} />
            ) : (
              <TaskAssigneeChips staff={assignableStaff} selectedIds={form.assigneeIds} onToggle={toggleAssignee} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Checklist</Label>
            <ChecklistBuilder items={form.checklist} onAdd={addChecklistRow} onUpdate={updateChecklistRow} onRemove={removeChecklistRow} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? "Creating…" : "Create Subtask"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
