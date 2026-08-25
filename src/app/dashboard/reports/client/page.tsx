"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useClientReports } from "@/lib/data/hooks/use-client-reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateClientReportDialog } from "@/components/client-reports/generate-client-report-dialog";
import { ClientReportsTable } from "@/components/client-reports/client-reports-table";

/**
 * Phase 11D — final Reports simplification, refined further in Phase 12A. `useClientReports()`
 * (`listReports` + the `can_view_client_report` RLS policy) already returns exactly the set the
 * CURRENT viewer is authorized to see — an Employee's own, a Supervisor's team + own, a
 * `reporting_review_access`/Superadmin viewer's org-wide set — so this page renders that authorized
 * result directly. No client-side ownership-tab partitioning and no dedicated Review Queue tab.
 * Client Report Schedules management is likewise gone from this normal page — the scheduling
 * backend (table/RPCs/pg_cron) is completely untouched and still callable; there is simply no
 * visible entry point into it from the everyday product anymore.
 *
 * Phase 12A removed the visible Draft/Finalized status concept entirely, including its filter — the
 * backend lifecycle (`ClientReportStatus`, `finalizeReport`, immutability) is untouched. A reporting
 * reviewer now simply opens a report from Recent Reports; the detail page's own Save/Finalize actions
 * are self-gating (they only appear while the report is still eligible), so no status label or
 * filter is needed to explain why a given report can or can't be edited anymore.
 */
export default function ClientReportsPage() {
  const { user } = useAuth();
  const { reports, isLoading } = useClientReports();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (query && !r.companyLabel.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [reports, search]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Client Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One name-free evidence report per Client and reporting period — auto-drafted from
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
            Pick a client, choose a reporting period, and generate — their tracked work and confirmed
            Daily Updates become the report automatically.
          </p>
          <Button size="lg" onClick={() => setGenerateOpen(true)}>
            <Plus /> Generate Report
          </Button>
        </CardContent>
      </Card>

      <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Recent Reports</h2>
      <ClientReportsTable
        reports={visible}
        isLoading={isLoading}
        emptyMessage="No client reports yet — generate your first one above."
        filters={
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
        }
      />

      <GenerateClientReportDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}
