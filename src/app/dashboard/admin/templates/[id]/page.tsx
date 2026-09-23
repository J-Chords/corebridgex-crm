"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useServiceStaffing } from "@/lib/data/hooks/use-service-membership";
import { useServiceLineCatalog } from "@/lib/data/hooks/use-service-lines";
import { useAdminUsers } from "@/lib/data/hooks/use-admin-users";
import { canManageAdminUsers } from "@/lib/data/permissions";
import { serviceMembershipProvider } from "@/lib/data/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToastManager } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TruncatedText } from "@/components/ui/truncated-text";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ServiceLineFormDialog } from "@/components/admin/service-line-form-dialog";
import { ManageServiceActivitiesDialog } from "@/components/admin/manage-service-activities-dialog";
import { serviceLinesProvider } from "@/lib/data/providers";

/**
 * Phase 1 Template workspace — a Template's own detail page (new this phase; the Template catalog
 * previously had no per-row route at all). Reuses the existing `ServiceLine`/staffing/Activity
 * architecture exactly as the list page does — no new data model. Full editable Team Leads/Members
 * live here (not on the list, which stays a compact scan surface).
 */
export default function AdminTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const { staffing, refresh: refreshStaffing } = useServiceStaffing();
  const { users } = useAdminUsers();
  const { serviceLines, refresh: refreshCatalog } = useServiceLineCatalog();
  const toastManager = useToastManager();

  const [pendingStaffing, setPendingStaffing] = useState(false);
  const [pendingCatalog, setPendingCatalog] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (user && !canManageAdminUsers(user)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const serviceLine = serviceLines.find((sl) => sl.id === id);
  const row = staffing.find((s) => s.serviceLineId === id);

  const teamLeadOptions = useMemo(
    () =>
      users
        .filter((u) => u.role === "supervisor" && u.active)
        .map((u) => ({ id: u.id, label: u.fullName, sublabel: u.email })),
    [users]
  );
  const memberOptions = useMemo(
    () =>
      users
        .filter((u) => (u.role === "employee" || u.role === "supervisor") && u.active)
        .map((u) => ({ id: u.id, label: u.fullName, sublabel: u.email })),
    [users]
  );

  if (!user || !canManageAdminUsers(user)) return null;

  if (!serviceLine) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumb items={[{ label: "Templates", href: "/dashboard/admin/templates" }, { label: "Not found" }]} />
        <p className="text-sm text-muted-foreground">This Template doesn&apos;t exist, or has been removed.</p>
      </div>
    );
  }

  async function handleSetTeamLeads(userIds: string[]) {
    if (!user) return;
    setPendingStaffing(true);
    try {
      await serviceMembershipProvider.setTeamLeads(user, id, userIds);
      await refreshStaffing();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update Team Leads." });
    } finally {
      setPendingStaffing(false);
    }
  }

  async function handleSetMembers(userIds: string[]) {
    if (!user) return;
    setPendingStaffing(true);
    try {
      await serviceMembershipProvider.setEmployees(user, id, userIds);
      await refreshStaffing();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update Members." });
    } finally {
      setPendingStaffing(false);
    }
  }

  async function handleSetActive(isActive: boolean) {
    if (!user || !serviceLine) return;
    setPendingCatalog(true);
    try {
      await serviceLinesProvider.setActive(user, serviceLine.id, isActive);
      await refreshCatalog();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update this Template." });
    } finally {
      setPendingCatalog(false);
    }
  }

  async function handleDelete() {
    if (!user || !serviceLine) return;
    setPendingCatalog(true);
    try {
      await serviceLinesProvider.delete(user, serviceLine.id);
      router.push("/dashboard/admin/templates");
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't delete this Template." });
      setPendingCatalog(false);
    }
  }

  const createdByLabel = serviceLine.createdById
    ? (users.find((u) => u.id === serviceLine.createdById)?.fullName ?? "Unknown")
    : "Legacy — not recorded";

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: "Templates", href: "/dashboard/admin/templates" }, { label: serviceLine.name }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">{serviceLine.name}</h1>
          {!serviceLine.isActive && <Badge variant="secondary">Inactive</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={pendingCatalog}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      <Card className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Description</span>
          {serviceLine.description ? (
            <TruncatedText text={serviceLine.description} />
          ) : (
            <span className="text-sm text-muted-foreground">No description yet.</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Active</span>
            <span className="text-xs text-muted-foreground">
              Deactivate to stop this Template appearing as a new Project Template choice, without losing history.
            </span>
          </div>
          <Switch checked={serviceLine.isActive} onCheckedChange={(checked) => void handleSetActive(checked)} disabled={pendingCatalog} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Activities</span>
            <span className="text-xs text-muted-foreground">Default Tasks, active/inactive state, and catalog membership.</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setActivitiesOpen(true)}>
            View Activities
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Team Leads</span>
          <MultiSelect
            options={teamLeadOptions}
            value={row?.teamLeadUserIds ?? []}
            onChange={(ids) => void handleSetTeamLeads(ids)}
            placeholder="No Team Leads"
            searchPlaceholder="Search Team Leads…"
            disabled={pendingStaffing}
            aria-label={`Team Leads for ${serviceLine.name}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Members</span>
          <MultiSelect
            options={memberOptions}
            value={row?.employeeUserIds ?? []}
            onChange={(ids) => void handleSetMembers(ids)}
            placeholder="No Members"
            searchPlaceholder="Search Members…"
            disabled={pendingStaffing}
            aria-label={`Members for ${serviceLine.name}`}
          />
        </div>

        <div className="flex flex-col gap-0.5 text-sm">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Created By</span>
          <span className="text-muted-foreground">{createdByLabel}</span>
        </div>
      </Card>

      <ServiceLineFormDialog open={editOpen} onOpenChange={setEditOpen} serviceLine={serviceLine} onSaved={refreshCatalog} />
      {activitiesOpen && (
        <ManageServiceActivitiesDialog open={activitiesOpen} onOpenChange={setActivitiesOpen} serviceLine={serviceLine} />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${serviceLine.name}"?`}
        description="This only succeeds if the Template has never been used by a Project, Service Recipe, Activity, or staffing assignment — otherwise deactivate it instead."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
