"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { ProjectContractPeriod, ProjectStatus } from "@/lib/data/types";
import { projectsProvider } from "@/lib/data/providers";
import { useAuth } from "@/lib/auth/auth-context";
import { parseDateOnly } from "@/lib/planner-dates";
import {
  getLatestProjectContractPeriod,
  getProjectContractPeriodDisplayState,
  isProjectRenewalEligibleStatus,
  nextContractPeriodFrom,
  periodEndForStart,
  projectRenewalNotEligibleMessage,
} from "@/lib/data/contract-periods";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToastManager } from "@/components/ui/toast";

/** `period.periodStart`/`period.periodEnd` (and any date derived from them, e.g. `periodEndForStart`'s
 * return value) are plain PostgreSQL `date` / `YYYY-MM-DD` values — parsed through `parseDateOnly`'s
 * local Y/M/D constructor, never `new Date(string)` directly (which parses a date-only string as UTC
 * midnight and can render the previous calendar day in any negative-offset timezone). */
function formatContractDateOnly(value: string) {
  return parseDateOnly(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** `period.createdAt` is a real `timestamptz` — when this was recorded, not a calendar date fact —
 * so it's correctly parsed via the ordinary `Date` constructor and rendered in the viewer's own local
 * time. Kept as a separate function from `formatContractDateOnly` so a timestamp is never accidentally
 * forced through date-only parsing (or vice versa). */
function formatRecordedTimestamp(value: string) {
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const STATE_LABEL: Record<ReturnType<typeof getProjectContractPeriodDisplayState>, string> = {
  current: "Current",
  upcoming: "Upcoming",
  past: "Past",
};
const STATE_BADGE_VARIANT: Record<ReturnType<typeof getProjectContractPeriodDisplayState>, "success" | "info" | "neutral"> = {
  current: "success",
  upcoming: "info",
  past: "neutral",
};

/** Phase 6B (CD-216) — records the FIRST period known to the contract-history subsystem for a
 * Project with none (never called "Renew Contract" — see `createInitialProjectContractPeriod`'s own
 * doc comment). A prefilled suggestion is deliberately never offered: Client Since/Company Renewal
 * Date are separate facts, never auto-saved here. */
function RecordContractPeriodDialog({
  open,
  onOpenChange,
  projectId,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onRecorded: () => void;
}) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [periodStart, setPeriodStart] = useState("");
  const [saving, setSaving] = useState(false);
  const derivedEnd = periodStart ? periodEndForStart(periodStart) : null;

  async function handleSave() {
    if (!user || !periodStart) return;
    setSaving(true);
    try {
      await projectsProvider.createInitialProjectContractPeriod(user, projectId, periodStart);
      onOpenChange(false);
      setPeriodStart("");
      onRecorded();
      toastManager.add({ description: "Contract period recorded." });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't record this contract period." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setPeriodStart(""); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Contract Period</DialogTitle>
          <DialogDescription>
            This records the first contract period known to Corebridge X. It does not create
            historical periods before this date.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="period-start">Period Start</Label>
            <Input id="period-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Period End</Label>
            <p className="text-sm text-muted-foreground">{derivedEnd ? formatContractDateOnly(derivedEnd) : "—"}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!periodStart || saving} onClick={handleSave}>
            {saving ? "Recording…" : "Record Contract Period"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenewContractDialog({
  open,
  onOpenChange,
  projectId,
  leaf,
  onRenewed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  leaf: ProjectContractPeriod;
  onRenewed: () => void;
}) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [saving, setSaving] = useState(false);
  const next = nextContractPeriodFrom(leaf);

  async function handleRenew() {
    if (!user) return;
    setSaving(true);
    try {
      await projectsProvider.renewProjectContractPeriod(user, projectId);
      onOpenChange(false);
      onRenewed();
      toastManager.add({ description: "Contract renewed." });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't renew this contract." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Renew Contract</DialogTitle>
          <DialogDescription>
            The same Project remains in use — no Tasks, Services, or Activities are duplicated or
            reset.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Current / latest recorded period
            </span>
            <span>{formatContractDateOnly(leaf.periodStart)} – {formatContractDateOnly(leaf.periodEnd)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">New period</span>
            <span>{formatContractDateOnly(next.periodStart)} – {formatContractDateOnly(next.periodEnd)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={handleRenew}>
            {saving ? "Renewing…" : "Renew Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CorrectInitialPeriodDialog({
  open,
  onOpenChange,
  projectId,
  period,
  onCorrected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  period: ProjectContractPeriod;
  onCorrected: () => void;
}) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [periodStart, setPeriodStart] = useState(period.periodStart);
  const [saving, setSaving] = useState(false);
  const derivedEnd = periodStart ? periodEndForStart(periodStart) : null;

  async function handleSave() {
    if (!user || !periodStart) return;
    setSaving(true);
    try {
      await projectsProvider.correctInitialProjectContractPeriodStart(user, projectId, periodStart);
      onOpenChange(false);
      onCorrected();
      toastManager.add({ description: "Contract period corrected." });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't correct this contract period." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setPeriodStart(period.periodStart);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Correct start date</DialogTitle>
          <DialogDescription>
            Correction is only available before a renewal history has been established.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Current Start</Label>
            <p className="text-sm text-muted-foreground">{formatContractDateOnly(period.periodStart)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="corrected-start">Corrected Start</Label>
            <Input id="corrected-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Derived End</Label>
            <p className="text-sm text-muted-foreground">{derivedEnd ? formatContractDateOnly(derivedEnd) : "—"}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!periodStart || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Phase 6B (CD-216) — the one Contract History surface, visible to every legitimate Project reader
 * (Admin/Team Lead/Employee); only the mutation affordances (overflow menu, Renew/Record buttons)
 * are Admin-only. Backend/provider remain the authoritative gate regardless of what renders here —
 * see each provider method's own doc comment. */
export function ContractHistoryCard({
  projectId,
  projectStatus,
  periods,
  isLoading,
  canMutate,
  onChanged,
}: {
  projectId: string;
  projectStatus: ProjectStatus;
  periods: ProjectContractPeriod[];
  isLoading: boolean;
  canMutate: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [recordOpen, setRecordOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectContractPeriod | null>(null);
  const [removing, setRemoving] = useState(false);

  const sorted = [...periods].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const leaf = getLatestProjectContractPeriod(periods);
  const renewalEligible = isProjectRenewalEligibleStatus(projectStatus);

  async function handleRemove() {
    if (!user || !removeTarget) return;
    setRemoving(true);
    try {
      await projectsProvider.deleteLatestProjectContractPeriod(user, projectId, removeTarget.id);
      setRemoveTarget(null);
      onChanged();
      toastManager.add({ description: "Contract period removed." });
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't remove this contract period." });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Contract History</CardTitle>
        {canMutate && periods.length > 0 && (
          renewalEligible ? (
            <Button size="sm" onClick={() => setRenewOpen(true)}>
              Renew Contract
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{projectRenewalNotEligibleMessage(projectStatus)}</span>
          )
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : periods.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">No contract periods recorded.</p>
            {canMutate && (
              <Button size="sm" variant="outline" onClick={() => setRecordOpen(true)}>
                Record Contract Period
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sorted.map((period, i) => {
              const state = getProjectContractPeriodDisplayState(period);
              const isLeaf = leaf?.id === period.id;
              const isSoleRoot = periods.length === 1 && period.renewedFromPeriodId === null;
              return (
                <div key={period.id}>
                  {i > 0 && <div className="my-1 border-t" />}
                  <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {formatContractDateOnly(period.periodStart)} – {formatContractDateOnly(period.periodEnd)}
                      </span>
                      <span className="text-xs text-muted-foreground">Recorded {formatRecordedTimestamp(period.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATE_BADGE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>
                      {canMutate && isLeaf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent"
                            aria-label={`Actions for ${formatContractDateOnly(period.periodStart)} – ${formatContractDateOnly(period.periodEnd)}`}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isSoleRoot && (
                              <DropdownMenuItem onClick={() => setCorrectOpen(true)}>Correct start date</DropdownMenuItem>
                            )}
                            <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget(period)}>
                              Remove mistaken period
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <RecordContractPeriodDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        projectId={projectId}
        onRecorded={onChanged}
      />
      {leaf && (
        <RenewContractDialog
          open={renewOpen}
          onOpenChange={setRenewOpen}
          projectId={projectId}
          leaf={leaf}
          onRenewed={onChanged}
        />
      )}
      {leaf && periods.length === 1 && (
        <CorrectInitialPeriodDialog
          open={correctOpen}
          onOpenChange={setCorrectOpen}
          projectId={projectId}
          period={leaf}
          onCorrected={onChanged}
        />
      )}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove contract period?"
        description={
          removeTarget
            ? `${formatContractDateOnly(removeTarget.periodStart)} – ${formatContractDateOnly(removeTarget.periodEnd)}. This should be used only to correct a mistakenly recorded period.`
            : ""
        }
        confirmLabel={removing ? "Removing…" : "Remove mistaken period"}
        confirmVariant="destructive"
        onConfirm={handleRemove}
      />
    </Card>
  );
}
