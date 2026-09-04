"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { isSupervisor } from "@/lib/data/permissions";
import { companiesProvider } from "@/lib/data/providers";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import type { CompanyStatus } from "@/lib/data/types";
import { COMPANY_STATUS_SELECT_ITEMS } from "@/components/companies/company-status-badge";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  company?: CompanyWithRelations;
  onSaved: () => void;
}

const EMPTY_FORM = {
  name: "",
  status: "prospect" as CompanyStatus,
  brandId: "",
  serviceLineIds: [] as string[],
  contractStartDate: "",
  renewalDate: "",
  assignedStaffIds: [] as string[],
};

export function CompanyFormDialog({ open, onOpenChange, mode, company, onSaved }: CompanyFormDialogProps) {
  const { user } = useAuth();
  const { brands, serviceLines, assignableStaff } = useCompanyLookups();
  const router = useRouter();

  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    // Reset the form to match whichever company (or blank) the dialog was opened for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    if (company) {
      setForm({
        name: company.name,
        status: company.status,
        brandId: company.brandId ?? "",
        serviceLineIds: company.serviceLines.map((sl) => sl.id),
        contractStartDate: company.contractStartDate ?? "",
        renewalDate: company.renewalDate ?? "",
        assignedStaffIds: company.assignedStaff.map((s) => s.id),
      });
    } else {
      // Default the creating supervisor onto their own new company — otherwise
      // they'd immediately lose access to it (visibility is assignedCompanyIds-only).
      setForm({
        ...EMPTY_FORM,
        assignedStaffIds: isSupervisor(user) ? [user.id] : [],
      });
    }
  }, [open, company, user]);

  if (!user) return null;

  function toggleServiceLine(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      serviceLineIds: checked
        ? [...prev.serviceLineIds, id]
        : prev.serviceLineIds.filter((sid) => sid !== id),
    }));
  }

  function toggleStaff(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      assignedStaffIds: checked
        ? [...prev.assignedStaffIds, id]
        : prev.assignedStaffIds.filter((sid) => sid !== id),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const input = {
        name: form.name.trim(),
        status: form.status,
        brandId: form.brandId || null,
        serviceLineIds: form.serviceLineIds,
        contractStartDate: form.contractStartDate || null,
        renewalDate: form.renewalDate || null,
        assignedStaffIds: form.assignedStaffIds,
      };
      if (mode === "edit" && company) {
        await companiesProvider.updateCompany(user, company.id, input);
        onSaved();
        onOpenChange(false);
      } else {
        const created = await companiesProvider.createCompany(user, input);
        onSaved();
        onOpenChange(false);
        router.push(`/dashboard/companies/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save company.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "New company" : "Edit company"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Add a client company to the org."
                : `Update ${company?.name ?? "this company"}'s details.`}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-4">
              <FloatingLabelInput
                label="Company name"
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="company-status">Status</Label>
                  <Select
                    items={COMPANY_STATUS_SELECT_ITEMS}
                    value={form.status}
                    onValueChange={(v) => setForm((p) => ({ ...p, status: v as CompanyStatus }))}
                  >
                    <SelectTrigger id="company-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="dormant">Dormant</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="company-brand">Partner brand (optional)</Label>
                  <Select
                    items={{ "": "No brand yet", ...Object.fromEntries(brands.map((b) => [b.id, b.name])) }}
                    value={form.brandId}
                    onValueChange={(v) => setForm((p) => ({ ...p, brandId: v ?? "" }))}
                  >
                    <SelectTrigger id="company-brand" className="w-full">
                      <SelectValue placeholder="No brand yet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No brand yet</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Client/master data — required only before this client&apos;s first Service can be created.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contractStartDate">Contract start</Label>
                  <Input
                    id="contractStartDate"
                    type="date"
                    value={form.contractStartDate}
                    onChange={(e) => setForm((p) => ({ ...p, contractStartDate: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="renewalDate">Renewal date</Label>
                  <Input
                    id="renewalDate"
                    type="date"
                    value={form.renewalDate}
                    onChange={(e) => setForm((p) => ({ ...p, renewalDate: e.target.value }))}
                  />
                </div>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Service lines</legend>
                <div className="grid grid-cols-2 gap-2">
                  {serviceLines.map((sl) => (
                    <label key={sl.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.serviceLineIds.includes(sl.id)}
                        onCheckedChange={(checked) => toggleServiceLine(sl.id, checked === true)}
                      />
                      {sl.name}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Assigned staff</legend>
                {assignableStaff.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No assignable staff found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {assignableStaff.map((staff) => (
                      <label key={staff.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.assignedStaffIds.includes(staff.id)}
                          onCheckedChange={(checked) => toggleStaff(staff.id, checked === true)}
                        />
                        {staff.fullName}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !form.name}>
              {isSubmitting ? "Saving…" : mode === "create" ? "Create company" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
