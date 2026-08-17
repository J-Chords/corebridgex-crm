"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function contractPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/**
 * Phase 8A read-only surface only — no Board view, no creation, no complex filtering (see
 * docs/current-project-state.md's Phase 8A notes). Not yet linked from the sidebar; reached
 * directly at /dashboard/projects for manual testing of the new Project foundation before the
 * Phase 8B navigation migration.
 */
export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, isLoading } = useProjects();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(query) || p.companyName.toLowerCase().includes(query));
  }, [projects, search]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
        Back to dashboard
      </Link>
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
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
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
    </div>
  );
}
