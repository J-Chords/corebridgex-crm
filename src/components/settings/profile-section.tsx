"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Camera } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useToastManager } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { canEditOwnProfile } from "@/lib/data/permissions";
import type { User } from "@/lib/data/types";

import { getInitials as initials } from "@/lib/initials";

export function ProfileSection({ user }: { user: User }) {
  const canEdit = canEditOwnProfile(user);
  const { updateProfile } = useAuth();
  const toastManager = useToastManager();

  const [form, setForm] = useState({ fullName: user.fullName, email: user.email });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const isDirty = form.fullName.trim() !== user.fullName || form.email.trim() !== user.email;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await updateProfile({ fullName: form.fullName.trim(), email: form.email.trim() });
      toastManager.add({ description: "Profile updated" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (passwordForm.next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    toastManager.add({ description: "Password changes will take effect once real authentication is connected." });
    setPasswordForm({ current: "", next: "", confirm: "" });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            {canEdit
              ? "Your name and email, as they appear everywhere across the app."
              : "Your name and email, as they appear everywhere across the app. Only a superadmin can make changes here."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Avatar size="lg">
                  <AvatarFallback>{initials(form.fullName.trim() || user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Camera /> Upload photo
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Photo uploads arrive with the real backend&apos;s file storage — every avatar in the app is initials-only for now.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FloatingLabelInput
                  label="Full name"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                />
                <FloatingLabelInput
                  label="Email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>

              <div>
                <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Role</span>
                <p className="mt-1.5 text-sm">{ROLE_LABELS[user.role]} — set by your admin, not editable here.</p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}

              <div>
                <Button type="submit" disabled={!isDirty || isSaving}>
                  {isSaving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Avatar size="lg">
                  <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
                </Avatar>
                <p className="text-xs text-muted-foreground">
                  Photo uploads arrive with the real backend&apos;s file storage — every avatar in the app is initials-only for now.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Full name</span>
                  <p className="mt-1.5 text-sm">{user.fullName}</p>
                </div>
                <div>
                  <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Email</span>
                  <p className="mt-1.5 text-sm">{user.email}</p>
                </div>
              </div>

              <div>
                <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Role</span>
                <p className="mt-1.5 text-sm">{ROLE_LABELS[user.role]} — set by your admin, not editable here.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Real authentication — and a real credential store to change a password against — comes with the
            Supabase backend. This form validates normally; submitting it won&apos;t change anything yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <FloatingLabelInput
              label="Current password"
              type="password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FloatingLabelInput
                label="New password"
                type="password"
                value={passwordForm.next}
                onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
              />
              <FloatingLabelInput
                label="Confirm new password"
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
              />
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>{passwordError}</AlertTitle>
              </Alert>
            )}

            <div>
              <Button
                type="submit"
                variant="outline"
                disabled={!passwordForm.current || !passwordForm.next || !passwordForm.confirm}
              >
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
