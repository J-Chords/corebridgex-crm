import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccomplishmentsReportHistoryEvent } from "@/lib/data/types";

const EVENT_LABEL: Record<AccomplishmentsReportHistoryEvent["type"], string> = {
  finalized: "Finalized",
  reopened: "Reopened",
  "re-finalized": "Re-finalized",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface ReportHistoryProps {
  events: AccomplishmentsReportHistoryEvent[];
}

/** Plain integrity log — finalize/reopen/re-finalize events, oldest first. No version-diffing, just who+when. */
export function ReportHistory({ events }: ReportHistoryProps) {
  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">History</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {events.map((event) => (
            <li key={event.id} className="text-sm text-muted-foreground">
              {EVENT_LABEL[event.type]} by {event.actorName} · {formatDateTime(event.createdAt)}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
