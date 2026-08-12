"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useTimeEntriesForDate } from "@/lib/data/hooks/use-time-entries";
import { canViewTeamTimePage } from "@/lib/data/permissions";
import { formatMinutes } from "@/lib/format-minutes";
import type { TimeEntryWithUserAndTask } from "@/lib/data/providers/time-entries-provider";
import { DateStepper, todayDateString, formatDatePhrase } from "@/components/team-updates/date-stepper";
import { TeamTimeRoster } from "@/components/team-time/team-time-roster";
import { TeamTimeDetail } from "@/components/team-time/team-time-detail";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

export default function TeamTimePage() {
  const { user } = useAuth();
  const { assignableStaff, isLoading: staffLoading } = useCompanyLookups();
  const [date, setDate] = useState(todayDateString());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { entries, isLoading: entriesLoading } = useTimeEntriesForDate(date);

  if (!user) return null;

  if (!canViewTeamTimePage(user)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Team Time</h1>
        <p className="text-sm text-muted-foreground">
          Team Time is for supervisors and superadmins. Your own logged time lives on My Day.
        </p>
      </div>
    );
  }

  // assignableStaffFor (behind useCompanyLookups) already resolves to exactly the set
  // canViewTimeForUser allows: yourself, plus everyone below you, never above — so the roster
  // needs no extra filtering here. "You" is pinned first so you can always find your own row fast.
  const people = [...assignableStaff].sort((a, b) => {
    if (a.id === user.id) return -1;
    if (b.id === user.id) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const entriesByUserId = new Map<string, TimeEntryWithUserAndTask[]>();
  for (const entry of entries) {
    const list = entriesByUserId.get(entry.userId) ?? [];
    list.push(entry);
    entriesByUserId.set(entry.userId, list);
  }

  const activeUserId = selectedUserId && people.some((p) => p.id === selectedUserId) ? selectedUserId : user.id;
  const activePerson = people.find((p) => p.id === activeUserId) ?? user;
  const activeEntries = entriesByUserId.get(activeUserId) ?? [];

  const isLoading = staffLoading || entriesLoading;
  const teamTotalMinutes = entries.filter((e) => e.durationMinutes !== null).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Team Time</h1>
          <p className="mt-1 text-sm text-muted-foreground">What did your team log {formatDatePhrase(date)}?</p>
        </div>
        <DateStepper date={date} onChange={setDate} />
      </div>

      {!isLoading && teamTotalMinutes > 0 && (
        <div className={cn("flex flex-wrap items-center gap-3", STAGGER_ITEM_CLASS)}>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-sm font-semibold">{formatMinutes(teamTotalMinutes)}</span>
            <span className="text-xs text-muted-foreground">logged across the team</span>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <TeamTimeRoster
          people={people}
          entriesByUserId={entriesByUserId}
          selectedUserId={activeUserId}
          viewerId={user.id}
          onSelect={setSelectedUserId}
          isLoading={isLoading}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(0)}
        />
        <TeamTimeDetail
          key={activeUserId}
          person={activePerson}
          entries={activeEntries}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(1)}
        />
      </div>
    </div>
  );
}
