"use client";

import { useState } from "react";
import { CheckCircle2, NotebookPen, RotateCcw } from "lucide-react";
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

  async function handleDetailChange(entryId: string, details: string) {
    if (!user) return;
    await dailyUpdatesProvider.updateEntryDetails(user, update!.id, entryId, details);
    await refresh();
  }

  async function handleAddManualEntry(input: AddManualDailyUpdateEntryInput) {
    if (!user) return;
    await dailyUpdatesProvider.addManualEntry(user, update!.id, input);
    await refresh();
  }

  async function handleConfirm() {
    if (!user) return;
    await dailyUpdatesProvider.confirmUpdate(user, update!.id);
    await refresh();
    toastManager.add({ description: "Update confirmed" });
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
        <div key={update.status} className="flex items-center gap-2 animate-in fade-in-0 zoom-in-95 duration-300 ease-spring">
          {isDraft ? (
            <Button size="sm" onClick={handleConfirm}>
              <CheckCircle2 /> Confirm
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
                {update.confirmedAt && <span>Confirmed at {formatTime(update.confirmedAt)}</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={handleReopen}>
                <RotateCcw /> Reopen
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <DailyUpdateEntries
          entries={update.entries}
          editable={isDraft}
          onDetailChange={handleDetailChange}
          onAddEntry={isDraft ? () => setAddEntryOpen(true) : undefined}
        />
      </CardContent>
      <AddManualEntryDialog open={addEntryOpen} onOpenChange={setAddEntryOpen} onSave={handleAddManualEntry} />
    </Card>
  );
}
