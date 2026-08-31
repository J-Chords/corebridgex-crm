"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Defaults to the normal primary button — pass "destructive" for an irreversible action like delete. */
  confirmVariant?: "default" | "destructive";
  onConfirm: () => void;
}

/**
 * A small, generic yes/no confirmation gate built on the existing `Dialog` primitives — this
 * codebase has no dedicated AlertDialog component and no prior confirm-before-destructive-action
 * pattern (every existing action, including permanent-delete flows, fires immediately). Introduced
 * for Phase 10's "mark a parent Task Done while Subtasks are still open" warning — a warning the
 * user may dismiss and still proceed past, never a hard block. Generic enough to reuse for any
 * future "are you sure" gate rather than hand-rolling another one.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Continue", cancelLabel = "Cancel", confirmVariant = "default", onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
