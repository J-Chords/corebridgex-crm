"use client";

import type { CSSProperties } from "react";
import { Users } from "lucide-react";
import type { User } from "@/lib/data/types";
import type { DailyUpdate } from "@/lib/data/types";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DailyUpdateStatusBadge } from "@/components/daily-updates/daily-update-status-badge";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

/** Small status dot on the avatar corner — the same fact the badge already states, just scannable from a glance down the whole roster without reading text. */
function avatarDotClass(update: DailyUpdate | undefined): string {
  if (!update) return "bg-muted-foreground/40";
  return update.status === "confirmed" ? "bg-success" : "bg-warning";
}

interface TeamUpdatesRosterProps {
  people: User[];
  updatesByUserId: Map<string, DailyUpdate>;
  selectedUserId: string;
  viewerId: string;
  onSelect: (userId: string) => void;
  isLoading: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Who's on this list is already fully permission-scoped upstream (assignableStaffFor — the same set canViewDailyUpdate resolves to: self + reports, never above), so this component just renders it. */
export function TeamUpdatesRoster({
  people,
  updatesByUserId,
  selectedUserId,
  viewerId,
  onSelect,
  isLoading,
  className,
  style,
}: TeamUpdatesRosterProps) {
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
            const update = updatesByUserId.get(person.id);
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
                  {!isLoading && <AvatarBadge className={avatarDotClass(update)} />}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {person.fullName}
                    {person.id === viewerId && <span className="text-muted-foreground"> (You)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{ROLE_LABELS[person.role]}</div>
                </div>
                <StatusChip update={update} isLoading={isLoading} />
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function StatusChip({ update, isLoading }: { update: DailyUpdate | undefined; isLoading: boolean }) {
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
