"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, Ban, CheckCircle2, ChevronDown, PauseCircle, PlayCircle, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProjects, useProjectGroups } from "@/lib/data/hooks/use-projects";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useServiceLineStaffing } from "@/lib/data/hooks/use-service-membership";
import { projectsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { isSuperadmin } from "@/lib/data/permissions";
import type { ProjectStatus } from "@/lib/data/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { operationalProjectIdentity, serviceLineDisplayName } from "@/lib/data/project-display";
import { PROJECT_STATUS_COLOR_VAR, PROJECT_STATUS_META } from "@/components/projects/project-status-badge";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { PeopleInline, type PersonRef } from "@/components/projects/people-inline";
import { cn } from "@/lib/utils";

/** Project Final Integration Correction — all six management-approved statuses are first-class.
 * Archived/Trash remain reachable only to Admin (`canManageProjects`), exactly matching the prior
 * Active/Archived/Trash toggle's own gating — this is a consolidation of that same restriction into
 * one unified status system, never a widening of who can see what. */
const ALL_PROJECT_STATUSES: ProjectStatus[] = ["active", "on-hold", "completed", "cancelled", "archived", "trash"];
const WORKING_PROJECT_STATUSES: ProjectStatus[] = ["active", "on-hold", "completed", "cancelled"];
const PROJECT_STATUS_ICONS: Record<ProjectStatus, typeof PlayCircle> = {
  active: PlayCircle,
  "on-hold": PauseCircle,
  completed: CheckCircle2,
  cancelled: Ban,
  archived: Archive,
  trash: Trash2,
};
/** "all" = every status the viewer's role can reach, grouped — the one unified status filter
 * (Section 3), replacing the old separate Active/Archived/Trash segmented toggle. */
type StatusFilter = "all" | ProjectStatus;

/** Section 13 — ONE `/dashboard/projects` page/route for every role; this only picks which
 * columns the shared row renders, never a separate page or a widened visible Project set. */
type RoleView = "admin" | "team-lead" | "employee";

/** Section 14-16 — per-project figures derived entirely from data already fetched on this page
 * (role-scoped Tasks, existing Service staffing) — never a new fetch, never an invented metric. */
interface RoleRowStats {
  waitingCount: number;
  blockedCount: number;
  myOpenCount: number;
  myOverdueCount: number;
  myNextDue: string | null;
  globalTeamLeads: PersonRef[];
}

/**
 * Phase 8E — Superadmin-only "+ New Project" alongside the existing read-only list/search.
 * Project Manual Acceptance Step 1 — Project List correction: the previous combined list+Gantt
 * timeline (Phase 13B/final visual polish) is removed per explicit product-owner instruction — the
 * visible calendar/Gantt/timeline reclaims no useful information here that isn't already available
 * on a Project's own Tasks → Timeline, and it was squeezing the Project identity column down to
 * near-unreadable at ordinary desktop widths. This is now a plain, full-width operational table —
 * one row per Project, role-conditional columns, no separate List/Gantt mode to maintain.
 * `Project.startDate`/`endDate`/`completionDate` are completely untouched in the data model; only
 * this page's visible presentation changed. See docs/project-level-product-architecture.md.
 */
export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, isLoading, refresh } = useProjects();
  const { tasks } = useTasks();
  const { groups: projectGroups } = useProjectGroups();
  const { serviceLines, assignableStaff } = useCompanyLookups();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // Archived/Trash start collapsed (same "hidden from ordinary browsing by default, reachable on
  // demand" spirit the old separate toggle had) — everything else starts expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ProjectStatus>>(() => new Set(["archived", "trash"]));
  // ONE explicit status filter — "all" groups by every status the viewer's role can reach; picking
  // one narrows to just that status, shown as a flat list (Section 3 — no competing filter systems).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Part 13 — Service/Team Lead/Member/Group/Tag filters, all AND-combined with search and each
  // other. These narrow an already-role-scoped/visible set (`browsableProjects` below) — filtering
  // never widens or alters what a viewer is authorized to see.
  const [serviceLineFilter, setServiceLineFilter] = useState<string>("all");
  const [teamLeadFilter, setTeamLeadFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  const superadmin = !!user && isSuperadmin(user);
  const canCreate = superadmin;
  // Archived/Trash stay reachable only to Admin — the exact same restriction the prior separate
  // Active/Archived/Trash toggle already enforced (that toggle itself was Admin-only), now expressed
  // as which statuses this viewer's role can even select, never a widened visible Project set.
  const visibleStatuses = canCreate ? ALL_PROJECT_STATUSES : WORKING_PROJECT_STATUSES;

  // Employee/Supervisor never see the Internal/Non-billable Project as an ordinary row here — it
  // isn't real client delivery work. Superadmin keeps it visible (still distinguished, see the row
  // rendering below) since they're the audience who administers/understands it.
  const browsableProjects = useMemo(
    () =>
      (superadmin ? projects : projects.filter((p) => !p.isInternal)).filter((p) => visibleStatuses.includes(p.status)),
    [projects, superadmin, visibleStatuses]
  );

  const allServiceLineIds = useMemo(
    () =>
      Array.from(
        new Set(browsableProjects.flatMap((p) => p.services.map((s) => s.serviceLineId).filter((id): id is string => !!id)))
      ),
    [browsableProjects]
  );
  const { staffing: teamLeadStaffing } = useServiceLineStaffing(allServiceLineIds);
  const teamLeadOptions = useMemo(() => assignableStaff.filter((u) => u.role === "supervisor"), [assignableStaff]);
  const allTags = useMemo(
    () => Array.from(new Set(browsableProjects.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b)),
    [browsableProjects]
  );

  // Every filter except status — this is what the status KPI/dropdown counts are computed over, so
  // each count honestly previews what selecting that status (on top of the other active filters)
  // will show, rather than a stale org-wide figure.
  const filteredExceptStatus = useMemo(() => {
    const query = search.trim().toLowerCase();
    return browsableProjects.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query) && !p.companyName.toLowerCase().includes(query)) return false;
      if (serviceLineFilter !== "all" && !p.services.some((s) => s.serviceLineId === serviceLineFilter)) return false;
      if (teamLeadFilter !== "all") {
        const projectServiceLineIds = p.services.map((s) => s.serviceLineId).filter((id): id is string => !!id);
        const isLeadOnAny = projectServiceLineIds.some((id) =>
          teamLeadStaffing.find((s) => s.serviceLineId === id)?.teamLeadUserIds.includes(teamLeadFilter)
        );
        if (!isLeadOnAny) return false;
      }
      if (memberFilter !== "all" && !p.members.some((m) => m.id === memberFilter)) return false;
      if (groupFilter !== "all" && p.projectGroupId !== groupFilter) return false;
      if (tagFilter !== "all" && !p.tags.includes(tagFilter)) return false;
      return true;
    });
  }, [browsableProjects, search, serviceLineFilter, teamLeadFilter, teamLeadStaffing, memberFilter, groupFilter, tagFilter]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? filteredExceptStatus : filteredExceptStatus.filter((p) => p.status === statusFilter)),
    [filteredExceptStatus, statusFilter]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<ProjectStatus, number> = { active: 0, "on-hold": 0, completed: 0, cancelled: 0, archived: 0, trash: 0 };
    for (const p of filteredExceptStatus) counts[p.status] += 1;
    return counts;
  }, [filteredExceptStatus]);

  const groups = useMemo(() => {
    if (statusFilter !== "all") {
      // A single specific status renders as one flat list — nothing to group by.
      return filtered.length > 0 ? [{ status: statusFilter, projects: filtered }] : [];
    }
    const byStatus = new Map<ProjectStatus, ProjectWithRelations[]>();
    for (const status of visibleStatuses) byStatus.set(status, []);
    for (const p of filtered) {
      byStatus.get(p.status)?.push(p);
    }
    return visibleStatuses.map((status) => ({ status, projects: byStatus.get(status) ?? [] })).filter(
      (g) => g.projects.length > 0
    );
  }, [filtered, statusFilter, visibleStatuses]);

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

  // Section 13-16 — ONE shared list/detail surface, adapted per role using only data already
  // computed elsewhere (Task status, existing Service staffing) — never a second Project
  // list/route per role, never a fabricated metric.
  const roleView: RoleView = superadmin ? "admin" : user?.role === "supervisor" ? "team-lead" : "employee";
  const rowStats = useMemo(() => {
    const map = new Map<string, RoleRowStats>();
    const today = new Date().toISOString().slice(0, 10);
    for (const project of filtered) {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const waitingCount = projectTasks.filter((t) => t.status === "waiting-on-client").length;
      const blockedCount = projectTasks.filter((t) => t.status === "blocked").length;
      const myTasks = user
        ? projectTasks.filter((t) => t.status !== "done" && t.assignees.some((a) => a.id === user.id))
        : [];
      const myOverdueCount = myTasks.filter((t) => t.dueDate != null && t.dueDate < today).length;
      const myNextDue = myTasks.map((t) => t.dueDate).filter((d): d is string => !!d).sort()[0] ?? null;

      const serviceLineIds = project.services.map((s) => s.serviceLineId).filter((id): id is string => !!id);
      const leadIds = new Set<string>();
      for (const id of serviceLineIds) {
        const staffing = teamLeadStaffing.find((s) => s.serviceLineId === id);
        staffing?.teamLeadUserIds.forEach((uid) => leadIds.add(uid));
      }
      const globalTeamLeads = Array.from(leadIds).map((uid) => ({
        id: uid,
        fullName: assignableStaff.find((u) => u.id === uid)?.fullName ?? "Unknown",
      }));

      map.set(project.id, { waitingCount, blockedCount, myOpenCount: myTasks.length, myOverdueCount, myNextDue, globalTeamLeads });
    }
    return map;
  }, [filtered, tasksByProject, teamLeadStaffing, assignableStaff, user]);

  function toggleGroup(status: ProjectStatus) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function openProject(id: string) {
    router.push(`/dashboard/projects/${id}`);
  }

  async function handleRestore(id: string) {
    if (!user) return;
    await projectsProvider.restoreProject(user, id);
    refresh();
  }

  if (!user) return null;

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
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New Project
            </Button>
          </div>
        )}
      </div>

      {/* All six statuses represented as compact KPI tiles (Admin) / four working statuses (Team
          Lead, Employee — Archived/Trash stay unreachable for them, same restriction the prior
          Admin-only toggle already enforced). Clicking a tile applies that status filter; clicking
          the already-selected tile returns to "All Statuses" — one unified system, not a competing
          second filter (Section 2/3). Counts are truthful over exactly what's already role- and
          filter-scoped (`filteredExceptStatus`) — never fabricated, never widened. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {visibleStatuses.map((status) => {
          const Icon = PROJECT_STATUS_ICONS[status];
          const color = PROJECT_STATUS_COLOR_VAR[status];
          const isSelected = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setStatusFilter(isSelected ? "all" : status)}
              className="text-left"
            >
              <Card
                className={cn("flex-row items-center gap-2.5 p-3 transition-colors", isSelected && "ring-2 ring-primary")}
              >
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
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 max-w-sm flex-1">
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
        <Select
          items={{ all: "All Statuses", ...Object.fromEntries(visibleStatuses.map((s) => [s, PROJECT_STATUS_META[s].label])) }}
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v as StatusFilter) ?? "all")}
        >
          <SelectTrigger aria-label="Filter by Status" className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {visibleStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {PROJECT_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ all: "All Services", ...Object.fromEntries(serviceLines.map((s) => [s.id, s.name])) }}
          value={serviceLineFilter}
          onValueChange={(v) => setServiceLineFilter(v ?? "all")}
        >
          <SelectTrigger aria-label="Filter by Service" className="w-40">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {serviceLines.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ all: "All Team Leads", ...Object.fromEntries(teamLeadOptions.map((u) => [u.id, u.fullName])) }}
          value={teamLeadFilter}
          onValueChange={(v) => setTeamLeadFilter(v ?? "all")}
        >
          <SelectTrigger aria-label="Filter by Team Lead" className="w-40">
            <SelectValue placeholder="Team Lead" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Team Leads</SelectItem>
            {teamLeadOptions.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ all: "All Members", ...Object.fromEntries(assignableStaff.map((u) => [u.id, u.fullName])) }}
          value={memberFilter}
          onValueChange={(v) => setMemberFilter(v ?? "all")}
        >
          <SelectTrigger aria-label="Filter by member" className="w-40">
            <SelectValue placeholder="Member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            {assignableStaff.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ all: "All Groups", ...Object.fromEntries(projectGroups.map((g) => [g.id, g.name])) }}
          value={groupFilter}
          onValueChange={(v) => setGroupFilter(v ?? "all")}
        >
          <SelectTrigger aria-label="Filter by Project Group" className="w-40">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {projectGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select
            items={{ all: "All Tags", ...Object.fromEntries(allTags.map((t) => [t, t])) }}
            value={tagFilter}
            onValueChange={(v) => setTagFilter(v ?? "all")}
          >
            <SelectTrigger aria-label="Filter by Tag" className="w-36">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!isLoading && groups.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {statusFilter === "trash"
            ? "Trash is empty."
            : statusFilter === "archived"
              ? "No archived projects."
              : "No projects match your filters."}
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <ProjectTableGroup
            key={group.status}
            status={group.status}
            projects={group.projects}
            roleView={roleView}
            rowStats={rowStats}
            serviceLines={serviceLines}
            isCollapsed={collapsedGroups.has(group.status)}
            onToggleCollapse={() => toggleGroup(group.status)}
            onOpenProject={openProject}
            onRestore={group.status === "trash" && canCreate ? handleRestore : undefined}
          />
        ))}
      </div>

      {canCreate && (
        <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" onSaved={refresh} />
      )}
    </div>
  );
}

/**
 * Actual Service names, not a bare count — compact, single line, never a chip wall. Prefers the
 * global Service Line's own catalog name ("Accounting") over the Workstream instance's own,
 * possibly-dated name ("Accounting 2026") — falls back to the instance name only for a legacy
 * Workstream with no `serviceLineId` set.
 */
function ServicesInline({
  services,
  serviceLines,
}: {
  services: { id: string; name: string; serviceLineId: string | null }[];
  serviceLines: { id: string; name: string }[];
}) {
  if (services.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const displayName = (s: { name: string; serviceLineId: string | null }) => serviceLineDisplayName(s, serviceLines);
  const shown = services.slice(0, 2);
  const overflow = services.length - shown.length;
  return (
    <span className="truncate text-xs text-muted-foreground" title={services.map(displayName).join(", ")}>
      {shown.map(displayName).join(" · ")}
      {overflow > 0 && ` +${overflow}`}
    </span>
  );
}

function ProjectIdentity({ project }: { project: ProjectWithRelations }) {
  // Phase 13B final boss-feedback pass — daily operational identity is the Company name, not the
  // date-ranged Project name (`operationalProjectIdentity`'s `primary`); a meaningful non-redundant
  // Project label is still available via `title` for anyone who needs to disambiguate on hover.
  const identity = operationalProjectIdentity(project.companyName, project.name);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
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

/** Section 14-16 — one column set per role, every figure sourced from data the page already
 * fetched. `key` values are used only to line up header labels with row cells below. Now that the
 * Gantt timeline is gone, the Project column gets the full remaining width instead of competing
 * with a fixed 520px timeline panel. */
const ROLE_COLUMNS: Record<RoleView, { key: string; label: string; width: string }[]> = {
  admin: [
    { key: "project", label: "Project", width: "minmax(240px, 2fr)" },
    { key: "services", label: "Services", width: "160px" },
    { key: "leads", label: "Team Leads", width: "170px" },
    { key: "team", label: "Team", width: "170px" },
    { key: "open", label: "Open Work", width: "100px" },
    { key: "attention", label: "Attention", width: "110px" },
  ],
  "team-lead": [
    { key: "project", label: "Project", width: "minmax(240px, 2fr)" },
    { key: "services", label: "Services", width: "160px" },
    { key: "open", label: "Open Tasks", width: "100px" },
    { key: "overdue", label: "Overdue", width: "90px" },
    { key: "waiting", label: "Waiting", width: "90px" },
    { key: "blocked", label: "Blocked", width: "90px" },
    { key: "team", label: "Team", width: "170px" },
  ],
  employee: [
    { key: "project", label: "Project", width: "minmax(240px, 2fr)" },
    { key: "myopen", label: "My Open Work", width: "120px" },
    { key: "attention", label: "Attention", width: "110px" },
    { key: "nextdue", label: "Next Due", width: "110px" },
  ],
};

function formatNextDue(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The Project browser table — one dense row per Project, role-conditional columns, full width.
 * Replaces the former combined list+Gantt row (the Gantt timeline is removed per explicit
 * product-owner instruction — see the page's own doc comment above). */
function ProjectTableGroup({
  status,
  projects,
  roleView,
  rowStats,
  serviceLines,
  isCollapsed,
  onToggleCollapse,
  onOpenProject,
  onRestore,
}: {
  status: ProjectStatus;
  projects: ProjectWithRelations[];
  roleView: RoleView;
  rowStats: Map<string, RoleRowStats>;
  serviceLines: { id: string; name: string }[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenProject: (id: string) => void;
  /** Admin-only, only ever passed for the Trash view — an explicit action, never status-select. */
  onRestore?: (id: string) => void;
}) {
  const color = PROJECT_STATUS_COLOR_VAR[status];
  const columns = ROLE_COLUMNS[roleView];
  const gridTemplateColumns = [...columns.map((c) => c.width), ...(onRestore ? ["84px"] : [])].join(" ");

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
        <div className="min-w-0 divide-y overflow-x-auto">
          <div
            className="grid h-11 min-w-fit items-center gap-3 border-b px-3 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
            style={{ gridTemplateColumns }}
          >
            {columns.map((col) => (
              <span key={col.key}>{col.label}</span>
            ))}
            {onRestore && <span>Actions</span>}
          </div>
          {projects.map((project) => {
            const stats = rowStats.get(project.id);
            return (
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
                  "grid h-12 min-w-fit cursor-pointer items-center gap-3 px-3 text-sm transition-colors hover:bg-muted/50",
                  project.isInternal && "bg-muted/20"
                )}
                style={{ gridTemplateColumns }}
              >
                {columns.map((col) => {
                  switch (col.key) {
                    case "project":
                      return <ProjectIdentity key={col.key} project={project} />;
                    case "services":
                      return <ServicesInline key={col.key} services={project.services} serviceLines={serviceLines} />;
                    case "leads":
                      return <PeopleInline key={col.key} people={stats?.globalTeamLeads ?? []} />;
                    case "team":
                      return <PeopleInline key={col.key} people={project.members} />;
                    case "open":
                      return (
                        <span key={col.key} className="text-xs text-muted-foreground">
                          {project.tasks.openCount}
                        </span>
                      );
                    case "attention":
                      return (
                        <span key={col.key}>
                          {roleView === "employee"
                            ? (stats?.myOverdueCount ?? 0) > 0 && (
                                <Badge variant="destructive" className="text-[10px]">
                                  {stats!.myOverdueCount} overdue
                                </Badge>
                              )
                            : project.tasks.overdueCount > 0 && (
                                <Badge variant="destructive" className="text-[10px]">
                                  {project.tasks.overdueCount} overdue
                                </Badge>
                              )}
                        </span>
                      );
                    case "overdue":
                      return (
                        <span key={col.key} className={cn("text-xs", project.tasks.overdueCount > 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {project.tasks.overdueCount}
                        </span>
                      );
                    case "waiting":
                      return (
                        <span key={col.key} className="text-xs text-muted-foreground">
                          {stats?.waitingCount ?? 0}
                        </span>
                      );
                    case "blocked":
                      return (
                        <span key={col.key} className={cn("text-xs", (stats?.blockedCount ?? 0) > 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {stats?.blockedCount ?? 0}
                        </span>
                      );
                    case "myopen":
                      return (
                        <span key={col.key} className="text-xs text-muted-foreground">
                          {stats?.myOpenCount ?? 0}
                        </span>
                      );
                    case "nextdue":
                      return (
                        <span key={col.key} className="text-xs text-muted-foreground">
                          {formatNextDue(stats?.myNextDue ?? null)}
                        </span>
                      );
                    default:
                      return <span key={col.key} />;
                  }
                })}
                {onRestore && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(project.id);
                    }}
                  >
                    Restore
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
