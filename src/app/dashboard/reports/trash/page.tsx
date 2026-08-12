"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTrashedAccomplishmentsReports } from "@/lib/data/hooks/use-accomplishments-reports";
import { accomplishmentsReportProvider } from "@/lib/data/providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportStatusBadge } from "@/components/reports/report-status-badge";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";

const PURGE_AFTER_DAYS = 30;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

function purgeDate(deletedAt: string) {
  const d = new Date(deletedAt);
  d.setDate(d.getDate() + PURGE_AFTER_DAYS);
  return d.toISOString();
}

export default function TrashPage() {
  const { user } = useAuth();
  const { reports, isLoading, refresh } = useTrashedAccomplishmentsReports();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const sorted = [...reports].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));

  async function handleRestore(id: string) {
    if (!user) return;
    setPendingId(id);
    try {
      await accomplishmentsReportProvider.restoreReport(user, id);
      refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!user) return;
    setPendingId(id);
    try {
      await accomplishmentsReportProvider.permanentlyDeleteReport(user, id);
      refresh();
    } finally {
      setPendingId(null);
      setConfirmingDeleteId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/reports" className="w-fit text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to reports
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-semibold">Trash</h1>
          <p className="text-sm text-muted-foreground">
            Deleted reports stay here for {PURGE_AFTER_DAYS} days before they&apos;re permanently removed. Restore
            a report to bring it back to the main list.
          </p>
        </div>
      </div>

      <Card className="min-w-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Subject</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Kind</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Range</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Status</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Auto-deletes</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Trash is empty.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((report, i) => (
              <TableRow key={report.id} className={STAGGER_ITEM_CLASS} style={staggerDelay(i)}>
                <TableCell className="font-medium">{report.subjectLabel}</TableCell>
                <TableCell>
                  <Badge variant="neutral" className="capitalize">
                    {report.kind}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatRange(report.rangeStart, report.rangeEnd)}</TableCell>
                <TableCell>
                  <ReportStatusBadge status={report.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {report.deletedAt ? formatDate(purgeDate(report.deletedAt)) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {confirmingDeleteId === report.id ? (
                      <>
                        <span className="text-xs text-muted-foreground">Delete forever?</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmingDeleteId(null)}
                          disabled={pendingId === report.id}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handlePermanentDelete(report.id)}
                          disabled={pendingId === report.id}
                        >
                          {pendingId === report.id ? "Deleting…" : "Delete forever"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestore(report.id)}
                          disabled={pendingId === report.id}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmingDeleteId(report.id)}
                          disabled={pendingId === report.id}
                        >
                          <Trash2 /> Delete forever
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
