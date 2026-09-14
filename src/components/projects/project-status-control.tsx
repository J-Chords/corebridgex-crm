"use client";

import { useState } from "react";
import { Archive, ChevronDown, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { projectsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import type { ProjectStatus } from "@/lib/data/types";
import { canManageProjects } from "@/lib/data/permissions";
import { ProjectStatusBadge, PROJECT_STATUS_META } from "@/components/projects/project-status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToastManager } from "@/components/ui/toast";

type AnyLifecycleStatus = Exclude<ProjectStatus, "trash">;
type NormalStatus = Exclude<AnyLifecycleStatus, "archived">;
/** The normal, ordinary status-dropdown targets — Archive is its own dedicated action in
 * `ProjectLifecycleMenu`, never one flat pick among these (mirrors Trash's own dedicated
 * Move-to-Trash/Restore pair). */
const LIFECYCLE_STATUSES: NormalStatus[] = ["active", "on-hold", "completed", "cancelled"];

/**
 * MVP Simplification Pass (boss feedback) — the project header used to give Archive/Move to Trash
 * equal visual weight to the status itself, which read as too dominant/risky for everyday use. The
 * one control from Project Level Stage C onward is now split into two: this component is just the
 * status badge/dropdown (Active/On Hold/Completed/Canceled, with a reason prompt for On Hold/
 * Canceled) — rendered next to the Project name, where status has always lived. The separate
 * `ProjectLifecycleMenu` below holds Archive/Trash/Restore/Reactivate in a 3-dot overflow menu next
 * to Edit, so those less-frequent, more consequential actions no longer compete for attention with
 * the everyday status control. Admin-only (viewers see just the plain badge); while the Project is
 * itself Archived or in Trash there's no normal dropdown here at all — those two states are handled
 * entirely by the overflow menu's own dedicated Reactivate/Restore action.
 */
export function ProjectStatusControl({
  project,
  onChanged,
}: {
  project: ProjectWithRelations;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [reasonTarget, setReasonTarget] = useState<NormalStatus | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (
    !user ||
    !canManageProjects(user) ||
    project.status === "archived" ||
    project.status === "trash"
  ) {
    return (
      <div className="flex flex-col gap-0.5">
        <ProjectStatusBadge status={project.status} />
        {project.statusReason && (project.status === "on-hold" || project.status === "cancelled") && (
          <span className="text-xs text-muted-foreground">{project.statusReason}</span>
        )}
      </div>
    );
  }

  async function applyStatus(status: NormalStatus, reasonText?: string) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await projectsProvider.setProjectStatus(user, project.id, status, reasonText);
      onChanged();
      toastManager.add({ description: `Status changed to ${PROJECT_STATUS_META[status].label}` });
      setReasonTarget(null);
      setReason("");
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't change status." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePick(status: NormalStatus) {
    if (status === project.status) return;
    if (status === "on-hold" || status === "cancelled") {
      setReasonTarget(status);
      setReason("");
      return;
    }
    void applyStatus(status);
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={isSubmitting} />}>
            <ProjectStatusBadge status={project.status} />
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {LIFECYCLE_STATUSES.map((status) => (
              <DropdownMenuItem key={status} disabled={status === project.status} onClick={() => handlePick(status)}>
                {PROJECT_STATUS_META[status].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {project.statusReason && (project.status === "on-hold" || project.status === "cancelled") && (
          <span className="text-xs text-muted-foreground">{project.statusReason}</span>
        )}
      </div>

      <Dialog open={reasonTarget !== null} onOpenChange={(open) => !open && setReasonTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to {reasonTarget ? PROJECT_STATUS_META[reasonTarget].label : ""}</DialogTitle>
            <DialogDescription>A reason is required for this status.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Waiting for client, Commercial / contract, External dependency…"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReasonTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!reason.trim() || isSubmitting}
              onClick={() => reasonTarget && void applyStatus(reasonTarget, reason)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The 3-dot overflow menu for Archive/Move to Trash (rendered near Edit in the header) — Reactivate
 * (while Archived) and Restore (while in Trash) render as a single plain button instead, since a
 * one-item menu adds a click for no benefit. Admin-only; returns nothing at all for any other
 * viewer, matching `ProjectStatusControl`'s own gate.
 */
export function ProjectLifecycleMenu({
  project,
  onChanged,
}: {
  project: ProjectWithRelations;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user || !canManageProjects(user)) return null;

  async function applyStatus(status: "active" | "archived") {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // ONE authoritative lifecycle transition call — the Archive date is stamped atomically inside
      // `setProjectStatus` itself (both the hosted RPC and the mock provider).
      await projectsProvider.setProjectStatus(user, project.id, status);
      onChanged();
      toastManager.add({ description: status === "archived" ? "Client archived" : "Client reactivated" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't change status." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTrash() {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await projectsProvider.trashProject(user, project.id);
      onChanged();
      toastManager.add({ description: "Project moved to Trash" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't move to Trash." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRestore() {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await projectsProvider.restoreProject(user, project.id);
      onChanged();
      toastManager.add({ description: "Project restored" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't restore." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (project.status === "trash") {
    return (
      <Button size="sm" variant="outline" disabled={isSubmitting} onClick={handleRestore}>
        <Undo2 /> Restore
      </Button>
    );
  }

  if (project.status === "archived") {
    return (
      <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => void applyStatus("active")}>
        <Undo2 /> Reactivate
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={isSubmitting} aria-label="More project actions" />}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
            <Archive /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmTrash(true)}>
            <Trash2 /> Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmTrash}
        onOpenChange={setConfirmTrash}
        title="Move this Project to Trash?"
        description="It will be hidden from the default Projects list. Restore it any time from the Trash view."
        confirmLabel="Move to Trash"
        confirmVariant="destructive"
        onConfirm={() => void handleTrash()}
      />

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this client?"
        description="This client is excluded from active work by default, but every Service, Task, Comment, document, and time entry stays fully accessible — reactivate this same workspace any time."
        confirmLabel="Archive"
        onConfirm={() => void applyStatus("archived")}
      />
    </>
  );
}
