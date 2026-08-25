"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, PencilLine, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAccomplishmentsReports } from "@/lib/data/hooks/use-accomplishments-reports";
import { isAccomplishmentsReportOwner, isSuperadmin, isSupervisor } from "@/lib/data/permissions";
import type { ReportStatus } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportsTable } from "@/components/reports/reports-table";
import { ReportTypeTabs } from "@/components/reports/report-type-tabs";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

type ReportsTab = "mine" | "others";
type StatusFilter = "all" | ReportStatus;

const STATUS_FILTER_ITEMS: Record<StatusFilter, string> = {
  all: "All statuses",
  draft: "Draft",
  finalized: "Finalized",
};

export default function ReportsPage() {
  const { user } = useAuth();
  const { reports, isLoading } = useAccomplishmentsReports();
  const [tab, setTab] = useState<ReportsTab>("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Employees see only their own reports — no second section at all, matching the permission
  // layer (listReports already excludes anyone else's for an employee).
  const hasOthersTab = !!user && (isSupervisor(user) || isSuperadmin(user));

  const scoped = useMemo(() => {
    if (!user) return [];
    const mine = reports.filter((r) => isAccomplishmentsReportOwner(user, r));
    const others = reports.filter((r) => !isAccomplishmentsReportOwner(user, r));
    return hasOthersTab && tab === "others" ? others : mine;
  }, [user, reports, hasOthersTab, tab]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scoped.filter((r) => {
      if (query && !r.subjectLabel.toLowerCase().includes(query)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [scoped, search, statusFilter]);

  if (!user) return null;

  // Phase 11C — Internal (Accomplishments) Reports are no longer part of the normal Employee/
  // Supervisor workflow; the sidebar "Reports" entry now goes straight to Client Reports. This
  // legacy route/data/RLS is deliberately left fully intact for compatibility and history — only
  // direct navigation here is now Superadmin-only, per the locked Phase 11C decision. Phase 11D
  // additionally retired the ability to generate a NEW report from this page — it is now a
  // Superadmin-only historical archive, viewing/finalizing/exporting existing reports only.
  if (!isSuperadmin(user)) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/reports/client" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to reports
        </Link>
        <p className="text-sm text-muted-foreground">
          Internal Reports have moved — use Client Reports for the normal reporting workflow.
        </p>
      </div>
    );
  }

  const othersLabel = isSuperadmin(user) ? "All Reports" : "Team Reports";
  const draftCount = scoped.filter((r) => r.status === "draft").length;
  const finalizedCount = scoped.filter((r) => r.status === "finalized").length;

  return (
    <div className="flex flex-col gap-6">
      <ReportTypeTabs active="accomplishments" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Legacy Internal Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historical archive only — the fully-attributed internal reporting workflow that Client Reports
            has replaced. No new reports are generated here; existing reports remain viewable, exportable,
            and (while still draft) editable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/reports/trash" />}>
            <Trash2 /> Trash
          </Button>
        </div>
      </div>

      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", STAGGER_ITEM_CLASS)}>
        <StatCard label="Total" value={String(scoped.length)} icon={ClipboardList} style={staggerDelay(0)} />
        <StatCard label="Draft" value={String(draftCount)} icon={PencilLine} style={staggerDelay(1)} />
        <StatCard label="Finalized" value={String(finalizedCount)} icon={CheckCircle2} style={staggerDelay(2)} />
      </div>

      {hasOthersTab && (
        <div className="flex w-fit items-center gap-0.5 rounded-lg border p-0.5">
          <Button size="sm" variant={tab === "mine" ? "secondary" : "ghost"} onClick={() => setTab("mine")}>
            My Reports
          </Button>
          <Button size="sm" variant={tab === "others" ? "secondary" : "ghost"} onClick={() => setTab("others")}>
            {othersLabel}
          </Button>
        </div>
      )}

      <ReportsTable
        reports={visible}
        isLoading={isLoading}
        emptyMessage={
          !hasOthersTab || tab === "mine"
            ? "No reports yet — generate your first one above."
            : `No ${othersLabel.toLowerCase()} yet.`
        }
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
                placeholder="Search subjects…"
                className="pl-8"
                aria-label="Search reports"
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
    </div>
  );
}
