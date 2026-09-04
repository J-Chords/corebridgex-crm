"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useServiceStaffing } from "@/lib/data/hooks/use-service-membership";
import { useServiceLineCatalog } from "@/lib/data/hooks/use-service-lines";
import { useAdminUsers } from "@/lib/data/hooks/use-admin-users";
import { useActivityCatalog } from "@/lib/data/hooks/use-activity-catalog";
import { canManageAdminUsers } from "@/lib/data/permissions";
import { serviceMembershipProvider, serviceLinesProvider } from "@/lib/data/providers";
import type { ServiceLine } from "@/lib/data/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToastManager } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ServiceLineFormDialog } from "@/components/admin/service-line-form-dialog";
import { ManageServiceActivitiesDialog } from "@/components/admin/manage-service-activities-dialog";

type StaffingFilter = "all" | "no-team-lead" | "no-employees" | "fully-unstaffed";

const STAFFING_FILTER_ITEMS: Record<StaffingFilter, string> = {
  all: "All",
  "no-team-lead": "No Team Lead",
  "no-employees": "No Employees",
  "fully-unstaffed": "Fully unstaffed",
};

/**
 * Admin Foundation Part 17 — global Service staffing, viewed and edited from the Service's own
 * angle (the per-user angle lives on the Admin Users page's Edit dialog — same two underlying
 * tables, different granularity). Reuses the existing Service Line catalog; never builds a new
 * one. Team Lead options are filtered to active Team-Lead-eligible users only; Employee options to
 * active Employee-or-Team-Lead users, never Admin — mirrors the DB's own eligibility triggers.
 */
export default function AdminServicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { staffing, isLoading, refresh } = useServiceStaffing();
  const { users } = useAdminUsers();
  const { serviceLines, refresh: refreshCatalog } = useServiceLineCatalog();
  // Unscoped fetch (no brand/service filter) — the full cross-brand Department tree, used only to
  // derive a per-Service Activity count for this table; the "Manage Activities" dialog itself scopes
  // its own fetch to one Service Line.
  const { departments: allDepartments, refresh: refreshAllDepartments } = useActivityCatalog();
  const toastManager = useToastManager();
  const [search, setSearch] = useState("");
  const [teamLeadFilter, setTeamLeadFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [staffingFilter, setStaffingFilter] = useState<StaffingFilter>("all");
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [pendingCatalogId, setPendingCatalogId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingServiceLine, setEditingServiceLine] = useState<ServiceLine | null>(null);
  const [managingActivitiesFor, setManagingActivitiesFor] = useState<ServiceLine | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ServiceLine | null>(null);

  const activityCountByServiceLine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const dept of allDepartments) {
      if (!dept.serviceLineId) continue;
      counts.set(dept.serviceLineId, (counts.get(dept.serviceLineId) ?? 0) + dept.activities.length);
    }
    return counts;
  }, [allDepartments]);

  useEffect(() => {
    if (user && !canManageAdminUsers(user)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const teamLeadOptions = useMemo(
    () =>
      users
        .filter((u) => u.role === "supervisor" && u.active)
        .map((u) => ({ id: u.id, label: u.fullName, sublabel: u.email })),
    [users]
  );
  const employeeOptions = useMemo(
    () =>
      users
        .filter((u) => (u.role === "employee" || u.role === "supervisor") && u.active)
        .map((u) => ({ id: u.id, label: u.fullName, sublabel: u.email })),
    [users]
  );

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return serviceLines.filter((sl) => {
      if (query && !sl.name.toLowerCase().includes(query)) return false;
      const row = staffing.find((s) => s.serviceLineId === sl.id);
      const leads = row?.teamLeadUserIds ?? [];
      const members = row?.employeeUserIds ?? [];
      if (teamLeadFilter !== "all" && !leads.includes(teamLeadFilter)) return false;
      if (employeeFilter !== "all" && !members.includes(employeeFilter)) return false;
      if (staffingFilter === "no-team-lead" && leads.length > 0) return false;
      if (staffingFilter === "no-employees" && members.length > 0) return false;
      if (staffingFilter === "fully-unstaffed" && (leads.length > 0 || members.length > 0)) return false;
      return true;
    });
  }, [serviceLines, search, staffing, teamLeadFilter, employeeFilter, staffingFilter]);

  if (!user || !canManageAdminUsers(user)) return null;

  async function handleSetTeamLeads(serviceLineId: string, userIds: string[]) {
    if (!user) return;
    setPendingServiceId(serviceLineId);
    try {
      await serviceMembershipProvider.setTeamLeads(user, serviceLineId, userIds);
      await refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update Team Leads." });
    } finally {
      setPendingServiceId(null);
    }
  }

  async function handleSetEmployees(serviceLineId: string, userIds: string[]) {
    if (!user) return;
    setPendingServiceId(serviceLineId);
    try {
      await serviceMembershipProvider.setEmployees(user, serviceLineId, userIds);
      await refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update Employees." });
    } finally {
      setPendingServiceId(null);
    }
  }

  async function handleSetActive(serviceLine: ServiceLine, isActive: boolean) {
    if (!user) return;
    setPendingCatalogId(serviceLine.id);
    try {
      await serviceLinesProvider.setActive(user, serviceLine.id, isActive);
      await refreshCatalog();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update this Service." });
    } finally {
      setPendingCatalogId(null);
    }
  }

  async function handleDelete(serviceLine: ServiceLine) {
    if (!user) return;
    setPendingCatalogId(serviceLine.id);
    try {
      await serviceLinesProvider.delete(user, serviceLine.id);
      await refreshCatalog();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't delete this Service." });
    } finally {
      setPendingCatalogId(null);
    }
  }

  function createdByLabel(serviceLine: ServiceLine): string {
    if (!serviceLine.createdById) return "Legacy — not recorded";
    return users.find((u) => u.id === serviceLine.createdById)?.fullName ?? "Unknown";
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Services</h1>
          <p className="text-sm text-muted-foreground">
            The global Service catalog — name, description, active status, Activities, and org-wide Team Lead/Employee
            staffing. Deactivate a Service to stop it appearing as a new Project Service choice without losing history.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus /> New Service
        </Button>
      </div>

      <Card className="min-w-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 p-4">
          <div className="relative flex-1 min-w-48">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Services…"
              className="pl-8"
              aria-label="Search Services"
            />
          </div>
          <Select
            items={{ all: "All Team Leads", ...Object.fromEntries(teamLeadOptions.map((o) => [o.id, o.label])) }}
            value={teamLeadFilter}
            onValueChange={(v) => setTeamLeadFilter(v ?? "all")}
          >
            <SelectTrigger aria-label="Filter by Team Lead" className="w-52">
              <SelectValue placeholder="Team Lead" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team Leads</SelectItem>
              {teamLeadOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={{ all: "All Employees", ...Object.fromEntries(employeeOptions.map((o) => [o.id, o.label])) }}
            value={employeeFilter}
            onValueChange={(v) => setEmployeeFilter(v ?? "all")}
          >
            <SelectTrigger aria-label="Filter by Employee/member" className="w-52">
              <SelectValue placeholder="Employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employeeOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={STAFFING_FILTER_ITEMS}
            value={staffingFilter}
            onValueChange={(v) => setStaffingFilter((v ?? "all") as StaffingFilter)}
          >
            <SelectTrigger aria-label="Filter by staffing" className="w-44">
              <SelectValue placeholder="Staffing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="no-team-lead">No Team Lead</SelectItem>
              <SelectItem value="no-employees">No Employees</SelectItem>
              <SelectItem value="fully-unstaffed">Fully unstaffed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Service</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Active</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Activities</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Created By</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Team Leads</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Employees</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filteredLines.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No Services match your filters.
                </TableCell>
              </TableRow>
            )}
            {filteredLines.map((line) => {
              const row = staffing.find((s) => s.serviceLineId === line.id);
              const activityCount = activityCountByServiceLine.get(line.id) ?? 0;
              const catalogBusy = pendingCatalogId === line.id;
              return (
                <TableRow key={line.id}>
                  <TableCell className="w-56 align-top pt-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{line.name}</span>
                        {!line.isActive && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      {line.description && <p className="text-xs text-muted-foreground">{line.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="align-top pt-4">
                    <Switch
                      checked={line.isActive}
                      onCheckedChange={(checked) => void handleSetActive(line, checked)}
                      disabled={catalogBusy}
                      aria-label={`${line.isActive ? "Deactivate" : "Activate"} ${line.name}`}
                    />
                  </TableCell>
                  <TableCell className="align-top pt-4">
                    <Button type="button" variant="outline" size="sm" onClick={() => setManagingActivitiesFor(line)}>
                      {activityCount} configured
                    </Button>
                  </TableCell>
                  <TableCell className="w-40 align-top pt-4 text-sm text-muted-foreground">{createdByLabel(line)}</TableCell>
                  <TableCell className="w-72 align-top">
                    <MultiSelect
                      options={teamLeadOptions}
                      value={row?.teamLeadUserIds ?? []}
                      onChange={(ids) => void handleSetTeamLeads(line.id, ids)}
                      placeholder="No Team Leads"
                      searchPlaceholder="Search Team Leads…"
                      disabled={pendingServiceId === line.id}
                      aria-label={`Team Leads for ${line.name}`}
                    />
                  </TableCell>
                  <TableCell className="w-72 align-top">
                    <MultiSelect
                      options={employeeOptions}
                      value={row?.employeeUserIds ?? []}
                      onChange={(ids) => void handleSetEmployees(line.id, ids)}
                      placeholder="No Employees"
                      searchPlaceholder="Search Employees…"
                      disabled={pendingServiceId === line.id}
                      aria-label={`Employees for ${line.name}`}
                    />
                  </TableCell>
                  <TableCell className="align-top pt-3">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${line.name}`}
                        onClick={() => setEditingServiceLine(line)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${line.name}`}
                        disabled={catalogBusy}
                        onClick={() => setDeleteCandidate(line)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <ServiceLineFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={refreshCatalog}
        onCreatedAndConfigure={(created) => {
          refreshCatalog();
          setManagingActivitiesFor(created);
        }}
      />
      {editingServiceLine && (
        <ServiceLineFormDialog
          open={Boolean(editingServiceLine)}
          onOpenChange={(open) => !open && setEditingServiceLine(null)}
          serviceLine={editingServiceLine}
          onSaved={refreshCatalog}
        />
      )}
      {managingActivitiesFor && (
        <ManageServiceActivitiesDialog
          open={Boolean(managingActivitiesFor)}
          onOpenChange={(open) => {
            if (!open) {
              setManagingActivitiesFor(null);
              // The dialog's own catalog fetch is scoped to one Service Line — this page's
              // separate unscoped fetch (used only for the "N configured" counts) doesn't see
              // that change on its own, so refresh it here rather than showing a stale count.
              void refreshAllDepartments();
            }
          }}
          serviceLine={managingActivitiesFor}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
        title={`Delete "${deleteCandidate?.name ?? ""}"?`}
        description="This only succeeds if the Service has never been used by a Project, Template, Activity, or staffing assignment — otherwise deactivate it instead."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => deleteCandidate && void handleDelete(deleteCandidate)}
      />
    </div>
  );
}
