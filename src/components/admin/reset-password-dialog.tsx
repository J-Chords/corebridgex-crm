"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { adminUsersProvider } from "@/lib/data/providers";
import type { AdminUserRow } from "@/lib/data/providers/admin-users-provider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useToastManager } from "@/components/ui/toast";

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: AdminUserRow;
}

/**
 * Admin Foundation Part 11 — Admin sets a new password directly (no email-link flow in this
 * slice). Re-arms must_change_password server-side; the Admin never sees the resulting password
 * again after this dialog closes, and this component never displays or stores it beyond the form.
 */
export function ResetPasswordDialog({ open, onOpenChange, targetUser }: ResetPasswordDialogProps) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await adminUsersProvider.resetPassword(user, targetUser.id, password);
      toastManager.add({ description: `${targetUser.fullName} must set a new password on next sign-in.` });
      setPassword("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset this password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {targetUser.fullName}. They&apos;ll be required to change it again on next sign-in.
            </DialogDescription>
          </DialogHeader>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
