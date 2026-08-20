"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanies } from "@/lib/data/hooks/use-companies";
import { accomplishmentsReportProvider } from "@/lib/data/providers";
import type { ReportKind, ReportRangeLabel } from "@/lib/data/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Monday-Sunday of the current week, in local date parts to avoid UTC-shift surprises. */
function thisWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

const RANGE_LABEL_ITEMS: Record<ReportRangeLabel, string> = {
  today: "Today",
  "this-week": "This week",
  custom: "Custom range",
};

function emptyForm() {
  return {
    kind: "person" as ReportKind,
    /** Only meaningful for kind === "client" — a person report is always about yourself. */
    companyId: "",
    rangeLabel: "this-week" as ReportRangeLabel,
    customStart: todayDateString(),
    customEnd: todayDateString(),
  };
}

export function GenerateReportDialog({ open, onOpenChange }: GenerateReportDialogProps) {
  const { user } = useAuth();
  const { companies } = useCompanies();
  const router = useRouter();

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(emptyForm());
    setError(null);
  }, [open]);

  if (!user) return null;

  const { rangeStart, rangeEnd } = (() => {
    if (form.rangeLabel === "today") {
      const d = todayDateString();
      return { rangeStart: d, rangeEnd: d };
    }
    if (form.rangeLabel === "this-week") {
      const r = thisWeekRange();
      return { rangeStart: r.start, rangeEnd: r.end };
    }
    return { rangeStart: form.customStart, rangeEnd: form.customEnd };
  })();

  const rangeValid = Boolean(rangeStart) && Boolean(rangeEnd) && rangeStart <= rangeEnd;
  const canSubmit = (form.kind === "person" || Boolean(form.companyId)) && rangeValid;

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const report = await accomplishmentsReportProvider.generateReport(user, {
        kind: form.kind,
        subjectId: form.kind === "person" ? user.id : form.companyId,
        rangeLabel: form.rangeLabel,
        rangeStart,
        rangeEnd,
      });
      onOpenChange(false);
      router.push(`/dashboard/reports/${report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate report.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate internal report</DialogTitle>
          <DialogDescription>
            Auto-drafted from tracked work — you can edit everything before finalizing. Internal-only, fully
            attributed — for the name-free document you can send to a client, use{" "}
            <span className="font-medium text-foreground">Client Reports</span> instead.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Report type</Label>
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={form.kind === "person" ? "secondary" : "ghost"}
                className="flex-1"
                onClick={() => setForm((p) => ({ ...p, kind: "person" }))}
              >
                Personal
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.kind === "client" ? "secondary" : "ghost"}
                className="flex-1"
                onClick={() => setForm((p) => ({ ...p, kind: "client" }))}
              >
                Internal Client Summary
              </Button>
            </div>
          </div>

          {form.kind === "person" ? (
            <p className="text-xs text-muted-foreground">
              This report covers your own tracked work — you can&apos;t generate one for someone else.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">
                A fully-attributed internal summary of work on this client — not the client-facing report.
              </p>
              <Label htmlFor="report-subject-client">Client</Label>
              <Select
                items={Object.fromEntries(companies.map((c) => [c.id, c.name]))}
                value={form.companyId}
                onValueChange={(v) => setForm((p) => ({ ...p, companyId: v ?? "" }))}
              >
                <SelectTrigger id="report-subject-client" className="w-full">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-range">Range</Label>
            <Select
              items={RANGE_LABEL_ITEMS}
              value={form.rangeLabel}
              onValueChange={(v) => setForm((p) => ({ ...p, rangeLabel: (v ?? "this-week") as ReportRangeLabel }))}
            >
              <SelectTrigger id="report-range" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this-week">This week</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {form.rangeLabel === "custom" ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-range-start">Start</Label>
                  <Input
                    id="report-range-start"
                    type="date"
                    value={form.customStart}
                    onChange={(e) => setForm((p) => ({ ...p, customStart: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-range-end">End</Label>
                  <Input
                    id="report-range-end"
                    type="date"
                    value={form.customEnd}
                    onChange={(e) => setForm((p) => ({ ...p, customEnd: e.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {rangeStart === rangeEnd ? rangeStart : `${rangeStart} to ${rangeEnd}`}
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
