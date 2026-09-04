"use client";

import { useState } from "react";
import { ChevronDown, Trash2, Undo2 } from "lucide-react";
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

type LifecycleStatus = Exclude<ProjectStatus, "trash">;
const LIFECYCLE_STATUSES: LifecycleStatus[] = ["active", "on-hold", "completed", "cancelled", "archived"];

/**
 * Project Level Stage C — the ONE control for every lifecycle transition. Admin-only (viewers see
 * just the plain badge). "On Hold"/"Canceled" require a non-empty reason before the change can be
 * saved. Trash and Restore are their own explicit, separately-confirmed actions — never reachable
 * via the status dropdown, so "Move to Trash" always feels destructive even though Trash is
 * technically a status, and Restore is never confused with picking a status back off a list.
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
  const [reasonTarget, setReasonTarget] = useState<LifecycleStatus | null>(null);
  const [reason, setReason] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
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

  async function applyStatus(status: LifecycleStatus, reasonText?: string) {
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

  function handlePick(status: LifecycleStatus) {
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
    </>
  );
}
