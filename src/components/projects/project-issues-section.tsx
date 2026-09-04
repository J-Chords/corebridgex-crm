"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { projectIssuesProvider } from "@/lib/data/providers";
import type { ProjectIssue, ProjectIssueStatus } from "@/lib/data/types";
import { canProgressProjectIssue } from "@/lib/data/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToastManager } from "@/components/ui/toast";

const STATUS_ITEMS: Record<ProjectIssueStatus, string> = {
  open: "Open",
  "in-progress": "In Progress",
  resolved: "Resolved",
  cancelled: "Canceled",
};
const STATUS_VARIANT: Record<ProjectIssueStatus, "neutral" | "info" | "success" | "destructive"> = {
  open: "neutral",
  "in-progress": "info",
  resolved: "success",
  cancelled: "destructive",
};

interface IssueWorkstreamOption {
  id: string;
  name: string;
  activities: { id: string; name: string }[];
}

interface ProjectIssuesSectionProps {
  projectId: string;
  issues: ProjectIssue[];
  workstreams: IssueWorkstreamOption[];
  onChanged: () => void;
}

/** Project Level Stage C — a real concept distinct from a blocked Task; may stand alone or point
 * at a Service. Any legitimate Project viewer can report one; only the reporter, the assignee, or
 * an Admin may progress its status. */
export function ProjectIssuesSection({ projectId, issues, workstreams, onChanged }: ProjectIssuesSectionProps) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workstreamId, setWorkstreamId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const selectedWorkstream = workstreams.find((w) => w.id === workstreamId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !user) return;
    setIsSubmitting(true);
    try {
      await projectIssuesProvider.createIssue(user, projectId, {
        title: title.trim(),
        description: description.trim() || null,
        workstreamId: workstreamId || null,
        activityId: workstreamId ? activityId || null : null,
        taskId: null,
        assignedToId: null,
      });
      setTitle("");
      setDescription("");
      setWorkstreamId("");
      setActivityId("");
      setCreateOpen(false);
      onChanged();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't create issue." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetStatus(issue: ProjectIssue, status: ProjectIssueStatus) {
    if (!user) return;
    try {
      await projectIssuesProvider.setIssueStatus(user, issue.id, status);
      onChanged();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update issue." });
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base">Issues</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> Report Issue
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues reported for this project.</p>
          ) : (
            issues.map((issue, i) => {
              const canProgress = canProgressProjectIssue(user, issue);
              const service = workstreams.find((w) => w.id === issue.workstreamId);
              return (
                <div key={issue.id}>
                  {i > 0 && <Separator className="my-3" />}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{issue.title}</span>
                      {issue.description && <span className="text-xs text-muted-foreground">{issue.description}</span>}
                      <span className="text-xs text-muted-foreground">
                        Reported by {issue.createdByName}
                        {service ? ` · ${service.name}` : ""}
                        {issue.activityName ? ` · ${issue.activityName}` : ""}
                        {issue.assignedToName ? ` · Assigned to ${issue.assignedToName}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {canProgress ? (
                        <Select
                          items={STATUS_ITEMS}
                          value={issue.status}
                          onValueChange={(v) => v && handleSetStatus(issue, v as ProjectIssueStatus)}
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_ITEMS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={STATUS_VARIANT[issue.status]}>{STATUS_ITEMS[issue.status]}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Report an issue</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-title">Title</Label>
              <Input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-description">Description</Label>
              <Textarea id="issue-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            {workstreams.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-service">Related Service (optional)</Label>
                <Select
                  items={{ "": "None", ...Object.fromEntries(workstreams.map((w) => [w.id, w.name])) }}
                  value={workstreamId}
                  onValueChange={(v) => {
                    setWorkstreamId(v ?? "");
                    setActivityId("");
                  }}
                >
                  <SelectTrigger id="issue-service" className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {workstreams.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedWorkstream && selectedWorkstream.activities.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-activity">Related Activity (optional)</Label>
                <Select
                  items={{ "": "None", ...Object.fromEntries(selectedWorkstream.activities.map((a) => [a.id, a.name])) }}
                  value={activityId}
                  onValueChange={(v) => setActivityId(v ?? "")}
                >
                  <SelectTrigger id="issue-activity" className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {selectedWorkstream.activities.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || isSubmitting}>
                {isSubmitting ? "Saving…" : "Report issue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
