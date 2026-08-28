"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, PauseCircle, PlayCircle, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { canManageProjects, isSuperadmin } from "@/lib/data/permissions";
import type { ProjectStatus } from "@/lib/data/types";
import { addDays, formatDateOnly, formatMonthLabel, startOfMonth } from "@/lib/planner-dates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { operationalProjectIdentity } from "@/lib/data/project-display";
import { PROJECT_STATUS_COLOR_VAR, PROJECT_STATUS_META } from "@/components/projects/project-status-badge";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { cn } from "@/lib/utils";
import { getInitials as initials } from "@/lib/initials";

const PROJECT_STATUS_ORDER: ProjectStatus[] = ["active", "on-hold", "completed", "cancelled"];
const PROJECT_STATUS_ICONS: Record<ProjectStatus, typeof PlayCircle> = {
  active: PlayCircle,
  "on-hold": PauseCircle,
  completed: CheckCircle2,
  cancelled: Ban,
};

const DAY_WIDTH = 34;

type ProjectScheduleState =
  | { kind: "window"; startIndex: number; span: number }
  | { kind: "deadlines"; entries: { index: number; count: number }[] }
  | { kind: "start-markers"; indices: number[] }
  | { kind: "no-schedule" }
  | { kind: "out-of-range" };

/**
 * Phase 13B final pass — derives a Project's high-level schedule from its own visible Tasks'
 * `startDate`/`dueDate` only (never `createdAt`/`statusChangedAt`/contract dates). "Window" (Case
 * A) spans the earliest to latest of EVERY date found across the Project's Tasks, but only when
 * both some Start and some Due dates exist somewhere in the set — a real range, not a guess.
 * Due-only Tasks (Case B) become compact one-day deadline blocks (never a fabricated multi-day
 * span); start-only Tasks (Case C) become thin start markers; no dates anywhere (Case D) is
 * "No task schedule"; real dates outside the visible month (Case E) render nothing, never
 * "unscheduled."
 */
function computeProjectScheduleState(projectTasks: TaskWithRelations[], days: Date[]): ProjectScheduleState {
  const monthStartStr = formatDateOnly(days[0]);
  const monthEndStr = formatDateOnly(days[days.length - 1]);
  const starts = projectTasks.map((t) => t.startDate).filter((d): d is string => !!d);
  const dues = projectTasks.map((t) => t.dueDate).filter((d): d is string => !!d);

  if (starts.length === 0 && dues.length === 0) return { kind: "no-schedule" };

  if (starts.length > 0 && dues.length > 0) {
    const all = [...starts, ...dues];
    const minDate = all.reduce((a, b) => (b < a ? b : a));
    const maxDate = all.reduce((a, b) => (b > a ? b : a));
    if (maxDate < monthStartStr || minDate > monthEndStr) return { kind: "out-of-range" };
    const clippedStartStr = minDate < monthStartStr ? monthStartStr : minDate;
    const clippedEndStr = maxDate > monthEndStr ? monthEndStr : maxDate;
    const startIndex = days.findIndex((d) => formatDateOnly(d) === clippedStartStr);
    const endIndex = days.findIndex((d) => formatDateOnly(d) === clippedEndStr);
    if (startIndex === -1 || endIndex === -1) return { kind: "out-of-range" };
    return { kind: "window", startIndex, span: endIndex - startIndex + 1 };
  }

  if (dues.length > 0) {
    const counts = new Map<string, number>();
    for (const d of dues) counts.set(d, (counts.get(d) ?? 0) + 1);
    const entries = Array.from(counts.entries())
      .filter(([d]) => d >= monthStartStr && d <= monthEndStr)
      .map(([d, count]) => ({ index: days.findIndex((x) => formatDateOnly(x) === d), count }))
      .filter((e) => e.index !== -1);
    return entries.length > 0 ? { kind: "deadlines", entries } : { kind: "out-of-range" };
  }

  const uniqueStarts = Array.from(new Set(starts)).filter((d) => d >= monthStartStr && d <= monthEndStr);
  const indices = uniqueStarts.map((d) => days.findIndex((x) => formatDateOnly(x) === d)).filter((i) => i !== -1);
  return indices.length > 0 ? { kind: "start-markers", indices } : { kind: "out-of-range" };
}

/**
 * Phase 8E — Superadmin-only "+ New Project" alongside the existing read-only list/search.
 * Redesigned Phase 13B, then merged in the final visual polish pass: one integrated Project
 * table + timeline per status group — a dense Project row (Project/Services/Open Tasks/Team) on
 * the left, its own task-derived Gantt row aligned directly across from it on the right. No
 * separate List/Gantt mode — the Project browser IS the combined list+timeline (Reference 1: local
 * `references/phase-13b/project-workspace-reference.png.png`). The Gantt is derived entirely from
 * the same role-scoped Tasks used everywhere else in the app (never Project contract dates, never
 * fabricated). The detailed per-Task Gantt still lives on each Project's own Tasks → Timeline. The
 * permanently-seeded Internal/Non-billable Project is excluded from normal Employee/Supervisor
 * browsing here (it isn't real client delivery work) while its underlying fallback behavior stays
 * fully intact — see docs/phase-13b-project-workspace-history-spec.md.
 */
export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, isLoading, refresh } = useProjects();
  const { tasks } = useTasks();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ProjectStatus>>(new Set());
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const superadmin = !!user && isSuperadmin(user);

  // Employee/Supervisor never see the Internal/Non-billable Project as an ordinary row here — it
  // isn't real client delivery work. Superadmin keeps it visible (still distinguished, see the row
  // rendering below) since they're the audience who administers/understands it.
  const browsableProjects = useMemo(
    () => (superadmin ? projects : projects.filter((p) => !p.isInternal)),
    [projects, superadmin]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return browsableProjects;
    return browsableProjects.filter((p) => p.name.toLowerCase().includes(query) || p.companyName.toLowerCase().includes(query));
  }, [browsableProjects, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<ProjectStatus, number> = { active: 0, "on-hold": 0, completed: 0, cancelled: 0 };
    for (const p of browsableProjects) counts[p.status] += 1;
    return counts;
  }, [browsableProjects]);

  const groups = useMemo(() => {
    const byStatus = new Map<ProjectStatus, ProjectWithRelations[]>();
    for (const status of PROJECT_STATUS_ORDER) byStatus.set(status, []);
    for (const p of filtered) byStatus.get(p.status)?.push(p);
    return PROJECT_STATUS_ORDER.map((status) => ({ status, projects: byStatus.get(status) ?? [] })).filter(
      (g) => g.projects.length > 0
    );
  }, [filtered]);

  // Only the currently-visible viewer's own already-role-scoped Tasks — never a broader fetch. No
  // Task RLS/provider change of any kind was needed to build this.
  const tasksByProject = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    for (const t of tasks) {
      const projectId = t.workstream.projectId;
      if (!projectId) continue;
      const list = map.get(projectId) ?? [];
      list.push(t);
      map.set(projectId, list);
    }
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => addDays(monthCursor, i));
  }, [monthCursor]);

  function toggleGroup(status: ProjectStatus) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function stepMonth(delta: number) {
    setMonthCursor((prev) => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() + delta, 1)));
  }

  // Deep-links straight to Tasks → Timeline — the stable mechanism already implemented on the
  // Project detail page (`?tab=tasks&view=timeline`, seeded via lazy useState initializers).
  function openProject(id: string) {
    router.push(`/dashboard/projects/${id}?tab=tasks&view=timeline`);
  }

  if (!user) return null;

  const canCreate = canManageProjects(user);

  return (
    <div className="flex flex-col gap-4">
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
                : "Every project across the org."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New Project
          </Button>
        )}
      </div>

      {/* Status summary strip — Corebridge's real 4-value ProjectStatus enum. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROJECT_STATUS_ORDER.map((status) => {
          const Icon = PROJECT_STATUS_ICONS[status];
          const color = PROJECT_STATUS_COLOR_VAR[status];
          return (
            <Card key={status} className="flex-row items-center gap-2.5 p-3">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: `color-mix(in oklch, ${color} 16%, var(--card))`, color }}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs text-muted-foreground">{PROJECT_STATUS_META[status].label}</span>
                <span className="text-lg leading-tight font-semibold">{statusCounts[status]}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="relative min-w-48 max-w-sm">
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

      {!isLoading && groups.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">No projects match your search.</Card>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <ProjectWorkspaceGroup
            key={group.status}
            status={group.status}
            projects={group.projects}
            tasksByProject={tasksByProject}
            days={days}
            monthCursor={monthCursor}
            onStepMonth={stepMonth}
            isCollapsed={collapsedGroups.has(group.status)}
            onToggleCollapse={() => toggleGroup(group.status)}
            onOpenProject={openProject}
          />
        ))}
      </div>

      {canCreate && (
        <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" onSaved={refresh} />
      )}
    </div>
  );
}

function TeamAvatars({ project }: { project: ProjectWithRelations }) {
  if (project.members.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = project.members.slice(0, 3);
  const overflow = project.members.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((m) => (
        <Avatar key={m.id} size="sm" className="ring-2 ring-card">
          <AvatarFallback className="text-[0.65rem]">{initials(m.fullName)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="z-10 flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground ring-2 ring-card">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function ProjectIdentity({ project }: { project: ProjectWithRelations }) {
  // Phase 13B final boss-feedback pass — daily operational identity is the Company name, not the
  // date-ranged Project name (`operationalProjectIdentity`'s `primary`); a meaningful non-redundant
  // Project label is still available via `title` for anyone who needs to disambiguate on hover.
  const identity = operationalProjectIdentity(project.companyName, project.name);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CompanyProjectAvatar companyId={project.companyId} companyName={project.companyName} size="sm" isInternal={project.isInternal} />
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn("truncate font-medium", project.isInternal && "text-muted-foreground")}
          title={identity.secondary ?? undefined}
        >
          {identity.primary}
        </span>
        {project.isInternal && (
          <Badge variant="neutral" className="shrink-0 text-[10px]">
            System
          </Badge>
        )}
      </span>
    </span>
  );
}

/**
 * The one integrated Project browser row: LEFT (Project/Services/Open Tasks/Team, the same dense
 * columns the plain list always had) and RIGHT (the task-derived Gantt) in the same row — never a
 * separate List/Gantt mode. Each Project's left row and right timeline row share the same index in
 * the same `projects` array and the same fixed row height, so they always align exactly.
 */
function ProjectWorkspaceGroup({
  status,
  projects,
  tasksByProject,
  days,
  monthCursor,
  onStepMonth,
  isCollapsed,
  onToggleCollapse,
  onOpenProject,
}: {
  status: ProjectStatus;
  projects: ProjectWithRelations[];
  tasksByProject: Map<string, TaskWithRelations[]>;
  days: Date[];
  monthCursor: Date;
  onStepMonth: (delta: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenProject: (id: string) => void;
}) {
  const color = PROJECT_STATUS_COLOR_VAR[status];
  const timelineWidth = days.length * DAY_WIDTH;

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!isCollapsed}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 8%, var(--card))` }}
      >
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", isCollapsed && "-rotate-90")}
          aria-hidden="true"
        />
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="text-sm font-medium">{PROJECT_STATUS_META[status].label}</span>
        <span className="font-mono text-xs text-muted-foreground">{projects.length}</span>
      </button>

      {!isCollapsed && (
        <div className="flex flex-col sm:flex-row">
          {/* LEFT — Project identity + Services/Open Tasks/Team, unchanged from the original list. */}
          <div className="min-w-0 flex-1 divide-y sm:border-r">
            <div className="grid h-11 grid-cols-[1fr_72px_84px_90px] items-center gap-2 border-b px-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              <span>Project</span>
              <span>Services</span>
              <span>Open tasks</span>
              <span>Team</span>
            </div>
            {projects.map((project) => (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProject(project.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenProject(project.id);
                  }
                }}
                className={cn(
                  "grid h-10 cursor-pointer grid-cols-[1fr_72px_84px_90px] items-center gap-2 px-3 text-sm transition-colors hover:bg-muted/50",
                  project.isInternal && "bg-muted/20"
                )}
              >
                <ProjectIdentity project={project} />
                <span className="text-xs text-muted-foreground">{project.workstreamCount}</span>
                <span className="text-xs text-muted-foreground">{project.tasks.openCount}</span>
                <TeamAvatars project={project} />
              </div>
            ))}
          </div>

          {/* RIGHT — same row, same order, aligned index-for-index: the task-derived Gantt. Its own
              month header attached directly to the timeline (never a page-level control detached
              from what it drives). Horizontal scroll keeps a full 28–31-day month legible at any
              width — never squeezed. */}
          <div className="flex shrink-0 flex-col sm:w-[520px]">
            <div className="flex h-11 items-center justify-between gap-1 border-b px-2">
              <Button size="icon-sm" variant="ghost" onClick={() => onStepMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <span className="text-xs font-medium">{formatMonthLabel(monthCursor)}</span>
              <Button size="icon-sm" variant="ghost" onClick={() => onStepMonth(1)} aria-label="Next month">
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="overflow-x-auto">
              <div style={{ width: timelineWidth }}>
                <div className="flex h-10 items-center border-b">
                  {days.map((d) => {
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={formatDateOnly(d)}
                        className={cn("flex h-full flex-col items-center justify-center border-r", weekend && "bg-muted/30")}
                        style={{ width: DAY_WIDTH }}
                      >
                        <span className="text-[9px] text-muted-foreground/70">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                        <span className="text-[10px] font-medium">{String(d.getDate()).padStart(2, "0")}</span>
                      </div>
                    );
                  })}
                </div>
                {projects.map((project) => {
                  const schedule = computeProjectScheduleState(tasksByProject.get(project.id) ?? [], days);
                  const barLabel = operationalProjectIdentity(project.companyName, project.name).primary;
                  return (
                    <div key={project.id} className="relative flex h-10 border-t">
                      {days.map((d) => {
                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div
                            key={formatDateOnly(d)}
                            className={cn("h-full border-r border-border/50", weekend && "bg-muted/20")}
                            style={{ width: DAY_WIDTH }}
                          />
                        );
                      })}
                      {schedule.kind === "window" && (
                        <button
                          type="button"
                          onClick={() => onOpenProject(project.id)}
                          aria-label={`${project.name} — scheduled Task work spans this period`}
                          title={`${project.name} — scheduled Task work spans this period (not a contract period)`}
                          className="absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md px-1.5 text-left text-[10px] font-medium whitespace-nowrap text-ellipsis"
                          style={{
                            left: schedule.startIndex * DAY_WIDTH + 2,
                            width: Math.max(schedule.span * DAY_WIDTH - 4, DAY_WIDTH - 4),
                            backgroundColor: `color-mix(in oklch, ${color} 30%, var(--card))`,
                            borderColor: `color-mix(in oklch, ${color} 60%, transparent)`,
                            color: `color-mix(in oklch, ${color} 80%, var(--foreground))`,
                            borderWidth: 1,
                          }}
                        >
                          {barLabel}
                        </button>
                      )}
                      {schedule.kind === "deadlines" &&
                        schedule.entries.map((entry) => (
                          <button
                            key={entry.index}
                            type="button"
                            onClick={() => onOpenProject(project.id)}
                            aria-label={`${project.name} — ${entry.count} Task${entry.count === 1 ? "" : "s"} due this day`}
                            title={`${project.name} — ${formatDateOnly(days[entry.index])} — ${entry.count} Task${entry.count === 1 ? "" : "s"} due`}
                            className="absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md px-1 text-center text-[10px] font-medium whitespace-nowrap text-ellipsis"
                            style={{
                              left: entry.index * DAY_WIDTH + 2,
                              width: DAY_WIDTH - 4,
                              backgroundColor: `color-mix(in oklch, ${color} 30%, var(--card))`,
                              borderColor: `color-mix(in oklch, ${color} 60%, transparent)`,
                              color: `color-mix(in oklch, ${color} 80%, var(--foreground))`,
                              borderWidth: 1,
                            }}
                          >
                            {entry.count}
                          </button>
                        ))}
                      {schedule.kind === "start-markers" &&
                        schedule.indices.map((index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => onOpenProject(project.id)}
                            aria-label={`${project.name} — Task work starts this day`}
                            title={`${project.name} — Task work starts this day`}
                            className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full"
                            style={{ left: index * DAY_WIDTH + 2, backgroundColor: color }}
                          />
                        ))}
                      {schedule.kind === "no-schedule" && (
                        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] whitespace-nowrap text-muted-foreground/60">
                          No task schedule
                        </span>
                      )}
                      {/* "out-of-range": renders nothing — real Task dates exist, just not in the
                          selected month; never mislabeled "No task schedule." */}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
