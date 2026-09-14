"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Circle, Clock, PencilLine } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useDailyUpdatesForDate } from "@/lib/data/hooks/use-daily-updates";
import { useTimeEntriesForDate } from "@/lib/data/hooks/use-time-entries";
import { dailyUpdatesProvider } from "@/lib/data/providers";
import { canViewTeamActivityPage } from "@/lib/data/permissions";
import { formatMinutes } from "@/lib/format-minutes";
import type { DailyUpdate, User } from "@/lib/data/types";
import type { TimeEntryWithUserAndTask } from "@/lib/data/providers/time-entries-provider";
import { DateStepper, todayDateString } from "@/components/team-updates/date-stepper";
import { TeamActivityRoster } from "@/components/team-activity/team-activity-roster";
import { TeamUpdatesDetail } from "@/components/team-updates/team-updates-detail";
import { TeamTimeDetail } from "@/components/team-time/team-time-detail";
import { DailyUpdateStatusBadge } from "@/components/daily-updates/daily-update-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

type TeamActivityView = "updates" | "time";

function readView(searchParams: URLSearchParams): TeamActivityView {
  return searchParams.get("view") === "time" ? "time" : "updates";
}

/** `useSearchParams` requires a Suspense boundary above it — same split already established on
 * the Project/Service detail pages for their own `?tab=`/`?view=` deep-link seeding. */
function TeamActivityPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { assignableStaff, isLoading: staffLoading } = useCompanyLookups();
  const [date, setDate] = useState(todayDateString());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const view = readView(searchParams);

  // Both tabs' data is fetched unconditionally, exactly as each did on its own separate page
  // before — switching tabs is then instant (no new fetch, no reload) and the roster's
  // tab-specific status column never has to wait on a fetch that already happened.
  const { updates, isLoading: updatesLoading, refresh: refreshUpdates } = useDailyUpdatesForDate(date);
  const { entries, isLoading: entriesLoading, refresh: refreshEntries } = useTimeEntriesForDate(date);

  if (!user) return null;

  if (!canViewTeamActivityPage(user)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Team Activity</h1>
        <p className="text-sm text-muted-foreground">
          Team Activity is for supervisors and superadmins. Your own daily update and logged time live on My Day.
        </p>
      </div>
    );
  }

  function selectView(next: TeamActivityView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // assignableStaffFor (behind useCompanyLookups) already resolves to exactly the set both
  // canViewDailyUpdate and canViewTimeForUser allow: yourself, plus everyone below you, never
  // above — one roster, unfiltered, serves both tabs. "You" is pinned first.
  const people = [...assignableStaff].sort((a, b) => {
    if (a.id === user.id) return -1;
    if (b.id === user.id) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const updatesByUserId = new Map(updates.map((u) => [u.userId, u]));
  const entriesByUserId = new Map<string, TimeEntryWithUserAndTask[]>();
  for (const entry of entries) {
    const list = entriesByUserId.get(entry.userId) ?? [];
    list.push(entry);
    entriesByUserId.set(entry.userId, list);
  }

  // One shared selected-employee state for both tabs — switching tabs keeps the same person
  // selected for free, since the roster (and therefore this membership check) never changes.
  const activeUserId = selectedUserId && people.some((p) => p.id === selectedUserId) ? selectedUserId : user.id;
  const activePerson = people.find((p) => p.id === activeUserId) ?? user;
  const activeUpdate = updatesByUserId.get(activeUserId) ?? null;
  const activeEntries = entriesByUserId.get(activeUserId) ?? [];

  const isLoading = staffLoading || (view === "updates" ? updatesLoading : entriesLoading);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Team Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Daily updates and logged time for your team</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              size="sm"
              variant={view === "updates" ? "secondary" : "ghost"}
              aria-pressed={view === "updates"}
              onClick={() => selectView("updates")}
            >
              Updates
            </Button>
            <Button
              size="sm"
              variant={view === "time" ? "secondary" : "ghost"}
              aria-pressed={view === "time"}
              onClick={() => selectView("time")}
            >
              Time
            </Button>
          </div>
          <DateStepper date={date} onChange={setDate} />
        </div>
      </div>

      {view === "updates" ? (
        <UpdatesSummaryRow people={people} updatesByUserId={updatesByUserId} isLoading={isLoading} />
      ) : (
        <TimeSummaryRow people={people} entries={entries} entriesByUserId={entriesByUserId} isLoading={isLoading} />
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {view === "updates" ? (
          <TeamActivityRoster
            people={people}
            selectedUserId={activeUserId}
            viewerId={user.id}
            onSelect={setSelectedUserId}
            isLoading={isLoading}
            dotClassFor={(p) => updateDotClass(updatesByUserId.get(p.id))}
            renderStatus={(p) => <UpdateStatusChip update={updatesByUserId.get(p.id)} isLoading={isLoading} />}
            className={STAGGER_ITEM_CLASS}
            style={staggerDelay(0)}
          />
        ) : (
          <TeamActivityRoster
            people={people}
            selectedUserId={activeUserId}
            viewerId={user.id}
            onSelect={setSelectedUserId}
            isLoading={isLoading}
            dotClassFor={(p) => timeDotClass(entriesByUserId.get(p.id) ?? [])}
            renderStatus={(p) => <TimeStatusChip entries={entriesByUserId.get(p.id) ?? []} isLoading={isLoading} />}
            className={STAGGER_ITEM_CLASS}
            style={staggerDelay(0)}
          />
        )}

        {view === "updates" ? (
          <TeamUpdatesDetail
            key={activeUserId}
            viewer={user}
            allUsers={people}
            person={activePerson}
            update={activeUpdate}
            onReview={async () => {
              if (!activeUpdate) return;
              await dailyUpdatesProvider.reviewUpdate(user, activeUpdate.id);
              await refreshUpdates();
            }}
            className={STAGGER_ITEM_CLASS}
            style={staggerDelay(1)}
          />
        ) : (
          <TeamTimeDetail
            key={activeUserId}
            person={activePerson}
            entries={activeEntries}
            viewerId={user.id}
            onChanged={refreshEntries}
            className={STAGGER_ITEM_CLASS}
            style={staggerDelay(1)}
          />
        )}
      </div>
    </div>
  );
}

export default function TeamActivityPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TeamActivityPageContent />
    </Suspense>
  );
}

const STAT_TONE_CLASS: Record<"success" | "warning" | "neutral", string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-muted-foreground",
};

function StatChip({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  tone: "success" | "warning" | "neutral";
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
      <Icon className={cn("size-3.5", STAT_TONE_CLASS[tone])} aria-hidden="true" />
      <span className="font-mono text-sm font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** Submitted = DailyUpdate status "confirmed". Draft = row exists, status "draft". Not started =
 * no row at all for this person/date. Exactly the meanings the old Team Updates page used. */
function UpdatesSummaryRow({
  people,
  updatesByUserId,
  isLoading,
}: {
  people: User[];
  updatesByUserId: Map<string, DailyUpdate>;
  isLoading: boolean;
}) {
  if (isLoading) return null;
  const confirmedCount = people.filter((p) => updatesByUserId.get(p.id)?.status === "confirmed").length;
  const draftCount = people.filter((p) => updatesByUserId.get(p.id)?.status === "draft").length;
  const notStartedCount = people.length - confirmedCount - draftCount;
  return (
    <div className={cn("flex flex-wrap items-center gap-3", STAGGER_ITEM_CLASS)}>
      <StatChip icon={CheckCircle2} tone="success" label="Submitted" value={confirmedCount} />
      <StatChip icon={PencilLine} tone="warning" label="Draft" value={draftCount} />
      <StatChip icon={Circle} tone="neutral" label="Not started" value={notStartedCount} />
    </div>
  );
}

/** Product Owner decision (CD-190) — a stable 3-metric row, always shown (unlike the old Team
 * Time page's single chip, which hid itself entirely at zero). All three are derived purely from
 * the already-fetched, already-visible roster + entries for the selected date — no new
 * provider/query. Total Logged never fabricates duration for a still-running entry (only
 * completed `durationMinutes` are summed, exactly like the old page's own `teamTotalMinutes`). */
function TimeSummaryRow({
  people,
  entries,
  entriesByUserId,
  isLoading,
}: {
  people: User[];
  entries: TimeEntryWithUserAndTask[];
  entriesByUserId: Map<string, TimeEntryWithUserAndTask[]>;
  isLoading: boolean;
}) {
  if (isLoading) return null;
  const totalLoggedMinutes = entries
    .filter((e) => e.durationMinutes !== null)
    .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const withTimeCount = people.filter((p) => (entriesByUserId.get(p.id) ?? []).length > 0).length;
  const noTimeCount = people.length - withTimeCount;
  return (
    <div className={cn("flex flex-wrap items-center gap-3", STAGGER_ITEM_CLASS)}>
      <StatChip icon={Clock} tone="neutral" label="Logged" value={formatMinutes(totalLoggedMinutes)} />
      <StatChip icon={CheckCircle2} tone="success" label="With time" value={withTimeCount} />
      <StatChip icon={Circle} tone="neutral" label="No time" value={noTimeCount} />
    </div>
  );
}

/** Same dot logic as the old `TeamUpdatesRoster`'s `avatarDotClass`. */
function updateDotClass(update: DailyUpdate | undefined): string {
  if (!update) return "bg-muted-foreground/40";
  return update.status === "confirmed" ? "bg-success" : "bg-warning";
}

function UpdateStatusChip({ update, isLoading }: { update: DailyUpdate | undefined; isLoading: boolean }) {
  if (isLoading) {
    return <span className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-muted" aria-hidden="true" />;
  }
  if (!update) {
    return (
      <Badge variant="neutral" className="shrink-0">
        Not started
      </Badge>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="font-mono text-xs text-muted-foreground">
        {update.entries.length} {update.entries.length === 1 ? "entry" : "entries"}
      </span>
      <DailyUpdateStatusBadge status={update.status} />
    </div>
  );
}

/** Same dot logic as the old `TeamTimeRoster`'s `avatarDotClass`. */
function timeDotClass(entries: TimeEntryWithUserAndTask[]): string {
  if (entries.some((e) => e.durationMinutes === null)) return "bg-info";
  const total = entries.filter((e) => e.durationMinutes !== null).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  return total > 0 ? "bg-success" : "bg-muted-foreground/40";
}

function TimeStatusChip({ entries, isLoading }: { entries: TimeEntryWithUserAndTask[]; isLoading: boolean }) {
  if (isLoading) {
    return <span className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-muted" aria-hidden="true" />;
  }
  const total = entries.filter((e) => e.durationMinutes !== null).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  if (total === 0 && entries.length === 0) {
    return (
      <Badge variant="neutral" className="shrink-0">
        No time
      </Badge>
    );
  }
  return (
    <span className="shrink-0 font-mono text-xs text-muted-foreground">
      {formatMinutes(total)}
      {entries.some((e) => e.durationMinutes === null) && " +"}
    </span>
  );
}
