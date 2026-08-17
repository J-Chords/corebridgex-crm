"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProject } from "@/lib/data/hooks/use-projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Deliberately minimal (Phase 8A) — no tabs, no Contacts, no Company administrative metadata, no
 * Company edit controls. The full tabbed Project workspace (Overview/Tasks/Services/Team/Time/
 * Reports/History) is Phase 8B. This exists only so `getProject`'s RLS/hydration path can be
 * manually verified alongside the list page.
 */
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { project, isLoading, notFound } = useProject(id);

  if (!user) return null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !project) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/projects" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to projects
        </Link>
        <p className="text-sm text-muted-foreground">
          This project doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/projects" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to projects
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.companyName}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Contract start</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium">{formatDate(project.contractStartDate)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Contract end</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium">{formatDate(project.contractEndDate)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Owner</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium">{project.owner.fullName}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Team</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium">
            {project.memberCount} member{project.memberCount === 1 ? "" : "s"}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Services</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{project.workstreamCount}</p>
            <p className="text-sm text-muted-foreground">
              service{project.workstreamCount === 1 ? "" : "s"} under this project
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ChecklistProgress done={project.tasks.doneCount} total={project.tasks.totalCount} emptyLabel="No tasks yet" />
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{project.tasks.openCount} open</span>
              <span className={project.tasks.overdueCount > 0 ? "font-medium text-destructive" : undefined}>
                {project.tasks.overdueCount} overdue
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {project.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{project.description}</CardContent>
        </Card>
      )}
    </div>
  );
}
