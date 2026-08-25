"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useClientReports } from "@/lib/data/hooks/use-client-reports";
import { useProjects } from "@/lib/data/hooks/use-projects";
import type { ClientReportStatus } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GenerateClientReportDialog } from "@/components/client-reports/generate-client-report-dialog";
import { ClientReportsTable } from "@/components/client-reports/client-reports-table";

type StatusFilter = "all" | ClientReportStatus;

const STATUS_FILTER_ITEMS: Record<StatusFilter, string> = {
  all: "All statuses",
  draft: "Draft",
  finalized: "Finalized",
};

/**
 * Phase 11D — final Reports simplification. `useClientReports()` (`listReports` + the
 * `can_view_client_report` RLS policy) already returns exactly the set the CURRENT viewer is
 * authorized to see — an Employee's own, a Supervisor's team + own, a `reporting_review_access`/
 * Superadmin viewer's org-wide set — so this page renders that authorized result directly. No
 * client-side ownership-tab partitioning ("My Reports"/"Team's Client Reports"/"All Client Reports")
 * and no dedicated Review Queue tab — those labels reinforced Employee ownership of something that
 * actually belongs to the Client/Project. A reporting reviewer now locates Drafts the same way
 * everyone filters: Recent Reports → Status: Draft → open → review/finalize on the report detail
 * page itself. Client Report Schedules management is likewise gone from this normal page — the
 * scheduling backend (table/RPCs/pg_cron) is completely untouched and still callable; there is
 * simply no visible entry point into it from the everyday product anymore.
 */
export default function ClientReportsPage() {
  const { user } = useAuth();
  const { reports, isLoading } = useClientReports();
  const { projects } = useProjects();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (query && !r.companyLabel.toLowerCase().includes(query)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [reports, search, statusFilter]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Client Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One name-free evidence report per Client, Project, and reporting period — auto-drafted from
            confirmed Daily Updates and tracked work.
          </p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/reports/client/trash" />}>
          <Trash2 /> Trash
        </Button>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Generate a report</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-sm text-muted-foreground">
            Pick a client and project, choose a reporting period, and generate — the Project&apos;s own
            tracked work and confirmed Daily Updates become the report automatically.
          </p>
          <Button size="lg" onClick={() => setGenerateOpen(true)}>
            <Plus /> Generate Report
          </Button>
        </CardContent>
      </Card>

      <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Recent Reports</h2>
      <ClientReportsTable
        reports={visible}
        projectNameById={projectNameById}
        isLoading={isLoading}
        emptyMessage="No client reports yet — generate your first one above."
        filters={
          <>
            <div className="relative min-w-48 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="pl-8"
                aria-label="Search client reports"
              />
            </div>
            <Select
              items={STATUS_FILTER_ITEMS}
              value={statusFilter}
              onValueChange={(v) => setStatusFilter((v ?? "all") as StatusFilter)}
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <GenerateClientReportDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}
