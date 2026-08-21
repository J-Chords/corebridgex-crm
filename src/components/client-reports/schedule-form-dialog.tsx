"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useSchedulableProjects } from "@/lib/data/hooks/use-client-report-schedules";
import { clientReportSchedulesProvider } from "@/lib/data/providers";
import type { ClientReportSchedule } from "@/lib/data/types";
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

const WEEKDAY_ITEMS: Record<string, string> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
};

interface ScheduleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Present when editing an existing schedule; omitted for "New Schedule". */
  schedule?: ClientReportSchedule;
}

function defaultTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Compact create/edit form for a recurring weekly Client Report schedule (Section 40: "keep this
 * focused, do not recreate ADP's entire report setup interface"). Project + weekday + local time +
 * timezone, plus Active/Paused when editing. V1 is weekly-only by design (Section 31) — no
 * frequency picker at all.
 */
export function ScheduleFormDialog({ open, onOpenChange, onSaved, schedule }: ScheduleFormDialogProps) {
  const { user } = useAuth();
  // Narrow, capability-gated directory (Section J) — never the operationally-scoped useProjects().
  const { projects: clientProjects } = useSchedulableProjects();
  const isEditing = !!schedule;

  const [projectId, setProjectId] = useState(schedule?.projectId ?? "");
  const [weekday, setWeekday] = useState(String(schedule?.weekday ?? 1));
  const [localTime, setLocalTime] = useState(schedule?.localTime ?? "08:00");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? defaultTimezone());
  const [active, setActive] = useState(schedule?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjectId(schedule?.projectId ?? "");
    setWeekday(String(schedule?.weekday ?? 1));
    setLocalTime(schedule?.localTime ?? "08:00");
    setTimezone(schedule?.timezone ?? defaultTimezone());
    setActive(schedule?.active ?? true);
    setError(null);
  }, [open, schedule]);

  const projectItems = useMemo(
    () => Object.fromEntries(clientProjects.map((p) => [p.projectId, `${p.companyName} — ${p.projectName}`])),
    [clientProjects]
  );

  async function handleSubmit() {
    if (!user) return;
    setError(null);
    if (!projectId) {
      setError("Pick a Client Project.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditing) {
        await clientReportSchedulesProvider.updateSchedule(user, schedule.id, {
          projectId,
          weekday: Number(weekday),
          localTime,
          timezone,
          active,
        });
      } else {
        await clientReportSchedulesProvider.createSchedule(user, { projectId, weekday: Number(weekday), localTime, timezone });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this schedule.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Schedule" : "New Schedule"}</DialogTitle>
          <DialogDescription>
            Produces a Draft Client Report every week — it still needs review and finalization; nothing is ever
            auto-finalized.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Client / Project</Label>
            <Select items={projectItems} value={projectId} onValueChange={(v) => setProjectId(v ?? "")} disabled={isEditing}>
              <SelectTrigger>
                <SelectValue placeholder="Select a Project…" />
              </SelectTrigger>
              <SelectContent>
                {clientProjects.map((p) => (
                  <SelectItem key={p.projectId} value={p.projectId}>
                    {p.companyName} — {p.projectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Weekday</Label>
              <Select items={WEEKDAY_ITEMS} value={weekday} onValueChange={(v) => setWeekday(v ?? "1")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WEEKDAY_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedule-time">Local time</Label>
              <Input id="schedule-time" type="time" value={localTime} onChange={(e) => setLocalTime(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-timezone">Timezone (IANA)</Label>
            <Input id="schedule-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Toronto" />
          </div>
          <p className="text-xs text-muted-foreground">
            Each run covers the previous 7 completed local days, ending the day before the run.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? "Saving…" : isEditing ? "Save" : "Create Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
