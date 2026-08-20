import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClientReportHistoryEvent } from "@/lib/data/types";

const EVENT_LABEL: Record<ClientReportHistoryEvent["type"], string> = {
  finalized: "Finalized",
  reopened: "Reopened",
  "re-finalized": "Re-finalized",
  "generation-warning": "Generation note",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface ClientReportHistoryProps {
  events: ClientReportHistoryEvent[];
}

/**
 * Plain integrity log — same shape as the internal report's ReportHistory, with one deliberate
 * difference: `print:hidden` here. Every event carries a staff `actorName" ("Finalized by ...") —
 * fine on the staff-only editing screen, but it must never appear in what actually goes to the client.
 *
 * `"generation-warning"` events (Phase 9D — e.g. a completed Task with no legitimate tracked time,
 * omitted rather than given a fabricated Duration) render their `message` instead of the usual
 * "{label} by {actorName}" line, since the useful content there is what happened, not who generated
 * the report. Internal-only by the same `print:hidden` boundary as the rest of this log — never part
 * of the client-facing document.
 */
export function ClientReportHistory({ events }: ClientReportHistoryProps) {
  if (events.length === 0) return null;

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="text-base">History</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {events.map((event) =>
            event.type === "generation-warning" ? (
              <li key={event.id} className="text-sm text-amber-600 dark:text-amber-500">
                {event.message} · {formatDateTime(event.createdAt)}
              </li>
            ) : (
              <li key={event.id} className="text-sm text-muted-foreground">
                {EVENT_LABEL[event.type]} by {event.actorName} · {formatDateTime(event.createdAt)}
              </li>
            )
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
