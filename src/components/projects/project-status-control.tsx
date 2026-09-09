"use client";

import { useState } from "react";
import { Archive, ChevronDown, Trash2, Undo2 } from "lucide-react";
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
/** The normal, ordinary status-dropdown targets — Archive is its own dedicated action below, never
 * one flat pick among these (mirrors Trash's own dedicated Move-to-Trash/Restore pair). */
const LIFECYCLE_STATUSES: Exclude<AnyLifecycleStatus, "archived">[] = ["active", "on-hold", "completed", "cancelled"];

/**
 * Project Level Stage C, restored by the Product Owner's Boss-Aligned Project Status Restoration —
 * the ONE control for every lifecycle transition. Admin-only (viewers see just the plain badge).
 * Normal business states are Active/On Hold/Completed/Canceled, picked from one dropdown ("On
 * Hold"/"Canceled" require a non-empty reason before the change can be saved); Archive/Reactivate
 * and Trash/Restore are each their own dedicated, separately-confirmed action pair — never reachable
 * via the generic dropdown, so each always reads as its own distinct, intentional move rather than
 * one flat pick among many. Archiving stamps `archivedAt` (always the latest date) atomically inside
 * `setProjectStatus` itself; moving to Completed stamps `completionDate` the same way, but only the
 * first time (never overwritten by a later transition) — the two dates are never conflated.
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
  const [reasonTarget, setReasonTarget] = useState<Exclude<AnyLifecycleStatus, "archived"> | null>(null);
  const [reason, setReason] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return <ProjectStatusBadge status={project.status} />;
  if (!canManageProjects(user)) {
    return (
      <div className="flex flex-col gap-0.5">
        <ProjectStatusBadge status={project.status} />
        {project.statusReason && (project.status === "on-hold" || project.status === "cancelled") && (
          <span className="text-xs text-muted-foreground">{project.statusReason}</span>
        )}
      </div>
    );
  }

  async function applyStatus(status: AnyLifecycleStatus, reasonText?: string) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // ONE authoritative lifecycle transition call — the Archive/Completed dates are each stamped
      // atomically inside `setProjectStatus` itself (both the hosted RPC and the mock provider), so
      // there's no separate `updateProject` orchestration that could succeed/fail independently.
      await projectsProvider.setProjectStatus(user, project.id, status, reasonText);
      onChanged();
      toastManager.add({
        description: status === "archived" ? "Client archived" : status === "active" ? "Client reactivated" : `Status changed to ${PROJECT_STATUS_META[status].label}`,
      });
      setReasonTarget(null);
      setReason("");
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't change status." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePick(status: Exclude<AnyLifecycleStatus, "archived">) {
    if (status === project.status) return;
    if (status === "on-hold" || status === "cancelled") {
      setReasonTarget(status);
      setReason("");
      return;
    }
    void applyStatus(status);
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
      <div className="flex items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        <Button size="sm" variant="outline" disabled={isSubmitting} onClick={handleRestore}>
          <Undo2 /> Restore
        </Button>
      </div>
    );
  }

  // Archived is its own dedicated branch too — the SAME workspace, just returned to Active via one
  // explicit Reactivate action (never a new/cloned Project, never a status-dropdown pick).
  if (project.status === "archived") {
    return (
      <div className="flex items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => void applyStatus("active")}>
          <Undo2 /> Reactivate
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
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
          <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => setConfirmArchive(true)}>
            <Archive /> Archive
          </Button>
          <Button size="sm" variant="ghost" disabled={isSubmitting} onClick={() => setConfirmTrash(true)}>
            <Trash2 /> Move to Trash
          </Button>
        </div>
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
