"use client";

import { useState } from "react";
import { Archive, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { workstreamsProvider } from "@/lib/data/providers";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { canManageWorkstreams } from "@/lib/data/permissions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToastManager } from "@/components/ui/toast";

interface WorkstreamLifecycleMenuProps {
  workstream: WorkstreamWithRelations;
  onChanged: () => void;
  /** Only passed by the Project Services list row, which has no standalone Edit action of its own —
   * the Service Detail page already has its own dedicated "Edit Service" button next to this menu,
   * so it omits this prop rather than showing Edit twice. */
  onEdit?: () => void;
}

/**
 * CD-162 post-manual-QA pass — Admin-only 3-dot lifecycle menu for a Project Service: Archive
 * (reuses the existing "cancelled" status — the same lever Edit Service's own Status field already
 * exposes, just a one-click shortcut instead of opening the full form) / Reactivate, and Remove (a
 * true, permanent delete — only ever offered when this Service has never had a Task created under
 * it; re-verified server-side inside `deleteWorkstream`, never trusted from the UI, since
 * `tasks.workstream_id` cascade-deletes on the hosted schema). Gated on the existing
 * `canManageWorkstreams` boundary (Superadmin only) — same as Edit Service already uses; no new
 * permission introduced, and returns nothing at all for any other viewer, including Team Lead.
 */
export function WorkstreamLifecycleMenu({ workstream, onChanged, onEdit }: WorkstreamLifecycleMenuProps) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user || !canManageWorkstreams(user)) return null;

  const canRemove = workstream.taskCount === 0;

  async function applyStatus(status: "active" | "cancelled") {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // ONE full updateWorkstream call, reusing every field this Service already has — Archive/
      // Reactivate only ever changes `status`, never anything else about the Service.
      await workstreamsProvider.updateWorkstream(user, workstream.id, {
        name: workstream.name,
        description: workstream.description,
        companyId: workstream.companyId,
        serviceLineId: workstream.serviceLineId,
        leadUserId: workstream.leadUserId,
        teamUserIds: workstream.team.map((t) => t.id),
        status,
        startDate: workstream.startDate,
        endDate: workstream.endDate,
        recurrenceFrequency: workstream.recurrenceFrequency,
        recurrenceAnchorDate: workstream.recurrenceAnchorDate,
        recurrenceCustomIntervalDays: workstream.recurrenceCustomIntervalDays,
        activityIds: workstream.activities.map((a) => a.id),
      });
      onChanged();
      toastManager.add({ description: status === "cancelled" ? "Service archived" : "Service reactivated" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't change status." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await workstreamsProvider.deleteWorkstream(user, workstream.id);
      onChanged();
      toastManager.add({ description: "Service removed" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't remove this service." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (workstream.status === "cancelled") {
    return (
      <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => void applyStatus("active")}>
        <Undo2 /> Reactivate
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="sm" variant="outline" disabled={isSubmitting} aria-label="More service actions" />}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
            <Archive /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={!canRemove} onClick={() => setConfirmRemove(true)}>
            <Trash2 /> {canRemove ? "Remove" : "Remove (has tasks)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this Service?"
        description="It's excluded from the active Services list by default, but every Task, Activity, and time entry stays fully accessible — reactivate it any time."
        confirmLabel="Archive"
        onConfirm={() => void applyStatus("cancelled")}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove this Service?"
        description="This permanently deletes the Service. This can't be undone — only available while it has no Tasks."
        confirmLabel="Remove"
        confirmVariant="destructive"
        onConfirm={() => void handleRemove()}
      />
    </>
  );
}
