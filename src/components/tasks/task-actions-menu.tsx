"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { tasksProvider } from "@/lib/data/providers";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { canDeleteTask, canEditTask } from "@/lib/data/permissions";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToastManager } from "@/components/ui/toast";

interface TaskActionsMenuProps {
  task: TaskWithRelations;
  /** Opens the canonical Task edit form (`TaskFormDialog`) — every surface passes its own trigger,
   * this component never renders a form itself. */
  onEdit: () => void;
  /** Fires after a successful delete so the caller can remove the Task from its own list/board
   * state, close a Drawer, or navigate away from a full Task page. */
  onDeleted: () => void;
  className?: string;
  /**
   * Dense surfaces (List rows, Board cards, Timeline rows) render "Edit"/"Delete task" together in
   * this one menu (the default). The two detail surfaces (Task Drawer, full Task page) keep their
   * own always-visible "Edit" button next to the title and use this component ONLY for the
   * overflow "⋯" — pass `hideEditItem` there so the dropdown offers Delete alone, never a redundant
   * second Edit entry point.
   */
  hideEditItem?: boolean;
}

/** Reserves the exact same footprint as the real trigger below (`size-7 shrink-0`) — rendered
 * whenever the viewer isn't authorized for either action, so a list of same-shaped rows never
 * shifts its trailing columns just because one particular row's Task happens to be one this
 * viewer can't act on (Phase 13 visual polish, Part 1 — "the visual grid must remain consistent
 * regardless of permission"). Invisible, `aria-hidden`, never focusable. */
function ReservedActionSlot({ className }: { className?: string }) {
  return <span className={cn("size-7 shrink-0", className)} aria-hidden="true" />;
}

/**
 * The one shared Edit/Delete surface for a Task — every List row, Board card, Timeline row,
 * Drawer, and full Task page renders this instead of hand-rolling its own edit/delete logic.
 * Renders an invisible same-size `ReservedActionSlot` (never `null`) if the viewer has neither
 * `canEditTask` nor `canDeleteTask` — an unrelated Employee sees no kebab, but the layout around it
 * never shifts. `onClick`/`onPointerDown` stop propagation on the trigger so this can be nested
 * inside a clickable row, a `<Link>`/`<button>`-wrapped card, or a dnd-kit draggable Board card
 * without also firing row navigation, drawer-open, or a drag start.
 */
export function TaskActionsMenu({ task, onEdit, onDeleted, className, hideEditItem }: TaskActionsMenuProps) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  // Phase 13 security hardening — canEditTask/canDeleteTask now re-derive a Supervisor's own real
  // Task scope (never role-global); `assignableStaff` (already team-scoped for a Supervisor,
  // everyone active for a Superadmin) is exactly the same "allUsers" convenience list every mock
  // provider call site uses `db.users` for — a UI-only gate either way, the provider/RPC re-derives
  // and enforces the real boundary itself regardless of what this component decides to show.
  const { assignableStaff } = useCompanyLookups();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) return <ReservedActionSlot className={className} />;
  const taskForAuth = { ...task, assigneeIds: task.assignees.map((a) => a.id) };
  const canEdit = !hideEditItem && canEditTask(user, taskForAuth, assignableStaff);
  const canDelete = canDeleteTask(user, taskForAuth, assignableStaff);
  if (!canEdit && !canDelete) return <ReservedActionSlot className={className} />;

  async function handleDelete() {
    if (!user) return;
    setIsDeleting(true);
    try {
      await tasksProvider.deleteTask(user, task.id);
      toastManager.add({ description: `"${task.title}" deleted.` });
      onDeleted();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't delete this task." });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent",
            className
          )}
          aria-label={`Actions for "${task.title}"`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          {canEdit && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
            >
              <Trash2 /> Delete task
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete task?"
        description={
          task.status === "done"
            ? `"${task.title}" will be removed, including its record in Completed Work and Timeline. This can't be undone.`
            : `"${task.title}" will be removed. This can't be undone.`
        }
        confirmLabel="Delete task"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
