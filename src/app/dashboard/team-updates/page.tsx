"use client";

import { useState } from "react";
import { CheckCircle2, Circle, PencilLine } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useDailyUpdatesForDate } from "@/lib/data/hooks/use-daily-updates";
import { dailyUpdatesProvider } from "@/lib/data/providers";
import { canViewTeamUpdatesPage } from "@/lib/data/permissions";
import { DateStepper, todayDateString, formatDatePhrase } from "@/components/team-updates/date-stepper";
import { TeamUpdatesRoster } from "@/components/team-updates/team-updates-roster";
import { TeamUpdatesDetail } from "@/components/team-updates/team-updates-detail";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

export default function TeamUpdatesPage() {
  const { user } = useAuth();
  const { assignableStaff, isLoading: staffLoading } = useCompanyLookups();
  const [date, setDate] = useState(todayDateString());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { updates, isLoading: updatesLoading, refresh: refreshUpdates } = useDailyUpdatesForDate(date);

  if (!user) return null;

  if (!canViewTeamUpdatesPage(user)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Team Updates</h1>
        <p className="text-sm text-muted-foreground">
          Team Updates is for supervisors and superadmins. Your own daily update lives on My Day.
        </p>
      </div>
    );
  }

  // assignableStaffFor (behind useCompanyLookups) already resolves to exactly the set
  // canViewDailyUpdate allows: yourself, plus everyone below you, never above — so the roster
  // needs no extra filtering here. "You" is pinned first so you can always find your own row fast.
  const people = [...assignableStaff].sort((a, b) => {
    if (a.id === user.id) return -1;
    if (b.id === user.id) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const updatesByUserId = new Map(updates.map((u) => [u.userId, u]));
  const activeUserId = selectedUserId && people.some((p) => p.id === selectedUserId) ? selectedUserId : user.id;
  const activePerson = people.find((p) => p.id === activeUserId) ?? user;
  const activeUpdate = updatesByUserId.get(activeUserId) ?? null;

  const isLoading = staffLoading || updatesLoading;
  const confirmedCount = people.filter((p) => updatesByUserId.get(p.id)?.status === "confirmed").length;
  const draftCount = people.filter((p) => updatesByUserId.get(p.id)?.status === "draft").length;
  const notStartedCount = people.length - confirmedCount - draftCount;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Team Updates</h1>
          <p className="mt-1 text-sm text-muted-foreground">What did your team do {formatDatePhrase(date)}?</p>
        </div>
        <DateStepper date={date} onChange={setDate} />
      </div>

      {!isLoading && (
        <div className={cn("flex flex-wrap items-center gap-3", STAGGER_ITEM_CLASS)}>
          <StatChip icon={CheckCircle2} tone="success" label="Submitted" value={confirmedCount} />
          <StatChip icon={PencilLine} tone="warning" label="Draft" value={draftCount} />
          <StatChip icon={Circle} tone="neutral" label="Not started" value={notStartedCount} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <TeamUpdatesRoster
          people={people}
          updatesByUserId={updatesByUserId}
          selectedUserId={activeUserId}
          viewerId={user.id}
          onSelect={setSelectedUserId}
          isLoading={isLoading}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(0)}
        />
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
      </div>
    </div>
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
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
      <Icon className={cn("size-3.5", STAT_TONE_CLASS[tone])} aria-hidden="true" />
      <span className="font-mono text-sm font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
