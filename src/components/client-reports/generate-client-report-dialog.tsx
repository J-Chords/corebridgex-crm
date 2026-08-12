"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanies } from "@/lib/data/hooks/use-companies";
import { clientReportProvider } from "@/lib/data/providers";
import type { ReportRangeLabel } from "@/lib/data/types";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GenerateClientReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Monday-Sunday of the current week, in local date parts to avoid UTC-shift surprises — same helper as the internal report's own generate dialog. */
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
    companyId: "",
    rangeLabel: "this-week" as ReportRangeLabel,
    customStart: todayDateString(),
    customEnd: todayDateString(),
  };
}

/** Generates a new client-facing report — company + date range only, no Person/Client toggle like the internal report's dialog, since this report is always company-scoped. */
export function GenerateClientReportDialog({ open, onOpenChange }: GenerateClientReportDialogProps) {
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
  const canSubmit = Boolean(form.companyId) && rangeValid;

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const report = await clientReportProvider.generateReport(user, {
        companyId: form.companyId,
        rangeLabel: form.rangeLabel,
        rangeStart,
        rangeEnd,
      });
      onOpenChange(false);
      router.push(`/dashboard/reports/client/${report.id}`);
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
          <DialogTitle>Generate client report</DialogTitle>
          <DialogDescription>
            Auto-drafted from confirmed Daily Updates (falling back to tracked work for any day not filled) —
            never any employee names. Review everything before finalizing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-report-company">Client</Label>
            <Select
              items={Object.fromEntries(companies.map((c) => [c.id, c.name]))}
              value={form.companyId}
              onValueChange={(v) => setForm((p) => ({ ...p, companyId: v ?? "" }))}
            >
              <SelectTrigger id="client-report-company" className="w-full">
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-report-range">Range</Label>
            <Select
              items={RANGE_LABEL_ITEMS}
              value={form.rangeLabel}
              onValueChange={(v) => setForm((p) => ({ ...p, rangeLabel: (v ?? "this-week") as ReportRangeLabel }))}
            >
              <SelectTrigger id="client-report-range" className="w-full">
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
                  <Label htmlFor="client-report-range-start">Start</Label>
                  <Input
                    id="client-report-range-start"
                    type="date"
                    value={form.customStart}
                    onChange={(e) => setForm((p) => ({ ...p, customStart: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-report-range-end">End</Label>
                  <Input
                    id="client-report-range-end"
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
