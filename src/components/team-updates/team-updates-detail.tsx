"use client";

import type { CSSProperties } from "react";
import { CheckCircle2, ClipboardX } from "lucide-react";
import type { DailyUpdate, User } from "@/lib/data/types";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { DailyUpdateEntries } from "@/components/daily-updates/daily-update-entries";
import { DailyUpdateStatusBadge } from "@/components/daily-updates/daily-update-status-badge";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface TeamUpdatesDetailProps {
  person: User;
  update: DailyUpdate | null;
  className?: string;
  style?: CSSProperties;
}

/** Read-only mirror of DailyUpdateCard's shape, minus every editing control — this is a manager's view, never an edit surface, so entries render via the same DailyUpdateEntries with editable=false. `update === null` means the person never opened My Day that day at all, distinct from an update that exists with zero entries (opened, nothing tracked yet). */
export function TeamUpdatesDetail({ person, update, className, style }: TeamUpdatesDetailProps) {
  return (
    <Card key={person.id} className={className} style={style}>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback>{initials(person.fullName)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base">{person.fullName}</CardTitle>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[person.role]}</p>
          </div>
        </div>
        {update && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {update.status === "confirmed" && update.confirmedAt && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
                Confirmed at {formatTime(update.confirmedAt)}
              </span>
            )}
            <DailyUpdateStatusBadge status={update.status} />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {update ? (
          <DailyUpdateEntries entries={update.entries} editable={false} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
            <ContainedIcon size="lg" tone="neutral">
              <ClipboardX aria-hidden="true" />
            </ContainedIcon>
            <p className="text-sm font-medium">No daily update for this date</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {`${person.fullName.split(" ")[0]} hasn't opened My Day on this day.`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
