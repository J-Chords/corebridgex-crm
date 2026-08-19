"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProject } from "@/lib/data/hooks/use-projects";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompany } from "@/lib/data/hooks/use-companies";
import { canCreateWorkstreamInProject, canManageProjects } from "@/lib/data/permissions";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { WorkstreamStatusBadge } from "@/components/workstreams/workstream-status-badge";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectRenewalDialog } from "@/components/projects/project-renewal-dialog";
import { TaskRowList } from "@/components/tasks/task-row";
import { cn } from "@/lib/utils";
import { getInitials as initials } from "@/lib/initials";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

type TabKey = "overview" | "tasks" | "services" | "team";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "services", label: "Services" },
  { key: "team", label: "Team" },
];

/**
 * The first real Project workspace (Phase 8B) — Employee-first: this is the operational Client
 * workspace Employee/Supervisor actually use day to day, replacing the Company admin pages they
 * no longer see. Deliberately no Contacts/Company-admin-metadata/Company-edit-controls anywhere
 * on this page — that stays on the Company admin pages, Superadmin-only. Time/Reports/History
 * tabs are deferred (would need fake placeholders to show anything meaningful right now) — see
 * docs/current-project-state.md's Phase 8B notes.
 */
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const { project, isLoading, notFound, refresh } = useProject(id);
  const { workstreams, isLoading: workstreamsLoading, refresh: refreshWorkstreams } = useWorkstreams({ projectId: id });
  const { tasks, isLoading: tasksLoading } = useTasks({ workstreamIds: workstreams.map((w) => w.id) });
  const { company } = useCompany(project?.companyId ?? "");
  const [tab, setTab] = useState<TabKey>("overview");
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

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

  const canAddService = canCreateWorkstreamInProject(
    user,
    { companyId: project.companyId, ownerId: project.ownerId, memberUserIds: project.members.map((m) => m.id) },
    // canCreateWorkstreamInProject only needs allUsers for the (unused, since Supervisor/Superadmin
    // short-circuit and Employee only ever checks self/membership) managesUser lookups — the
    // Project's own already-resolved member list is the exact right scope for that check.
    project.members
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/projects" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to projects
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.companyName}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageProjects(user) && (
            <>
              <Button size="sm" variant="outline" onClick={() => setRenewOpen(true)}>
                <RefreshCw /> Renew Project
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit Project
              </Button>
            </>
          )}
          <ProjectStatusBadge status={project.status} />
        </div>
      </div>

      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
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
      )}

      {tab === "tasks" && (
        <Card>
          <CardContent className="pt-6">
            <TaskRowList
              tasks={tasks}
              isLoading={tasksLoading}
              emptyMessage="No tasks yet for this project."
              subtitleFor={(task) => `${task.workstream.name}${task.activity ? ` · ${task.activity.name}` : ""}`}
            />
          </CardContent>
        </Card>
      )}

      {tab === "services" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            {canAddService && company && (
              <Button size="sm" onClick={() => setAddServiceOpen(true)}>
                <Plus /> Add Service
              </Button>
            )}
          </div>
          {!workstreamsLoading && workstreams.length === 0 && (
            <p className="text-sm text-muted-foreground">No services yet for this project.</p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {workstreams.map((workstream) => (
              <Link key={workstream.id} href={`/dashboard/workstreams/${workstream.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {workstreamDisplayHeading(workstream.name, workstream.serviceLine?.name ?? null)}
                    </CardTitle>
                    <WorkstreamStatusBadge status={workstream.status} />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">
                      Lead: {workstream.lead.fullName} · {workstream.activities.length} activit
                      {workstream.activities.length === 1 ? "y" : "ies"}
                    </p>
                    <ChecklistProgress
                      done={workstream.doneTaskCount}
                      total={workstream.taskCount}
                      emptyLabel="No tasks yet"
                    />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === "team" && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {project.members.length === 0 && (
              <p className="text-sm text-muted-foreground">No members recorded for this project yet.</p>
            )}
            {project.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials(member.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {member.fullName}
                    {member.id === project.ownerId && " (Owner)"}
                  </span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {company && (
        <WorkstreamFormDialog
          open={addServiceOpen}
          onOpenChange={setAddServiceOpen}
          mode="create"
          company={company}
          projectId={project.id}
          onSaved={() => {
            refreshWorkstreams();
            refresh();
          }}
        />
      )}

      {canManageProjects(user) && (
        <>
          <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" project={project} onSaved={refresh} />
          <ProjectRenewalDialog
            open={renewOpen}
            onOpenChange={setRenewOpen}
            project={project}
            onRenewed={(newProject) => router.push(`/dashboard/projects/${newProject.id}`)}
          />
        </>
      )}
    </div>
  );
}
