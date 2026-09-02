"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { adminUsersProvider } from "@/lib/data/providers";
import type { AdminUserRow } from "@/lib/data/providers/admin-users-provider";
import type { Role, ServiceLine } from "@/lib/data/types";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { PasswordInput } from "@/components/ui/password-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";

const ROLE_ITEMS: Record<Role, string> = {
  employee: ROLE_LABELS.employee,
  supervisor: ROLE_LABELS.supervisor,
  superadmin: ROLE_LABELS.superadmin,
};

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  targetUser?: AdminUserRow;
  serviceLines: ServiceLine[];
  onSaved: () => void;
}

const EMPTY_FORM = {
  fullName: "",
  email: "",
  initialPassword: "",
  role: "employee" as Role,
  serviceLeadershipIds: [] as string[],
  serviceMembershipIds: [] as string[],
  active: true,
};

/**
 * Admin Foundation Part 16 — one dialog behind both "Create User" and "Edit User". Service field
 * visibility is role-gated exactly per Stage 0/Section 12: Admin shows no Service field at all;
 * Team Lead shows both "Leads Services" and "Services" (a Team Lead may also be a plain member of a
 * different Service); Employee shows only "Services". Email is read-only in edit mode (Stage 0
 * Correction 6) — never editable here.
 */
export function UserFormDialog({ open, onOpenChange, mode, targetUser, serviceLines, onSaved }: UserFormDialogProps) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [pendingCleanupConfirm, setPendingCleanupConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    if (mode === "edit" && targetUser) {
      setForm({
        fullName: targetUser.fullName,
        email: targetUser.email,
        initialPassword: "",
        role: targetUser.role,
        serviceLeadershipIds: targetUser.serviceLeadershipIds,
        serviceMembershipIds: targetUser.serviceMembershipIds,
        active: targetUser.active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, targetUser]);

  const serviceOptions = useMemo(
    () => serviceLines.map((sl) => ({ id: sl.id, label: sl.name })),
    [serviceLines]
  );

  if (!user) return null;

  const wouldLoseLeadership =
    mode === "edit" &&
    targetUser &&
    targetUser.role === "supervisor" &&
    form.role !== "supervisor" &&
    targetUser.serviceLeadershipIds.length > 0;
  const wouldLoseMembershipToo =
    mode === "edit" && targetUser && form.role === "superadmin" && targetUser.serviceMembershipIds.length > 0;
  const affectedServiceNames = targetUser
    ? serviceLines
        .filter(
          (sl) =>
            targetUser.serviceLeadershipIds.includes(sl.id) ||
            (wouldLoseMembershipToo && targetUser.serviceMembershipIds.includes(sl.id))
        )
        .map((sl) => sl.name)
    : [];

  async function performSave() {
    if (!user || !user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        await adminUsersProvider.createUser(user, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          initialPassword: form.initialPassword,
          role: form.role,
          serviceLeadershipIds: form.role === "supervisor" ? form.serviceLeadershipIds : [],
          serviceMembershipIds:
            form.role === "employee" || form.role === "supervisor" ? form.serviceMembershipIds : [],
        });
      } else if (targetUser) {
        if (form.fullName.trim() !== targetUser.fullName) {
          await adminUsersProvider.setFullName(user, targetUser.id, form.fullName.trim());
        }
        if (form.role !== targetUser.role) {
          await adminUsersProvider.setRole(user, targetUser.id, form.role);
        }
        if (form.active !== targetUser.active) {
          await adminUsersProvider.setActive(user, targetUser.id, form.active);
        }
        if (form.role === "supervisor") {
          await adminUsersProvider.setServiceLeadership(user, targetUser.id, form.serviceLeadershipIds);
        }
        if (form.role === "employee" || form.role === "supervisor") {
          await adminUsersProvider.setServiceMembership(user, targetUser.id, form.serviceMembershipIds);
        }
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setError("Name can't be empty.");
      return;
    }
    if (mode === "create" && !form.email.trim()) {
      setError("Email can't be empty.");
      return;
    }
    if (mode === "create" && form.initialPassword.length < 8) {
      setError("Initial password must be at least 8 characters.");
      return;
    }
    if (wouldLoseLeadership || wouldLoseMembershipToo) {
      setPendingCleanupConfirm(true);
      return;
    }
    await performSave();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{mode === "create" ? "New user" : "Edit user"}</DialogTitle>
              <DialogDescription>
                {mode === "create"
                  ? "Create an account. The user must change this password before normal access."
                  : `Update ${targetUser?.fullName ?? "this user"}'s details.`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
              <FloatingLabelInput
                label="Full name"
                required
                value={form.fullName}
                onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              />
              {mode === "create" ? (
                <FloatingLabelInput
                  label="Email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <FloatingLabelInput label="Email" value={form.email} disabled readOnly />
                  <p className="text-xs text-muted-foreground">Email changes are not available yet.</p>
                </div>
              )}
              {mode === "create" && (
                <PasswordInput
                  label="Initial password"
                  required
                  autoComplete="new-password"
                  value={form.initialPassword}
                  onChange={(e) => setForm((p) => ({ ...p, initialPassword: e.target.value }))}
                />
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-role">Role</Label>
                <Select
                  items={ROLE_ITEMS}
                  value={form.role}
                  onValueChange={(v) => setForm((p) => ({ ...p, role: (v ?? "employee") as Role }))}
                >
                  <SelectTrigger id="user-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">{ROLE_LABELS.employee}</SelectItem>
                    <SelectItem value="supervisor">{ROLE_LABELS.supervisor}</SelectItem>
                    <SelectItem value="superadmin">{ROLE_LABELS.superadmin}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.role === "supervisor" && (
                <div className="flex flex-col gap-1.5">
                  <Label>Services Led</Label>
                  <p className="text-xs text-muted-foreground">
                    Services this Team Lead is responsible for across all Projects.
                  </p>
                  <MultiSelect
                    options={serviceOptions}
                    value={form.serviceLeadershipIds}
                    onChange={(ids) => setForm((p) => ({ ...p, serviceLeadershipIds: ids }))}
                    placeholder="Leads no Services"
                    searchPlaceholder="Search Services…"
                    aria-label="Services Led"
                  />
                </div>
              )}
              {(form.role === "employee" || form.role === "supervisor") && (
                <div className="flex flex-col gap-1.5">
                  <Label>Works In Services</Label>
                  <p className="text-xs text-muted-foreground">
                    Services where this user participates as an operational team member.
                  </p>
                  <MultiSelect
                    options={serviceOptions}
                    value={form.serviceMembershipIds}
                    onChange={(ids) => setForm((p) => ({ ...p, serviceMembershipIds: ids }))}
                    placeholder="Works in no Services"
                    searchPlaceholder="Search Services…"
                    aria-label="Works In Services"
                  />
                </div>
              )}

              {mode === "edit" && targetUser && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Active</span>
                    <span className="text-xs text-muted-foreground">
                      Inactive users lose all data access immediately.
                    </span>
                  </div>
                  <Switch
                    checked={form.active}
                    onCheckedChange={(checked) => setForm((p) => ({ ...p, active: checked }))}
                  />
                </div>
              )}

              {mode === "edit" && targetUser && (
                <Button type="button" variant="outline" onClick={() => setResetPasswordOpen(true)}>
                  Reset password
                </Button>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingCleanupConfirm}
        onOpenChange={setPendingCleanupConfirm}
        title="Remove Service leadership?"
        description={
          affectedServiceNames.length > 0
            ? `Changing this user's role to ${ROLE_LABELS[form.role]} will remove their Team Lead assignment for: ${affectedServiceNames.join(", ")}. This can't be undone automatically — you'd need to re-add them as a member afterward if that's still wanted.`
            : "Changing this user's role will remove their current Service staffing assignments."
        }
        confirmLabel="Change role"
        onConfirm={() => void performSave()}
      />

      {mode === "edit" && targetUser && (
        <ResetPasswordDialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen} targetUser={targetUser} />
      )}
    </>
  );
}
