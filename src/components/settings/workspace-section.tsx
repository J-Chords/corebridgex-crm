"use client";

import { useState } from "react";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { companiesProvider } from "@/lib/data/providers";
import { useAuth } from "@/lib/auth/auth-context";
import { hasReportingReviewAccess } from "@/lib/data/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToastManager } from "@/components/ui/toast";

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Superadmin only. Real counts from data already tracked — no dead links to pages that don't exist yet (in-app brand/service-line/user management are all later phases; see docs/route-map.md). */
export function WorkspaceSection() {
  const { user } = useAuth();
  const { brands, serviceLines, assignableStaff, refresh } = useCompanyLookups();
  const { companies } = useCompanies();
  const toastManager = useToastManager();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  async function handleToggleReviewer(targetUserId: string, enabled: boolean) {
    if (!user) return;
    setPendingUserId(targetUserId);
    try {
      await companiesProvider.setReportingReviewAccess(user, targetUserId, enabled);
      await refresh();
      toastManager.add({ description: enabled ? "Reporting review access granted" : "Reporting review access revoked" });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update reporting review access." });
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Partner brands</CardTitle>
          <CardDescription>
            {plural(brands.length, "brand")} configured, across {plural(companies.length, "client")}. Full
            in-app brand management is a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {brands.map((b) => (
            <Badge key={b.id} variant="neutral">
              {b.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service lines</CardTitle>
          <CardDescription>
            {plural(serviceLines.length, "service line")} defined across all brands. Full in-app service-line
            management is a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {serviceLines.map((sl) => (
            <Badge key={sl.id} variant="neutral">
              {sl.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client reporting reviewers</CardTitle>
          <CardDescription>
            Sparing Efficiency reporting review — an orthogonal capability, not a fourth role. Anyone granted
            this may review Draft Client Reports org-wide, correct wording, and finalize, regardless of their
            Employee/Supervisor/Superadmin role. Superadmin always has every reviewer privilege, granted or not.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {assignableStaff.map((staff) => (
            <div key={staff.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{staff.fullName}</span>
                <span className="text-xs text-muted-foreground capitalize">{staff.role}</span>
              </div>
              {staff.role === "superadmin" ? (
                <span className="text-xs text-muted-foreground">Always has reviewer access</span>
              ) : (
                <Switch
                  checked={hasReportingReviewAccess(staff)}
                  disabled={pendingUserId === staff.id}
                  onCheckedChange={(checked) => handleToggleReviewer(staff.id, checked)}
                  aria-label={`Toggle reporting review access for ${staff.fullName}`}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User management</CardTitle>
          <CardDescription>
            {plural(assignableStaff.length, "active staff member")} today. A dedicated invite/manage-accounts
            page (`/dashboard/admin/users`) is planned but not built yet.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
