"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Copy, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { adminUsersProvider } from "@/lib/data/providers";
import type { AdminUserRow } from "@/lib/data/providers/admin-users-provider";
import type { Role, ServiceLine } from "@/lib/data/types";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { FormDialog, FormDialogColumns } from "@/components/ui/form-dialog";
import {
  FormDrawerHeader,
  FormDrawerBody,
  FormDrawerSection,
  FormDrawerField,
  FormDrawerFooter,
} from "@/components/ui/form-drawer";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";
import { useToastManager } from "@/components/ui/toast";

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
 *
 * Boss Feedback Alignment, Section 16 — rebuilt on the large centered `FormDialog` shell (~960px),
 * the same one Task/Service create-edit already uses, replacing the old cramped `sm:max-w-lg` (512px)
 * `Dialog` that needed its own `max-h-[65vh]` internal-scroll workaround to fit this form's content —
 * the densest of any Admin form. Shell/layout only; no field, validation, or permission changed.
 */
export function UserFormDialog({ open, onOpenChange, mode, targetUser, serviceLines, onSaved }: UserFormDialogProps) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [pendingCleanupConfirm, setPendingCleanupConfirm] = useState(false);
  // CD-162 post-manual-QA pass — set only right after a successful create; while non-null, the
  // dialog swaps its body to the one-time password reveal view instead of the normal form. Cleared
  // whenever the dialog reopens, so a later "Create User" never shows a stale reveal.
  const [createdAccount, setCreatedAccount] = useState<{ fullName: string; temporaryPassword: string } | null>(null);
  const [passwordRevealed, setPasswordRevealed] = useState(true);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setCreatedAccount(null);
    setPasswordRevealed(true);
    if (mode === "edit" && targetUser) {
      setForm({
        fullName: targetUser.fullName,
        email: targetUser.email,
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
        const result = await adminUsersProvider.createUser(user, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          role: form.role,
          serviceLeadershipIds: form.role === "supervisor" ? form.serviceLeadershipIds : [],
          serviceMembershipIds:
            form.role === "employee" || form.role === "supervisor" ? form.serviceMembershipIds : [],
        });
        onSaved();
        // Dialog stays open — swaps to the password-reveal view below; only "Done" closes it from
        // here on. Skips the shared `onSaved(); onOpenChange(false);` at the bottom on purpose.
        setCreatedAccount({ fullName: result.user.fullName, temporaryPassword: result.temporaryPassword });
        return;
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
    if (wouldLoseLeadership || wouldLoseMembershipToo) {
      setPendingCleanupConfirm(true);
      return;
    }
    await performSave();
  }

  async function handleCopyPassword() {
    if (!createdAccount) return;
    try {
      await navigator.clipboard.writeText(createdAccount.temporaryPassword);
      toastManager.add({ description: "Password copied to clipboard." });
    } catch {
      toastManager.add({ description: "Couldn't copy — select the password and copy it manually." });
    }
  }

  function handleDone() {
    setCreatedAccount(null);
    onOpenChange(false);
  }

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        srTitle={createdAccount ? "Account created" : mode === "create" ? "New user" : "Edit user"}
      >
        {createdAccount ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <FormDrawerHeader
              title="Account created"
              context={`${createdAccount.fullName}'s account is ready. Share this temporary password with them directly — they'll be required to change it on first sign-in.`}
            />
            <FormDrawerBody>
              <FormDrawerSection label="Temporary password">
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm tracking-wide">
                    {passwordRevealed ? createdAccount.temporaryPassword : "•".repeat(createdAccount.temporaryPassword.length)}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setPasswordRevealed((v) => !v)}
                    aria-label={passwordRevealed ? "Hide password" : "Show password"}
                  >
                    {passwordRevealed ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleCopyPassword()}>
                    <Copy /> Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This won&apos;t be shown again once you close this dialog — copy it now if you haven&apos;t already.
                </p>
              </FormDrawerSection>
            </FormDrawerBody>
            <FormDrawerFooter>
              <Button type="button" onClick={handleDone}>
                Done
              </Button>
            </FormDrawerFooter>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <FormDrawerHeader
            title={mode === "create" ? "New user" : "Edit user"}
            context={
              mode === "create"
                ? "A secure temporary password is generated automatically once you save — the user must change it before normal access."
                : `Update ${targetUser?.fullName ?? "this user"}'s details.`
            }
          />

          <FormDrawerBody>
            <FormDialogColumns>
              <FormDrawerSection label="Identity">
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
              </FormDrawerSection>

              <FormDrawerSection label="Access">
                <FormDrawerField label="Role" htmlFor="user-role">
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
                </FormDrawerField>

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
              </FormDrawerSection>
            </FormDialogColumns>

            {(form.role === "supervisor" || form.role === "employee") && (
              <FormDrawerSection label="Service Staffing">
                <FormDialogColumns>
                  {form.role === "supervisor" && (
                    <FormDrawerField label="Services Led">
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
                    </FormDrawerField>
                  )}
                  <FormDrawerField label="Works In Services">
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
                  </FormDrawerField>
                </FormDialogColumns>
              </FormDrawerSection>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
          </FormDrawerBody>

          <FormDrawerFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </FormDrawerFooter>
        </form>
        )}
      </FormDialog>

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
