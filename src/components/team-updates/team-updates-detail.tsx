"use client";

import { useState, type CSSProperties } from "react";
import { CheckCircle2, ClipboardCheck, ClipboardX } from "lucide-react";
import type { DailyUpdate, User } from "@/lib/data/types";
import { canReviewDailyUpdate } from "@/lib/data/permissions";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { DailyUpdateEntries } from "@/components/daily-updates/daily-update-entries";
import { DailyUpdateStatusBadge } from "@/components/daily-updates/daily-update-status-badge";

import { getInitials as initials } from "@/lib/initials";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface TeamUpdatesDetailProps {
  viewer: User;
  allUsers: User[];
  person: User;
  update: DailyUpdate | null;
  onReview: () => Promise<void>;
  className?: string;
  style?: CSSProperties;
}

/** Read-only mirror of DailyUpdateCard's shape, minus every editing control — this is a manager's
 * view, never an edit surface, so entries render via the same DailyUpdateEntries with
 * editable=false. `update === null` means the person never opened My Day that day at all, distinct
 * from an update that exists with zero entries (opened, nothing tracked yet). Phase 9C adds the one
 * review action this page offers: "Mark reviewed" on a legitimate submitted update, never on a
 * draft, never on the viewer's own — `canReviewDailyUpdate` is the real gate, this button is just
 * its UI, the RPC remains authoritative. */
export function TeamUpdatesDetail({ viewer, allUsers, person, update, onReview, className, style }: TeamUpdatesDetailProps) {
  const [isReviewing, setIsReviewing] = useState(false);
  const canReview = !!update && canReviewDailyUpdate(viewer, update, allUsers);

  async function handleReview() {
    setIsReviewing(true);
    try {
      await onReview();
    } finally {
      setIsReviewing(false);
    }
  }

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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {update.status === "confirmed" && update.confirmedAt && (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
                  Submitted at {formatTime(update.confirmedAt)}
                </span>
              )}
              <DailyUpdateStatusBadge status={update.status} />
            </div>
            {canReview && (
              <Button size="sm" variant="outline" onClick={handleReview} disabled={isReviewing}>
                <ClipboardCheck /> {isReviewing ? "Marking…" : "Mark reviewed"}
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {update?.status === "confirmed" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {update.reviewedAt ? (
              <span className="inline-flex items-center gap-1 text-success">
                <ClipboardCheck className="size-3.5" aria-hidden="true" />
                Reviewed by {update.reviewedByName ?? "someone"} · {formatDateTime(update.reviewedAt)}
              </span>
            ) : (
              <span>Not yet reviewed</span>
            )}
          </div>
        )}
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
