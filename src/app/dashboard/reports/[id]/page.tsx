"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAccomplishmentsReport } from "@/lib/data/hooks/use-accomplishments-reports";
import { useUnsavedChangesGuard } from "@/lib/data/hooks/use-unsaved-changes-guard";
import { accomplishmentsReportProvider } from "@/lib/data/providers";
import { canReopenAccomplishmentsReport, isAccomplishmentsReportOwner, isEmployee, isSuperadmin } from "@/lib/data/permissions";
import { visibleBrandSections } from "@/lib/data/accomplishments-report-totals";
import type { AccomplishmentsReportActivityLine, AccomplishmentsReportBrandSection } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToastManager } from "@/components/ui/toast";
import { ReportStatusBadge } from "@/components/reports/report-status-badge";
import { ReportKpiBand } from "@/components/reports/report-kpi-band";
import { ReportRail } from "@/components/reports/report-rail";
import { ReportView } from "@/components/reports/report-view";
import { AddServiceDialog } from "@/components/reports/add-service-dialog";
import { ReportComments } from "@/components/reports/report-comments";
import { ReportHistory } from "@/components/reports/report-history";
import { downloadReportCsv } from "@/components/reports/report-export";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { report, isLoading, notFound, refresh } = useAccomplishmentsReport(id);
  const toastManager = useToastManager();
  const router = useRouter();

  const [draft, setDraft] = useState<AccomplishmentsReportBrandSection[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const [confirmingReopen, setConfirmingReopen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [addServiceBrandIndex, setAddServiceBrandIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { blockedHref, proceed, cancel } = useUnsavedChangesGuard(isDirty);

  useEffect(() => {
    if (!report) return;
    // Reset the local editable copy whenever the underlying report changes (load, or after save/finalize).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(report.status === "draft" ? report.brandSections : null);
    setIsDirty(false);
    setConfirmingFinalize(false);
    setConfirmingTrash(false);
    setConfirmingReopen(false);
  }, [report]);

  if (!user) return null;

  // Phase 11C — Internal (Accomplishments) Report detail is legacy/history-only now; direct
  // navigation here is Superadmin-only (data/RLS untouched — this is a UI-exposure gate only).
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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !report) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/reports" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to reports
        </Link>
        <p className="text-sm text-muted-foreground">
          This report doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const isOwner = isAccomplishmentsReportOwner(user, report);
  const isTrashed = report.deletedAt !== null;
  const canEditEntries = isOwner && report.status === "draft" && !isTrashed;
  // Employees never get reviewer-comment ability — and, per canViewAccomplishmentsReport, an employee
  // can never even load a report they don't own, so this only ever applies to supervisor/superadmin.
  const canComment = !isOwner && !isEmployee(user);
  const canReopen = canReopenAccomplishmentsReport(user, report) && !isTrashed;
  const sections = canEditEntries && draft ? draft : report.brandSections;
  const visibleSections = visibleBrandSections(sections, canEditEntries);

  function updateLine(
    brandIndex: number,
    departmentIndex: number | null,
    activityIndex: number,
    patch: (line: AccomplishmentsReportActivityLine) => AccomplishmentsReportActivityLine
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      return prev.map((section, bIdx) => {
        if (bIdx !== brandIndex) return section;
        if (departmentIndex === null) {
          return { ...section, other: patch(section.other) };
        }
        return {
          ...section,
          departments: section.departments.map((dept, dIdx) =>
            dIdx !== departmentIndex
              ? dept
              : { ...dept, activities: dept.activities.map((line, aIdx) => (aIdx === activityIndex ? patch(line) : line)) }
          ),
        };
      });
    });
    setIsDirty(true);
  }

  function handleToggleLine(brandIndex: number, departmentIndex: number | null, activityIndex: number) {
    updateLine(brandIndex, departmentIndex, activityIndex, (line) => ({ ...line, done: !line.done }));
  }

  function handleDetailChange(brandIndex: number, departmentIndex: number | null, activityIndex: number, value: string) {
    updateLine(brandIndex, departmentIndex, activityIndex, (line) => ({ ...line, detail: value }));
  }

  function handleOpenAddService(brandIndex: number) {
    setAddServiceBrandIndex(brandIndex);
    setAddServiceOpen(true);
  }

  function handleAddActivity(departmentId: string, departmentName: string, activityId: string, activityName: string) {
    if (addServiceBrandIndex === null) return;
    const brandIndex = addServiceBrandIndex;
    setDraft((prev) => {
      const base = prev ?? sections;
      const newLine: AccomplishmentsReportActivityLine = {
        activityId,
        activityName,
        done: false,
        detail: "",
        sourceTaskIds: [],
        companyLabel: "",
      };
      return base.map((section, bIdx) => {
        if (bIdx !== brandIndex) return section;
        const existingDeptIndex = section.departments.findIndex((d) => d.departmentId === departmentId);
        if (existingDeptIndex === -1) {
          return { ...section, departments: [...section.departments, { departmentId, departmentName, activities: [newLine] }] };
        }
        return {
          ...section,
          departments: section.departments.map((dept, dIdx) =>
            dIdx !== existingDeptIndex ? dept : { ...dept, activities: [...dept.activities, newLine] }
          ),
        };
      });
    });
    setIsDirty(true);
  }

  function handleAddOther() {
    if (addServiceBrandIndex === null) return;
    const brandIndex = addServiceBrandIndex;
    setDraft((prev) => {
      const base = prev ?? sections;
      return base.map((section, bIdx) => (bIdx !== brandIndex ? section : { ...section, otherIncluded: true }));
    });
    setIsDirty(true);
  }

  function handleRemoveActivity(brandIndex: number, departmentIndex: number, activityIndex: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return prev.map((section, bIdx) =>
        bIdx !== brandIndex
          ? section
          : {
              ...section,
              departments: section.departments
                .map((dept, dIdx) =>
                  dIdx !== departmentIndex ? dept : { ...dept, activities: dept.activities.filter((_, aIdx) => aIdx !== activityIndex) }
                )
                .filter((dept) => dept.activities.length > 0),
            }
      );
    });
    setIsDirty(true);
  }

  function handleRemoveOther(brandIndex: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return prev.map((section, bIdx) => (bIdx !== brandIndex ? section : { ...section, otherIncluded: false }));
    });
    setIsDirty(true);
  }

  async function handleSave() {
    if (!user || !draft) return;
    setError(null);
    setIsSaving(true);
    try {
      await accomplishmentsReportProvider.updateDraft(user, id, draft);
      setIsDirty(false);
      toastManager.add({ description: "Changes saved" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinalize() {
    if (!user || !draft) return;
    setError(null);
    setIsFinalizing(true);
    try {
      await accomplishmentsReportProvider.updateDraft(user, id, draft);
      await accomplishmentsReportProvider.finalizeReport(user, id);
      setIsDirty(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to finalize report.");
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handleTrash() {
    if (!user) return;
    setError(null);
    setIsTrashing(true);
    try {
      await accomplishmentsReportProvider.trashReport(user, id);
      toastManager.add({ description: "Moved to Trash — auto-deletes after 30 days" });
      router.push("/dashboard/reports");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete report.");
      setIsTrashing(false);
    }
  }

  async function handleRestore() {
    if (!user) return;
    setError(null);
    setIsRestoring(true);
    try {
      await accomplishmentsReportProvider.restoreReport(user, id);
      toastManager.add({ description: "Report restored" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to restore report.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleReopen() {
    if (!user) return;
    setError(null);
    setIsReopening(true);
    try {
      await accomplishmentsReportProvider.reopenReport(user, id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reopen report.");
    } finally {
      setIsReopening(false);
      setConfirmingReopen(false);
    }
  }

  async function handleAddComment(body: string) {
    if (!user) return;
    await accomplishmentsReportProvider.addComment(user, id, body);
    refresh();
  }

  async function handleSaveAndLeave() {
    await handleSave();
    proceed();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 print:hidden">
        <Link href="/dashboard/reports" className="w-fit text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to reports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold">{report.subjectLabel}</h1>
              <ReportStatusBadge status={report.status} />
              {isTrashed && <span className="text-xs text-destructive">In Trash</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              {report.kind === "person" ? "Person" : "Client"} report · {formatRange(report.rangeStart, report.rangeEnd)}
              {report.status === "finalized" && report.finalizedAt
                ? ` · Finalized ${formatDateTime(report.finalizedAt)}`
                : ` · Generated ${formatDateTime(report.generatedAt)} by ${report.generatedByName}`}
            </p>
            {!isOwner && !isTrashed && (
              <p className="text-xs text-muted-foreground">
                You&apos;re viewing {report.subjectLabel}&apos;s report — you can add a review comment, but only
                they can edit its entries.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => downloadReportCsv(report)}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Print-only header — the on-screen header above is hidden when printing, and vice versa. */}
      <div className="hidden print:block">
        <h1 className="font-heading text-xl font-semibold">{report.subjectLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {report.kind === "person" ? "Person" : "Client"} accomplishments · {formatRange(report.rangeStart, report.rangeEnd)}
          {report.status === "finalized" && report.finalizedAt ? ` · Finalized ${formatDateTime(report.finalizedAt)}` : ""}
        </p>
      </div>

      {isTrashed && (
        <Alert variant="warning" className="print:hidden">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>This report is in Trash. Restore it to view it normally or make changes.</AlertTitle>
        </Alert>
      )}

      {error && <p className="text-sm text-destructive print:hidden">{error}</p>}

      <ReportKpiBand sections={visibleSections} />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr] print:block">
        <div className="print:hidden">
          <ReportRail sections={visibleSections} />
        </div>
        <ReportView
          kind={report.kind}
          brandSections={visibleSections}
          editable={canEditEntries}
          onToggleLine={handleToggleLine}
          onDetailChange={handleDetailChange}
          onAddService={handleOpenAddService}
          onRemoveActivity={handleRemoveActivity}
          onRemoveOther={handleRemoveOther}
        />
      </div>

      {/* The owner always reads their own report's comments (read-only) — only a non-owner reviewer can write one. */}
      <ReportComments comments={report.comments} canComment={canComment} onAddComment={handleAddComment} />

      <ReportHistory events={report.history} />

      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        {isTrashed ? (
          <Button variant="outline" disabled={isRestoring} onClick={handleRestore}>
            <RotateCcw /> {isRestoring ? "Restoring…" : "Restore"}
          </Button>
        ) : confirmingTrash ? (
          <>
            <span className="text-sm text-muted-foreground">Move this report to Trash?</span>
            <Button variant="outline" onClick={() => setConfirmingTrash(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isTrashing} onClick={handleTrash}>
              {isTrashing ? "Deleting…" : "Yes, move to Trash"}
            </Button>
          </>
        ) : confirmingFinalize ? (
          <>
            <span className="text-sm text-muted-foreground">
              Finalizing freezes this report — it can&apos;t be edited afterward.
            </span>
            <Button variant="outline" onClick={() => setConfirmingFinalize(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isFinalizing} onClick={handleFinalize}>
              {isFinalizing ? "Finalizing…" : "Yes, finalize"}
            </Button>
          </>
        ) : confirmingReopen ? (
          <>
            <span className="text-sm text-muted-foreground">
              Reopen this report to edit it? It&apos;ll go back to draft until you finalize it again.
            </span>
            <Button variant="outline" onClick={() => setConfirmingReopen(false)}>
              Cancel
            </Button>
            <Button disabled={isReopening} onClick={handleReopen}>
              {isReopening ? "Reopening…" : "Yes, reopen"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setConfirmingTrash(true)}>
              <Trash2 /> Delete
            </Button>
            {canEditEntries && (
              <>
                <Button variant="outline" disabled={isSaving} onClick={handleSave}>
                  {isSaving ? "Saving…" : "Save changes"}
                </Button>
                <Button onClick={() => setConfirmingFinalize(true)}>Finalize</Button>
              </>
            )}
            {canReopen && (
              <Button variant="outline" onClick={() => setConfirmingReopen(true)}>
                <RotateCcw /> Reopen
              </Button>
            )}
          </>
        )}
      </div>

      {addServiceBrandIndex !== null && (
        <AddServiceDialog
          open={addServiceOpen}
          onOpenChange={setAddServiceOpen}
          brandId={sections[addServiceBrandIndex].brandId}
          section={sections[addServiceBrandIndex]}
          onAddActivity={handleAddActivity}
          onAddOther={handleAddOther}
        />
      )}

      <Dialog open={blockedHref !== null} onOpenChange={(open) => !open && cancel()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>You have unsaved changes</DialogTitle>
            <DialogDescription>Save before leaving, or discard your edits to this draft?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={proceed}>
              Discard
            </Button>
            <Button disabled={isSaving} onClick={handleSaveAndLeave}>
              {isSaving ? "Saving…" : "Save and leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
