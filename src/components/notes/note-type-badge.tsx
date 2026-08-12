import { Badge } from "@/components/ui/badge";
import type { NoteType } from "@/lib/data/types";

const TYPE_META: Record<NoteType, { label: string; variant: "success" | "info" | "warning" | "neutral" }> = {
  call: { label: "Call", variant: "info" },
  meeting: { label: "Meeting", variant: "neutral" },
  internal: { label: "Internal", variant: "warning" },
  decision: { label: "Decision", variant: "success" },
};

export function NoteTypeBadge({ type }: { type: NoteType }) {
  const meta = TYPE_META[type];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** value->label map for Select `items` — lets SelectValue resolve the label immediately, without waiting for the popup to mount once. */
export const NOTE_TYPE_SELECT_ITEMS: Record<NoteType, string> = Object.fromEntries(
  Object.entries(TYPE_META).map(([value, meta]) => [value, meta.label])
) as Record<NoteType, string>;
