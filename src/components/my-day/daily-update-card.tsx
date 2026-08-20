"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, NotebookPen, RotateCcw } from "lucide-react";
import { useMyTodayUpdate } from "@/lib/data/hooks/use-daily-updates";
import { dailyUpdatesProvider } from "@/lib/data/providers";
import type { AddManualDailyUpdateEntryInput } from "@/lib/data/providers/daily-updates-provider";
import { useAuth } from "@/lib/auth/auth-context";
import { useToastManager } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { DailyUpdateEntries } from "@/components/daily-updates/daily-update-entries";
import { DailyUpdateStatusBadge } from "@/components/daily-updates/daily-update-status-badge";
import { AddManualEntryDialog } from "@/components/daily-updates/add-manual-entry-dialog";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatToday() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** Today's auto-drafted-plus-manual log — shared as-is across all three My Day role views, since none of them vary it by role. */
export function DailyUpdateCard() {
  const { user } = useAuth();
  const { update, refresh } = useMyTodayUpdate();
  const toastManager = useToastManager();
  const [addEntryOpen, setAddEntryOpen] = useState(false);

  if (!user || !update) return null;

  const isDraft = update.status === "draft";
  // Only normal Task-backed rows count toward this — a manual/fallback entry was never going to
  // have a real per-day plan behind it, so it never creates a misleading warning. `== null`
  // deliberately treats an explicit 0 (the person really did schedule zero minutes) as answered,
  // never conflating it with "hasn't been touched yet."
  const missingScheduledCount = update.entries.filter((e) => e.source === "task" && e.scheduledMinutes == null).length;

  async function handleDetailChange(entryId: string, details: string) {
    if (!user) return;
    await dailyUpdatesProvider.updateEntryDetails(user, update!.id, entryId, details);
    await refresh();
  }

  async function handleScheduledMinutesChange(entryId: string, scheduledMinutes: number | null) {
    if (!user) return;
    await dailyUpdatesProvider.updateEntryScheduledMinutes(user, update!.id, entryId, scheduledMinutes);
    await refresh();
  }

  async function handleAddManualEntry(input: AddManualDailyUpdateEntryInput) {
    if (!user) return;
    await dailyUpdatesProvider.addManualEntry(user, update!.id, input);
    await refresh();
  }

  async function handleSubmit() {
    if (!user) return;
    await dailyUpdatesProvider.confirmUpdate(user, update!.id);
    await refresh();
    toastManager.add({ description: "Daily Update submitted" });
  }

  async function handleReopen() {
    if (!user) return;
    await dailyUpdatesProvider.reopenUpdate(user, update!.id);
    await refresh();
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ContainedIcon size="md" tone={isDraft ? "neutral" : "success"}>
            <NotebookPen aria-hidden="true" />
          </ContainedIcon>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              Today&apos;s Update
              <DailyUpdateStatusBadge status={update.status} />
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatToday()}</p>
          </div>
        </div>
        <div key={update.status} className="flex flex-col items-end gap-1.5 animate-in fade-in-0 zoom-in-95 duration-300 ease-spring">
          <div className="flex items-center gap-2">
            {isDraft ? (
              <Button size="sm" onClick={handleSubmit}>
                <CheckCircle2 /> Submit Daily Update
              </Button>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
                  {update.confirmedAt && <span>Submitted at {formatTime(update.confirmedAt)}</span>}
                </div>
                <Button size="sm" variant="ghost" onClick={handleReopen}>
                  <RotateCcw /> Reopen
                </Button>
              </>
            )}
          </div>
          {isDraft && missingScheduledCount > 0 && (
            <p className="flex items-center gap-1 text-xs text-warning">
              <AlertCircle className="size-3.5" aria-hidden="true" />
              {missingScheduledCount === 1
                ? "1 task row is missing Scheduled Time — you can still submit, but review it first."
                : `${missingScheduledCount} task rows are missing Scheduled Time — you can still submit, but review them first.`}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <DailyUpdateEntries
          entries={update.entries}
          editable={isDraft}
          onDetailChange={handleDetailChange}
          onScheduledMinutesChange={handleScheduledMinutesChange}
          onAddEntry={isDraft ? () => setAddEntryOpen(true) : undefined}
        />
      </CardContent>
      <AddManualEntryDialog open={addEntryOpen} onOpenChange={setAddEntryOpen} onSave={handleAddManualEntry} />
    </Card>
  );
}
