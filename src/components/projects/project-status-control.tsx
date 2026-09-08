"use client";

import { useState } from "react";
import { Archive, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { projectsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import { canManageProjects } from "@/lib/data/permissions";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToastManager } from "@/components/ui/toast";

type LifecycleStatus = "active" | "archived";

/**
 * Project Level Stage C, extended by the Product Owner's Authoritative Lifecycle Hardening
 * correction — the ONE control for every lifecycle transition. Admin-only (viewers see just the
 * plain badge). Normal user-facing lifecycle is now just Active -> Archived -> Reactivate, mirrored
 * one-for-one by Trash/Restore for the separate removal workflow. "Completed"/"On Hold"/"Canceled"
 * are retired from this normal control entirely — an exhaustive search found no other feature in
 * the app that reads a Project's own status for any of those three values (unlike, say, Workstream
 * or Project Issue status, which are unrelated concepts on different entities), so none qualifies
 * as "a current accepted business workflow" per the Product Owner's own test; the authoritative
 * `set_project_status` RPC/mock now reject them as targets at the data layer too, not just here.
 * Their labels/badges stay defined (`PROJECT_STATUS_META`) purely so an already-existing legacy row
 * — mock or hosted — still renders a real label and still gets a path forward via the same
 * Archive/Trash actions below, never a dead end and never silently reinterpreted. Archiving stamps
 * the persisted archive date atomically inside `setProjectStatus` itself now (both providers) —
 * this component makes exactly ONE call per transition, no separate `updateProject` orchestration.
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

  async function applyStatus(status: LifecycleStatus) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // ONE authoritative lifecycle transition call — the archive date is stamped atomically
      // inside `setProjectStatus` itself (both the hosted RPC and the mock provider), so there's
      // no separate `updateProject` orchestration that could succeed/fail independently.
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

  // Active, or a legacy row still carrying one of the retired "on-hold"/"cancelled"/"completed"
  // values (currently zero-count in mock; any real hosted legacy row is unaffected — its stored
  // reason, if any, still reads below). No dropdown back into those retired values — Archive/Trash
  // are the only two paths forward, exactly like the normal Active case.
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <ProjectStatusBadge status={project.status} />
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
