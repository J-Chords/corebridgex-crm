"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useServiceStaffing } from "@/lib/data/hooks/use-service-membership";
import { useAdminUsers } from "@/lib/data/hooks/use-admin-users";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { canManageAdminUsers } from "@/lib/data/permissions";
import { serviceMembershipProvider } from "@/lib/data/providers";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const { serviceLines } = useCompanyLookups();
  const toastManager = useToastManager();
  const [search, setSearch] = useState("");
  const [teamLeadFilter, setTeamLeadFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [staffingFilter, setStaffingFilter] = useState<StaffingFilter>("all");
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-semibold">Service staffing</h1>
        <p className="text-sm text-muted-foreground">
          These Team Lead and Employee assignments apply across all Projects that use each Service.
        </p>
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
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Team Leads</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Employees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filteredLines.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  No Services match your filters.
                </TableCell>
              </TableRow>
            )}
            {filteredLines.map((line) => {
              const row = staffing.find((s) => s.serviceLineId === line.id);
              return (
                <TableRow key={line.id}>
                  <TableCell className="w-48 font-medium align-top pt-4">{line.name}</TableCell>
                  <TableCell className="w-80 align-top">
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
                  <TableCell className="w-80 align-top">
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
