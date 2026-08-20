"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useClientReport } from "@/lib/data/hooks/use-client-reports";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useUnsavedChangesGuard } from "@/lib/data/hooks/use-unsaved-changes-guard";
import { clientReportProvider } from "@/lib/data/providers";
import {
  canEditOwnClientDraft,
  canFinalizeClientReport,
  canRestoreClientReport,
  canTrashClientReport,
  isClientReportOwner,
  isEmployee,
} from "@/lib/data/permissions";
import type { ClientReportDepartmentSection, ClientReportLineItem } from "@/lib/data/types";
import { visibleDepartments } from "@/lib/data/client-report-totals";
import { findMentionedStaffNames } from "@/lib/data/client-report-name-scan";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToastManager } from "@/components/ui/toast";
import { ClientReportStatusBadge } from "@/components/client-reports/client-report-status-badge";
import { ClientReportKpiBand } from "@/components/client-reports/client-report-kpi-band";
import { ClientReportRail } from "@/components/client-reports/client-report-rail";
import { ClientReportView } from "@/components/client-reports/client-report-view";
import { AddSectionDialog } from "@/components/client-reports/add-section-dialog";
import { ClientReportComments } from "@/components/client-reports/client-report-comments";
import { ClientReportHistory } from "@/components/client-reports/client-report-history";
import { downloadClientReportCsv } from "@/components/client-reports/client-report-export";

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

export default function ClientReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { report, isLoading, notFound, refresh } = useClientReport(id);
  const { assignableStaff } = useCompanyLookups();
  const toastManager = useToastManager();
  const router = useRouter();

  const [draft, setDraft] = useState<ClientReportDepartmentSection[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { blockedHref, proceed, cancel } = useUnsavedChangesGuard(isDirty);

  useEffect(() => {
    if (!report) return;
    // Reset the local editable copy whenever the underlying report changes (load, or after save/finalize).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(report.status === "draft" ? report.departments : null);
    setIsDirty(false);
    setConfirmingFinalize(false);
    setConfirmingTrash(false);
  }, [report]);

  if (!user) return null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !report) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/reports/client" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to client reports
        </Link>
        <p className="text-sm text-muted-foreground">
          This report doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const isOwner = isClientReportOwner(user, report);
  const isTrashed = report.deletedAt !== null;
  const canEditEntries = canEditOwnClientDraft(user, report) && !isTrashed;
  const canComment = !isOwner && !isEmployee(user);
  const canFinalize = canFinalizeClientReport(user, report, assignableStaff) && !isTrashed;
  const canTrash = canTrashClientReport(user, report);
  const canRestore = canRestoreClientReport(user, report);
  const departments = canEditEntries && draft ? draft : report.departments;
  const mentionedStaffNames = findMentionedStaffNames(departments, assignableStaff);
  // Plain locals, not `report` itself — TS won't narrow a nullable const across a hoisted function
  // declaration's closure, even though these are only ever called once `report` is known non-null.
  const reportDepartments = report.departments;
  const reportDefaultLineDate = report.rangeEnd;
  const reportCompanyLabel = report.companyLabel;
  const reportRangeText = formatRange(report.rangeStart, report.rangeEnd);

  function mutateLine(
    deptIndex: number,
    activityIndex: number,
    lineIndex: number,
    patch: (line: ClientReportLineItem) => ClientReportLineItem
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      return prev.map((dept, dIdx) =>
        dIdx !== deptIndex
          ? dept
          : {
              ...dept,
              activities: dept.activities.map((activity, aIdx) =>
                aIdx !== activityIndex
                  ? activity
                  : { ...activity, lineItems: activity.lineItems.map((line, lIdx) => (lIdx === lineIndex ? patch(line) : line)) }
              ),
            }
      );
    });
    setIsDirty(true);
  }

  function handleLineChange(deptIndex: number, activityIndex: number, lineIndex: number, patch: Partial<ClientReportLineItem>) {
    mutateLine(deptIndex, activityIndex, lineIndex, (line) => ({ ...line, ...patch }));
  }

  function handleAddLine(deptIndex: number, activityIndex: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const newLine: ClientReportLineItem = {
        id: crypto.randomUUID(),
        date: reportDefaultLineDate,
        minutes: 0,
        details: "",
        source: "manual",
      };
      return prev.map((dept, dIdx) =>
        dIdx !== deptIndex
          ? dept
          : {
              ...dept,
              activities: dept.activities.map((activity, aIdx) =>
                aIdx !== activityIndex ? activity : { ...activity, lineItems: [...activity.lineItems, newLine] }
              ),
            }
      );
    });
    setIsDirty(true);
  }

  function handleRemoveLine(deptIndex: number, activityIndex: number, lineIndex: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return prev
        .map((dept, dIdx) =>
          dIdx !== deptIndex
            ? dept
            : {
                ...dept,
                // Removing the last line of an activity drops the activity too — an activity
                // emptied by deletion is functionally "never worked," not a deliberate placeholder
                // (that's what "+ Add section" is for), so it shouldn't linger as an empty box.
                activities: dept.activities
                  .map((activity, aIdx) =>
                    aIdx !== activityIndex
                      ? activity
                      : { ...activity, lineItems: activity.lineItems.filter((_, lIdx) => lIdx !== lineIndex) }
                  )
                  .filter((activity) => activity.lineItems.length > 0),
              }
        )
        .filter((dept) => dept.activities.length > 0);
    });
    setIsDirty(true);
  }

  function handleRemoveSection(deptIndex: number, activityIndex: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return prev
        .map((dept, dIdx) =>
          dIdx !== deptIndex ? dept : { ...dept, activities: dept.activities.filter((_, aIdx) => aIdx !== activityIndex) }
        )
        .filter((dept) => dept.activities.length > 0);
    });
    setIsDirty(true);
  }

  function handleAddSection(input: { departmentId: string; departmentName: string; activityId: string; activityName: string }) {
    setDraft((prev) => {
      const base = prev ?? reportDepartments;
      const existingDeptIndex = base.findIndex((d) => d.departmentId === input.departmentId);
      const newActivity = { activityId: input.activityId, activityName: input.activityName, lineItems: [] };
      if (existingDeptIndex === -1) {
        return [...base, { departmentId: input.departmentId, departmentName: input.departmentName, activities: [newActivity] }];
      }
      return base.map((dept, idx) =>
        idx !== existingDeptIndex ? dept : { ...dept, activities: [...dept.activities, newActivity] }
      );
    });
    setIsDirty(true);
  }

  async function handleSave() {
    if (!user || !draft) return;
    setError(null);
    setIsSaving(true);
    try {
      await clientReportProvider.updateDraft(user, id, draft);
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
    if (!user) return;
    setError(null);
    setIsFinalizing(true);
    try {
      // Only the draft's own owner can save edits (updateDraft is owner-only) — a Supervisor/
      // Superadmin finalizing someone else's draft skips straight to finalizeReport, which is
      // deliberately not owner-restricted (see canFinalizeClientReport).
      if (isOwner && draft && isDirty) {
        await clientReportProvider.updateDraft(user, id, draft);
      }
      await clientReportProvider.finalizeReport(user, id);
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
      await clientReportProvider.trashReport(user, id);
      toastManager.add({ description: "Moved to Trash — auto-deletes after 30 days" });
      router.push("/dashboard/reports/client");
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
      await clientReportProvider.restoreReport(user, id);
      toastManager.add({ description: "Report restored" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to restore report.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleAddComment(body: string) {
    if (!user) return;
    await clientReportProvider.addComment(user, id, body);
    refresh();
  }

  async function handleSaveAndLeave() {
    await handleSave();
    proceed();
  }

  function handleExportPdf() {
    const originalTitle = document.title;
    document.title = `${reportCompanyLabel} — Client Report — ${reportRangeText}`;
    window.print();
    document.title = originalTitle;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 print:hidden">
        <Link href="/dashboard/reports/client" className="w-fit text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to client reports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold">{report.companyLabel}</h1>
              <ClientReportStatusBadge status={report.status} />
              {isTrashed && <span className="text-xs text-destructive">In Trash</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              {report.brandLabel} · {formatRange(report.rangeStart, report.rangeEnd)}
              {report.status === "finalized" && report.finalizedAt
                ? ` · Finalized ${formatDateTime(report.finalizedAt)}`
                : ` · Generated ${formatDateTime(report.generatedAt)} by ${report.generatedByName}`}
            </p>
            {!isOwner && !isTrashed && (
              <p className="text-xs text-muted-foreground">
                You&apos;re viewing a report generated by someone else — you can add a review comment, but only
                they can edit its entries.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => downloadClientReportCsv(report)}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" onClick={handleExportPdf}>
              <Printer /> Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Print-only header — deliberately name-free: no "generated by", no staff attribution anywhere. */}
      <div className="hidden print:block">
        <h1 className="font-heading text-xl font-semibold">{report.companyLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {report.brandLabel} accomplishments · {formatRange(report.rangeStart, report.rangeEnd)}
          {report.status === "finalized" && report.finalizedAt ? ` · Finalized ${formatDate(report.finalizedAt)}` : ""}
        </p>
      </div>

      {isTrashed && (
        <Alert variant="warning" className="print:hidden">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>This report is in Trash. Restore it to view it normally or make changes.</AlertTitle>
        </Alert>
      )}

      {error && <p className="text-sm text-destructive print:hidden">{error}</p>}

      <ClientReportKpiBand departments={visibleDepartments(departments, canEditEntries)} />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr] print:block">
        <div className="print:hidden">
          <ClientReportRail departments={visibleDepartments(departments, canEditEntries)} />
        </div>
        <div className="flex flex-col gap-4">
          {canEditEntries && (
            <Button type="button" variant="outline" size="sm" className="w-fit print:hidden" onClick={() => setAddSectionOpen(true)}>
              <Plus /> Add section
            </Button>
          )}
          <ClientReportView
            departments={visibleDepartments(departments, canEditEntries)}
            editable={canEditEntries}
            onLineChange={handleLineChange}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
            onRemoveSection={handleRemoveSection}
          />
        </div>
      </div>

      {/* Internal-only, staff-facing — both explicitly print:hidden, since both carry staff names. */}
      <ClientReportComments comments={report.comments} canComment={canComment} onAddComment={handleAddComment} />
      <ClientReportHistory events={report.history} />

      {/* A warning, not a block — a substring match can't tell a real mention from a false positive, so the
          manager reviews and either fixes the text or proceeds with "Yes, finalize" below regardless. */}
      {confirmingFinalize && mentionedStaffNames.length > 0 && (
        <Alert variant="warning" className="print:hidden">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>
            This client report mentions staff names: {mentionedStaffNames.join(", ")}. Client reports shouldn&apos;t
            name employees — please review before finalizing.
          </AlertTitle>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        {isTrashed ? (
          canRestore && (
            <Button variant="outline" disabled={isRestoring} onClick={handleRestore}>
              <RotateCcw /> {isRestoring ? "Restoring…" : "Restore"}
            </Button>
          )
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
            <span className="max-w-md text-sm text-muted-foreground">
              Finalizing freezes this report permanently — it can never be reopened or edited again. Make sure
              no employee names appear anywhere in the Details text before you continue.
            </span>
            <Button variant="outline" onClick={() => setConfirmingFinalize(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isFinalizing} onClick={handleFinalize}>
              {isFinalizing ? "Finalizing…" : "Yes, finalize"}
            </Button>
          </>
        ) : (
          <>
            {canTrash && (
              <Button variant="ghost" onClick={() => setConfirmingTrash(true)}>
                <Trash2 /> Delete
              </Button>
            )}
            {canEditEntries && (
              <Button variant="outline" disabled={isSaving} onClick={handleSave}>
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            )}
            {canFinalize && <Button onClick={() => setConfirmingFinalize(true)}>Finalize</Button>}
          </>
        )}
      </div>

      <AddSectionDialog
        open={addSectionOpen}
        onOpenChange={setAddSectionOpen}
        brandId={report.brandId}
        departments={departments}
        onAdd={handleAddSection}
      />

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
