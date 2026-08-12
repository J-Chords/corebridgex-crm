"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useClientReports } from "@/lib/data/hooks/use-client-reports";
import { canManageClientReports, isClientReportOwner, isSuperadmin } from "@/lib/data/permissions";
import type { ClientReportStatus } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GenerateClientReportDialog } from "@/components/client-reports/generate-client-report-dialog";
import { ClientReportsTable } from "@/components/client-reports/client-reports-table";
import { ReportTypeTabs } from "@/components/reports/report-type-tabs";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

type ClientReportsTab = "mine" | "others";
type StatusFilter = "all" | ClientReportStatus;

const STATUS_FILTER_ITEMS: Record<StatusFilter, string> = {
  all: "All statuses",
  draft: "Draft",
  finalized: "Finalized",
};

export default function ClientReportsPage() {
  const { user } = useAuth();
  const { reports, isLoading } = useClientReports();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [tab, setTab] = useState<ClientReportsTab>("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const scoped = useMemo(() => {
    if (!user) return [];
    const mine = reports.filter((r) => isClientReportOwner(user, r));
    const others = reports.filter((r) => !isClientReportOwner(user, r));
    return tab === "others" ? others : mine;
  }, [user, reports, tab]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scoped.filter((r) => {
      if (query && !r.companyLabel.toLowerCase().includes(query)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [scoped, search, statusFilter]);

  if (!user) return null;

  if (!canManageClientReports(user)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Client Reports</h1>
        <p className="text-sm text-muted-foreground">
          Client Reports is for supervisors and superadmins. Ask your supervisor if you need one generated.
        </p>
      </div>
    );
  }

  const othersLabel = isSuperadmin(user) ? "All Client Reports" : "Team's Client Reports";
  const draftCount = scoped.filter((r) => r.status === "draft").length;
  const finalizedCount = scoped.filter((r) => r.status === "finalized").length;

  return (
    <div className="flex flex-col gap-6">
      <ReportTypeTabs active="client" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Client Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Client-facing, name-free accomplishments — auto-drafted from confirmed Daily Updates, generate then
            refine before sending.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/reports/client/trash" />}>
            <Trash2 /> Trash
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus /> Generate client report
          </Button>
        </div>
      </div>

      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", STAGGER_ITEM_CLASS)}>
        <StatCard label="Total" value={String(scoped.length)} icon={ClipboardList} style={staggerDelay(0)} />
        <StatCard label="Draft" value={String(draftCount)} icon={PencilLine} style={staggerDelay(1)} />
        <StatCard label="Finalized" value={String(finalizedCount)} icon={CheckCircle2} style={staggerDelay(2)} />
      </div>

      <div className="flex w-fit items-center gap-0.5 rounded-lg border p-0.5">
        <Button size="sm" variant={tab === "mine" ? "secondary" : "ghost"} onClick={() => setTab("mine")}>
          My Reports
        </Button>
        <Button size="sm" variant={tab === "others" ? "secondary" : "ghost"} onClick={() => setTab("others")}>
          {othersLabel}
        </Button>
      </div>

      <ClientReportsTable
        reports={visible}
        isLoading={isLoading}
        emptyMessage={tab === "mine" ? "No client reports yet — generate your first one above." : `No ${othersLabel.toLowerCase()} yet.`}
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
