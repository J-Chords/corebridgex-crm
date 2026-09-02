"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAdminUsers } from "@/lib/data/hooks/use-admin-users";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { canManageAdminUsers } from "@/lib/data/permissions";
import { adminUsersProvider } from "@/lib/data/providers";
import type { AdminUserRow } from "@/lib/data/providers/admin-users-provider";
import type { Role } from "@/lib/data/types";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { useToastManager } from "@/components/ui/toast";

type RoleFilter = "all" | Role;
type ActiveFilter = "all" | "active" | "inactive";

function serviceNamesFor(ids: string[], serviceLines: { id: string; name: string }[]): string {
  return ids.map((id) => serviceLines.find((sl) => sl.id === id)?.name ?? id).join(", ");
}

/** Acceptance A4 — leadership and membership are never merged into one flat list; a Team Lead
 * who also works in a different Service (or the same one) shows both lines distinctly. */
function ServiceStaffingCell({
  row,
  serviceLines,
}: {
  row: AdminUserRow;
  serviceLines: { id: string; name: string }[];
}) {
  if (row.role === "superadmin") {
    return <span className="text-muted-foreground">—</span>;
  }
  const led = row.serviceLeadershipIds;
  const worksIn = row.serviceMembershipIds;
  if (led.length === 0 && worksIn.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {led.length > 0 && (
        <span title={serviceNamesFor(led, serviceLines)}>
          <span className="font-medium text-foreground">Led: </span>
          <span className="text-muted-foreground">{serviceNamesFor(led, serviceLines)}</span>
        </span>
      )}
      {worksIn.length > 0 && (
        <span title={serviceNamesFor(worksIn, serviceLines)}>
          <span className="font-medium text-foreground">Works in: </span>
          <span className="text-muted-foreground">{serviceNamesFor(worksIn, serviceLines)}</span>
        </span>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AdminUsersPageContent />
    </Suspense>
  );
}

function AdminUsersPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const { users, isLoading, refresh } = useAdminUsers();
  const { serviceLines } = useCompanyLookups();
  const toastManager = useToastManager();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // Admin-only route — a real redirect, not just a hidden sidebar link, matching the Companies
  // page's own established rule that direct URL access must never reach admin data.
  useEffect(() => {
    if (user && !canManageAdminUsers(user)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((u) => {
      if (query && !u.fullName.toLowerCase().includes(query) && !u.email.toLowerCase().includes(query)) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (serviceFilter !== "all") {
        const has = u.serviceLeadershipIds.includes(serviceFilter) || u.serviceMembershipIds.includes(serviceFilter);
        if (!has) return false;
      }
      if (activeFilter === "active" && !u.active) return false;
      if (activeFilter === "inactive" && u.active) return false;
      return true;
    });
  }, [users, search, roleFilter, serviceFilter, activeFilter]);

  if (!user || !canManageAdminUsers(user)) return null;

  async function handleToggleActive(target: AdminUserRow) {
    if (!user) return;
    setPendingUserId(target.id);
    try {
      await adminUsersProvider.setActive(user, target.id, !target.active);
      await refresh();
      toastManager.add({ description: target.active ? `${target.fullName} deactivated` : `${target.fullName} reactivated` });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update this user." });
    } finally {
      setPendingUserId(null);
    }
  }


  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Create and manage every account in the org.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New user
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
              placeholder="Search name or email…"
              className="pl-8"
              aria-label="Search users"
            />
          </div>
          <Select
            items={{ all: "All roles", employee: ROLE_LABELS.employee, supervisor: ROLE_LABELS.supervisor, superadmin: ROLE_LABELS.superadmin }}
            value={roleFilter}
            onValueChange={(v) => setRoleFilter((v ?? "all") as RoleFilter)}
          >
            <SelectTrigger aria-label="Filter by role">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="employee">{ROLE_LABELS.employee}</SelectItem>
              <SelectItem value="supervisor">{ROLE_LABELS.supervisor}</SelectItem>
              <SelectItem value="superadmin">{ROLE_LABELS.superadmin}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            items={{ all: "All Services", ...Object.fromEntries(serviceLines.map((sl) => [sl.id, sl.name])) }}
            value={serviceFilter}
            onValueChange={(v) => setServiceFilter(v ?? "all")}
          >
            <SelectTrigger aria-label="Filter by Service">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {serviceLines.map((sl) => (
                <SelectItem key={sl.id} value={sl.id}>
                  {sl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={{ all: "All statuses", active: "Active", inactive: "Inactive" }}
            value={activeFilter}
            onValueChange={(v) => setActiveFilter((v ?? "all") as ActiveFilter)}
          >
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Name</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Email</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Role</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Services</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Status</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No users match your filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.fullName}
                  {row.mustChangePassword && (
                    <Badge variant="neutral" className="ml-2">
                      Pending first login
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{ROLE_LABELS[row.role]}</Badge>
                </TableCell>
                <TableCell>
                  <ServiceStaffingCell row={row} serviceLines={serviceLines} />
                </TableCell>
                <TableCell>
                  <Badge variant={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.fullName}`} />}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditTarget(row)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={pendingUserId === row.id}
                        onClick={() => void handleToggleActive(row)}
                      >
                        {row.active ? "Deactivate" : "Reactivate"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <UserFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        serviceLines={serviceLines}
        onSaved={refresh}
      />
      {editTarget && (
        <UserFormDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          mode="edit"
          targetUser={editTarget}
          serviceLines={serviceLines}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
