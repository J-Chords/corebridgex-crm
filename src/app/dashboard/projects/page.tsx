"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { canManageProjects } from "@/lib/data/permissions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { workstreamCompactLabel } from "@/lib/data/workstream-name";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

/** Compact "N of M" + up-to-2-name overflow — the Project list needed to surface Service presence at all, never the full Activity hierarchy per row. Each pill truncates properly (never mid-word/symmetric clipping — the label lives in its own min-w-0 span so the Badge's own ellipsis math has something to actually shrink) and exposes its full name via tooltip. */
function ServiceSummary({ services }: { services: { id: string; name: string }[] }) {
  if (services.length === 0) {
    return <span className="text-xs text-muted-foreground">No services yet</span>;
  }
  const shown = services.slice(0, 2);
  const overflow = services.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((s) => {
        const compact = workstreamCompactLabel(s.name);
        return (
          <Tooltip key={s.id}>
            <TooltipTrigger render={<Badge variant="neutral" className="max-w-40 cursor-help" />}>
              <span className="min-w-0 truncate">{compact}</span>
            </TooltipTrigger>
            <TooltipContent>{s.name}</TooltipContent>
          </Tooltip>
        );
      })}
      {overflow > 0 && <Badge variant="neutral">+{overflow} more</Badge>}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function contractPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/**
 * Phase 8E — Superadmin-only "+ New Project" (Section 22) alongside the existing read-only
 * list/search. Employee/Supervisor still see this page exactly as before (read-only, scoped to
 * their own accessible Projects) — creation is additive, never a redesign of the base list.
 */
export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, isLoading, refresh } = useProjects();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(query) || p.companyName.toLowerCase().includes(query));
  }, [projects, search]);

  if (!user) return null;

  const canCreate = canManageProjects(user);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "employee"
              ? "Projects you're a member of."
              : user.role === "supervisor"
                ? "Projects you and your team work in."
                : "Every client engagement across the org."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New Project
          </Button>
        )}
      </div>

      <Card className="min-w-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 p-4">
          <div className="relative flex-1 min-w-48">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="pl-8"
              aria-label="Search projects"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Project</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Services</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Contract period</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Owner</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Status</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Progress</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Open tasks</TableHead>
              <TableHead className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Overdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No projects match your search.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((project, i) => (
              <TableRow
                key={project.id}
                className={cn("cursor-pointer", STAGGER_ITEM_CLASS)}
                style={staggerDelay(i)}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              >
                <TableCell className="max-w-64 font-medium whitespace-normal">
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.name}
                  </Link>
                  <p className="text-xs font-normal text-muted-foreground">{project.companyName}</p>
                </TableCell>
                <TableCell className="max-w-64">
                  <ServiceSummary services={project.services} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {contractPeriod(project.contractStartDate, project.contractEndDate)}
                </TableCell>
                <TableCell className="text-muted-foreground">{project.owner.fullName}</TableCell>
                <TableCell>
                  <ProjectStatusBadge status={project.status} />
                </TableCell>
                <TableCell className="min-w-32">
                  <ChecklistProgress done={project.tasks.doneCount} total={project.tasks.totalCount} emptyLabel="No tasks yet" />
                </TableCell>
                <TableCell className="text-muted-foreground">{project.tasks.openCount}</TableCell>
                <TableCell className={project.tasks.overdueCount > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                  {project.tasks.overdueCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {canCreate && (
        <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" onSaved={refresh} />
      )}
    </div>
  );
}
