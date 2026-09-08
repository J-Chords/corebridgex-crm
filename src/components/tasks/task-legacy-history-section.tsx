"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { NoteWithAuthor } from "@/lib/data/providers/notes-provider";
import type { TaskHandoffWithUsers } from "@/lib/data/providers/task-handoffs-provider";
import { TaskHandoffSection } from "@/components/tasks/task-handoff-section";
import { NotesSection } from "@/components/notes/notes-section";
import { cn } from "@/lib/utils";

interface TaskLegacyHistorySectionProps {
  taskId: string;
  handoffs: TaskHandoffWithUsers[];
  notes: NoteWithAuthor[];
}

/**
 * Task Level Phase 2, Product Owner acceptance correction — Handoff and Task Notes are both
 * confirmed-retired workflows (Comments is the one canonical Task conversation), so this section is
 * archival only: no create/edit/acknowledge control of any kind, and it renders nothing at all when
 * there's no real history of either kind. Reuses `TaskHandoffSection`/`NotesSection` exactly as-is.
 */
export function TaskLegacyHistorySection({ taskId, handoffs, notes }: TaskLegacyHistorySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const hasHandoffs = handoffs.length > 0;
  const hasNotes = notes.length > 0;

  if (!hasHandoffs && !hasNotes) return null;

  const count = handoffs.length + notes.length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/10 p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", !expanded && "-rotate-90")} aria-hidden="true" />
        Legacy history
        <span className="font-mono text-xs">{count}</span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Historical context only — current Task discussion happens in Comments.
          </p>
          {hasHandoffs && <TaskHandoffSection taskId={taskId} handoffs={handoffs} />}
          {hasNotes && <NotesSection title="Historical notes" notes={notes} emptyMessage="" readOnly />}
        </div>
      )}
    </div>
  );
}
