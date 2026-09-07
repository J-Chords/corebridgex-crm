"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { TaskStatus } from "@/lib/data/types";
import { STATUS_META } from "@/components/tasks/task-status-badge";

interface StatusReasonDialogProps {
  /** The status a status-change surface is about to move TO — null keeps the dialog closed. Only
   * ever "waiting"/"blocked" in practice (the two statuses that require a reason). */
  pendingStatus: TaskStatus | null;
  onCancel: () => void;
  onConfirm: (statusReason: string) => void;
  isSubmitting?: boolean;
}

/**
 * Task Level Phase 1, Sections 5-6 — a tiny, single-field prompt for the one piece of new required
 * input (`status_reason`) that quick status-change surfaces without their own form (the full Task
 * page's compact `TaskStatusRail`, the Kanban board's drag-to-column) have no other way to collect.
 * Deliberately not a redesign of either surface — just the smallest reusable dialog that makes an
 * already-required server rule actually usable end-to-end, until Phase 2's own Task-workspace pass.
 */
export function StatusReasonDialog({ pendingStatus, onCancel, onConfirm, isSubmitting }: StatusReasonDialogProps) {
  const [reason, setReason] = useState("");
  // Resets the draft reason whenever a new status-change is proposed — the React-recommended
  // "adjust state during render" pattern (not an effect) so this never triggers a second render pass.
  const [lastPendingStatus, setLastPendingStatus] = useState(pendingStatus);
  if (pendingStatus !== lastPendingStatus) {
    setLastPendingStatus(pendingStatus);
    if (pendingStatus) setReason("");
  }

  const label = pendingStatus ? STATUS_META[pendingStatus].label : "";

  return (
    <Dialog open={pendingStatus !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Why is this {label.toLowerCase()}?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status-reason-input">Reason</Label>
          <Textarea
            id="status-reason-input"
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`Describe what it's ${label.toLowerCase() === "blocked" ? "blocked by" : "waiting on"}…`}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(reason.trim())} disabled={!reason.trim() || isSubmitting}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
