"use client";

import type { ProjectIssue, ProjectIssueStatus } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
}

interface ProjectIssuesSectionProps {
  issues: ProjectIssue[];
  workstreams: IssueWorkstreamOption[];
}

/**
 * MVP Gap Closure (boss feedback) — Comments is now the ONE active Project communication concept
 * ("if someone has something to say, they can use Comments"); new Issue creation and status
 * progression are retired from the normal product UI. Any Issue records created before this pass
 * stay fully readable as historical context — never destroyed — but this section is now strictly
 * read-only (a plain status Badge, no "Report Issue" button, no status-change control) and renders
 * nothing at all when a Project has no Issue history, so a typical Project shows no trace of a
 * second, separate "Issues product." The underlying `projectIssuesProvider`/RLS are untouched.
 */
export function ProjectIssuesSection({ issues, workstreams }: ProjectIssuesSectionProps) {
  if (issues.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historical Issues</CardTitle>
        <p className="text-xs text-muted-foreground">
          Read-only record from before Issues were folded into Comments — nothing new can be added here.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {issues.map((issue, i) => {
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
                <Badge variant={STATUS_VARIANT[issue.status]}>{STATUS_ITEMS[issue.status]}</Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
