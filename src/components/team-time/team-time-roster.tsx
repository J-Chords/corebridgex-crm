"use client";

import type { CSSProperties } from "react";
import { Users } from "lucide-react";
import type { User } from "@/lib/data/types";
import type { TimeEntryWithUserAndTask } from "@/lib/data/providers/time-entries-provider";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { formatMinutes } from "@/lib/format-minutes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function totalMinutesFor(entries: TimeEntryWithUserAndTask[]): number {
  return entries.filter((e) => e.durationMinutes !== null).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
}

/** Small dot on the avatar corner — green while something's actively running for that person that day, otherwise just "has logged time" vs. not; never a presence/attendance signal, purely derived from their own logged entries. */
function avatarDotClass(entries: TimeEntryWithUserAndTask[]): string {
  if (entries.some((e) => e.durationMinutes === null)) return "bg-info";
  if (totalMinutesFor(entries) > 0) return "bg-success";
  return "bg-muted-foreground/40";
}

interface TeamTimeRosterProps {
  people: User[];
  entriesByUserId: Map<string, TimeEntryWithUserAndTask[]>;
  selectedUserId: string;
  viewerId: string;
  onSelect: (userId: string) => void;
  isLoading: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Who's on this list is already fully permission-scoped upstream (assignableStaffFor — the same set canViewTimeForUser resolves to: self + reports, never above), so this component just renders it. */
export function TeamTimeRoster({
  people,
  entriesByUserId,
  selectedUserId,
  viewerId,
  onSelect,
  isLoading,
  className,
  style,
}: TeamTimeRosterProps) {
  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          Team
          <span className="font-mono text-xs font-normal text-muted-foreground">{people.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          people.map((person, i) => {
            const personEntries = entriesByUserId.get(person.id) ?? [];
            const isSelected = person.id === selectedUserId;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => onSelect(person.id)}
                aria-current={isSelected ? "true" : undefined}
                className={cn(
                  "-mx-2 flex items-center gap-3 rounded-lg border-l-2 px-2.5 py-2 text-left transition-colors",
                  isSelected ? "border-l-primary bg-primary/8" : "border-l-transparent hover:bg-muted/60",
                  STAGGER_ITEM_CLASS
                )}
                style={staggerDelay(i)}
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="text-xs">{initials(person.fullName)}</AvatarFallback>
                  {!isLoading && <AvatarBadge className={avatarDotClass(personEntries)} />}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {person.fullName}
                    {person.id === viewerId && <span className="text-muted-foreground"> (You)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{ROLE_LABELS[person.role]}</div>
                </div>
                <TotalChip entries={personEntries} isLoading={isLoading} />
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function TotalChip({ entries, isLoading }: { entries: TimeEntryWithUserAndTask[]; isLoading: boolean }) {
  if (isLoading) {
    return <span className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-muted" aria-hidden="true" />;
  }
  const total = totalMinutesFor(entries);
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
