"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { canManageCompanies } from "@/lib/data/permissions";
import type { CompanyStatus } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CompanyStatusBadge, COMPANY_STATUS_SELECT_ITEMS } from "@/components/companies/company-status-badge";
import { ClientHealthBadge } from "@/components/companies/client-health-badge";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * "attention" is a deliberate meta-value (not a literal `ClientHealth.status`) — it matches the
 * Supervisor dashboard's "Clients needing attention" KPI exactly (`status !== "on-track"`), same as
 * "at-risk" matches Superadmin's "At-risk clients" KPI (`status === "at-risk"`). Page-local only, not
 * part of any shared filter schema.
 */
type HealthFilter = "all" | "on-track" | "attention" | "at-risk";

const HEALTH_FILTER_ITEMS: Record<HealthFilter, string> = {
  all: "All health",
  "on-track": "On Track",
  attention: "Needs Attention",
  "at-risk": "At Risk",
};

function isHealthFilter(value: string | null): value is HealthFilter {
  return value === "on-track" || value === "attention" || value === "at-risk";
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <CompaniesPageContent />
    </Suspense>
  );
}

function CompaniesPageContent() {
  const { user } = useAuth();
  const { companies, isLoading, refresh } = useCompanies();
  const { brands } = useCompanyLookups();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompanyStatus | "all">("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(() => {
    const health = searchParams.get("health");
    return isHealthFilter(health) ? health : "all";
  });
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return companies.filter((company) => {
      if (query && !company.name.toLowerCase().includes(query)) return false;
      if (statusFilter !== "all" && company.status !== statusFilter) return false;
      if (brandFilter !== "all" && company.brandId !== brandFilter) return false;
      if (healthFilter === "on-track" && company.health.status !== "on-track") return false;
      if (healthFilter === "attention" && company.health.status === "on-track") return false;
      if (healthFilter === "at-risk" && company.health.status !== "at-risk") return false;
      return true;
    });
  }, [companies, search, statusFilter, brandFilter, healthFilter]);

  if (!user) return null;
  const canManage = canManageCompanies(user);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Companies</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "employee"
              ? "Clients you're assigned to."
              : user.role === "supervisor"
                ? "Clients assigned to you and your team."
                : "Every client across the org."}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New Company
          </Button>
        )}
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
              placeholder="Search companies…"
              className="pl-8"
              aria-label="Search companies"
              data-shortcut="search"
            />
          </div>
          <Select
            items={{ all: "All statuses", ...COMPANY_STATUS_SELECT_ITEMS }}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter((v ?? "all") as CompanyStatus | "all")}
          >
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="dormant">Dormant</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>
          <Select
            items={{ all: "All brands", ...Object.fromEntries(brands.map((b) => [b.id, b.name])) }}
            value={brandFilter}
            onValueChange={(v) => setBrandFilter(v ?? "all")}
          >
            <SelectTrigger aria-label="Filter by partner brand">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={HEALTH_FILTER_ITEMS}
            value={healthFilter}
            onValueChange={(v) => setHealthFilter((v ?? "all") as HealthFilter)}
          >
            <SelectTrigger aria-label="Filter by client health">
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All health</SelectItem>
              <SelectItem value="on-track">On Track</SelectItem>
              <SelectItem value="attention">Needs Attention</SelectItem>
              <SelectItem value="at-risk">At Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Company
              </TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Status
              </TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Health
              </TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Brand
              </TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Primary contact
              </TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Renewal
              </TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                Staff
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No companies match your filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((company, i) => (
              <TableRow
                key={company.id}
                className={cn("cursor-pointer", STAGGER_ITEM_CLASS)}
                style={staggerDelay(i)}
                onClick={() => router.push(`/dashboard/companies/${company.id}`)}
              >
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/companies/${company.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <CompanyStatusBadge status={company.status} />
                </TableCell>
                <TableCell>
                  <ClientHealthBadge health={company.health} />
                </TableCell>
                <TableCell className="text-muted-foreground">{company.brand.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {company.primaryContact?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(company.renewalDate)}
                </TableCell>
                <TableCell>
                  <div className="flex -space-x-2">
                    {company.assignedStaff.length === 0 && (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {company.assignedStaff.slice(0, 4).map((staff) => (
                      <Avatar key={staff.id} className="size-6 border-2 border-card">
                        <AvatarFallback className="text-[10px]">
                          {initials(staff.fullName)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CompanyFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSaved={refresh}
      />
    </div>
  );
}
