"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAccomplishmentsReports } from "@/lib/data/hooks/use-accomplishments-reports";
import { isAccomplishmentsReportOwner, isSuperadmin, isSupervisor } from "@/lib/data/permissions";
import type { ReportStatus } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GenerateReportDialog } from "@/components/reports/generate-report-dialog";
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
  const [generateOpen, setGenerateOpen] = useState(false);
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

  const othersLabel = isSuperadmin(user) ? "All Reports" : "Team Reports";
  const draftCount = scoped.filter((r) => r.status === "draft").length;
  const finalizedCount = scoped.filter((r) => r.status === "finalized").length;

  return (
    <div className="flex flex-col gap-6">
      <ReportTypeTabs active="accomplishments" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Internal Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fully-attributed, internal-only — auto-drafted from tracked work, generate one, refine it, then
            finalize. For the client-facing document, use Client Reports instead.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/reports/trash" />}>
            <Trash2 /> Trash
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus /> Generate report
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

      <GenerateReportDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}
