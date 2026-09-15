"use client";

import type { CSSProperties, ReactNode } from "react";
import { Users } from "lucide-react";
import type { User } from "@/lib/data/types";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

interface TeamActivityRosterProps {
  people: User[];
  selectedUserId: string;
  viewerId: string;
  onSelect: (userId: string) => void;
  isLoading: boolean;
  /** Avatar-corner dot color class (e.g. "bg-success") — tab-specific meaning (Updates:
   * submitted/draft/not-started; Time: running/has-time/no-time), computed by the caller. */
  dotClassFor: (person: User) => string;
  /** Trailing status content (a status badge, a duration chip, a loading skeleton) — tab-specific,
   * rendered by the caller. */
  renderStatus: (person: User) => ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * CD-190 — the one shared Team Activity roster shell, merging what were previously two
 * near-identical components (`TeamUpdatesRoster`, `TeamTimeRoster`). Who's on this list is already
 * fully permission-scoped upstream (`assignableStaffFor` — the same set `canViewDailyUpdate`/
 * `canViewTimeForUser` resolve to: self + reports, never above), so this component just renders
 * it. Only the avatar-dot color and the trailing status content are genuinely tab-specific —
 * everything else (card shell, avatar, name, "(You)", role, selection state) was already pixel-
 * identical between the two old rosters, so it lives here once.
 */
export function TeamActivityRoster({
  people,
  selectedUserId,
  viewerId,
  onSelect,
  isLoading,
  dotClassFor,
  renderStatus,
  className,
  style,
}: TeamActivityRosterProps) {
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
                  {!isLoading && <AvatarBadge className={dotClassFor(person)} />}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {person.fullName}
                    {person.id === viewerId && <span className="text-muted-foreground"> (You)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{ROLE_LABELS[person.role]}</div>
                </div>
                {renderStatus(person)}
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
