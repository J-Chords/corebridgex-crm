"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { useTaskReuseCandidates } from "@/lib/data/hooks/use-tasks";
import type { TaskReuseCandidate } from "@/lib/data/providers/tasks-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ReusePastTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityId: string;
  activityLabel: string;
  excludeTaskId?: string;
  onSelect: (candidate: TaskReuseCandidate, copyDescription: boolean) => void;
}

/**
 * On-demand "reuse from past" picker — recent completed tasks tagged to the same activity.
 * Selecting one replaces the current checklist draft with fresh, unchecked copies of its items;
 * nothing here is applied until the user explicitly picks a candidate.
 */
export function ReusePastTaskDialog({
  open,
  onOpenChange,
  activityId,
  activityLabel,
  excludeTaskId,
  onSelect,
}: ReusePastTaskDialogProps) {
  const { candidates, isLoading } = useTaskReuseCandidates(open ? activityId : null, excludeTaskId);
  const [copyDescription, setCopyDescription] = useState(false);

  function handleUse(candidate: TaskReuseCandidate) {
    onSelect(candidate, copyDescription);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reuse from past</DialogTitle>
          <DialogDescription>
            Recent completed tasks tagged to <span className="font-medium text-foreground">{activityLabel}</span>.
            Selecting one replaces this task&apos;s checklist with an editable copy — you can still
            add, edit, or remove items before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={copyDescription} onCheckedChange={(checked) => setCopyDescription(checked === true)} />
            Also copy description
          </label>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past examples yet for this activity.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{candidate.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {candidate.companyName} · Completed {formatDate(candidate.completedAt)} ·{" "}
                      {candidate.checklistItemDescriptions.length} checklist item
                      {candidate.checklistItemDescriptions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <Button type="button" size="sm" className="shrink-0" onClick={() => handleUse(candidate)}>
                    <History /> Use this
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
