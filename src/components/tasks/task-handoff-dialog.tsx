"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { taskHandoffsProvider } from "@/lib/data/providers";
import type { User } from "@/lib/data/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaskHandoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  onHandedOff: () => void;
}

const EMPTY_FORM = {
  handedToId: "",
  workDone: "",
  workRemaining: "",
  blockers: "",
};

export function TaskHandoffDialog({ open, onOpenChange, taskId, onHandedOff }: TaskHandoffDialogProps) {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<User[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setForm(EMPTY_FORM);
    taskHandoffsProvider.listHandoffCandidates(user, taskId).then(setCandidates);
  }, [open, user, taskId]);

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await taskHandoffsProvider.createHandoff(user, taskId, {
        handedToId: form.handedToId,
        workDone: form.workDone.trim(),
        workRemaining: form.workRemaining.trim(),
        blockers: form.blockers.trim() || null,
      });
      onHandedOff();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to hand off this task.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = Boolean(form.handedToId && form.workDone.trim() && form.workRemaining.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Hand off this task</DialogTitle>
            <DialogDescription>
              Capture where you left off — {user.fullName} will be recorded as handing this off.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handoff-recipient">Hand off to</Label>
              <Select
                items={Object.fromEntries(candidates.map((c) => [c.id, c.fullName]))}
                value={form.handedToId}
                onValueChange={(v) => setForm((p) => ({ ...p, handedToId: v ?? "" }))}
              >
                <SelectTrigger id="handoff-recipient" className="w-full">
                  <SelectValue placeholder="Select a person" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {candidates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No one else currently has access to this task to hand off to.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handoff-work-done">Work done so far</Label>
              <Textarea
                id="handoff-work-done"
                rows={3}
                required
                value={form.workDone}
                onChange={(e) => setForm((p) => ({ ...p, workDone: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handoff-work-remaining">Work remaining</Label>
              <Textarea
                id="handoff-work-remaining"
                rows={3}
                required
                value={form.workRemaining}
                onChange={(e) => setForm((p) => ({ ...p, workRemaining: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handoff-blockers">Blockers (optional)</Label>
              <Textarea
                id="handoff-blockers"
                rows={2}
                value={form.blockers}
                onChange={(e) => setForm((p) => ({ ...p, blockers: e.target.value }))}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? "Handing off…" : "Hand off task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
