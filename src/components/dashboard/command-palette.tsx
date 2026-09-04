"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  Layers,
  ListChecks,
  Plus,
  Search,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCommandPalette } from "@/lib/command-palette-context";
import { NAV_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import {
  ALL_TAB_CATEGORY_LIMIT,
  PALETTE_CATEGORY_LABELS,
  PALETTE_CATEGORY_ORDER,
  matchesQuery,
  type PaletteCategory,
  type PaletteResult,
} from "@/lib/command-palette";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProjects } from "@/lib/data/hooks/use-projects";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useClientReports } from "@/lib/data/hooks/use-client-reports";
import { projectHrefForCompany } from "@/lib/data/project-display";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Same icon-per-route mapping `AppSidebar` uses for its nav items — kept local since `NAV_SHORTCUTS` itself is icon-less (shared with the keyboard-shortcut help overlay, which doesn't need icons). */
const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/my-day": Sun,
  "/dashboard/projects": Building2,
  "/dashboard/tasks": ListChecks,
  "/dashboard/reports/client": ClipboardList,
};

/**
 * The Ctrl+K / ⌘K command palette — mounted once in `dashboard/layout.tsx`, open state shared via
 * `CommandPaletteProvider` with both the topbar's search-bar trigger and the global keyboard listener.
 * Body only mounts while open, so its data hooks (and their fetches) don't run on every page load —
 * only when someone actually opens the palette.
 */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl">
        {open && <CommandPaletteBody onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CommandPaletteBody({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<PaletteCategory | "all">("all");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [hasNewTaskTrigger, setHasNewTaskTrigger] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { companies, isLoading: companiesLoading } = useCompanies();
  const { projects } = useProjects();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { workstreams, isLoading: workstreamsLoading } = useWorkstreams();
  const { reports, isLoading: reportsLoading } = useClientReports();
  const { assignableStaff, isLoading: staffLoading } = useCompanyLookups();

  // Whichever page the palette was opened from may or may not have an existing "new task" trigger
  // to reuse — recomputed fresh every time the palette opens, since Ctrl+K works from any page.
  useEffect(() => {
    // One-time DOM read on mount (i.e. on open, since this body only mounts while open).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasNewTaskTrigger(document.querySelector('[data-shortcut="new-task"]') !== null);
  }, []);

  const resultsByCategory = useMemo<Record<PaletteCategory, PaletteResult[]>>(() => {
    if (!user) {
      return { companies: [], tasks: [], workstreams: [], reports: [], people: [], actions: [] };
    }

    const actions: PaletteResult[] = NAV_SHORTCUTS.filter((s) => !s.isVisible || s.isVisible(user)).map((s) => ({
      id: `nav-${s.href}`,
      category: "actions",
      title: `Go to ${s.label}`,
      icon: NAV_ICONS[s.href] ?? LayoutDashboard,
      href: s.href,
    }));
    if (hasNewTaskTrigger) {
      actions.push({
        id: "action-new-task",
        category: "actions",
        title: "New task",
        subtitle: "Opens this page's new-task dialog",
        icon: Plus,
        onSelect: () => {
          document.querySelector<HTMLButtonElement>('[data-shortcut="new-task"]')?.click();
          onClose();
        },
      });
    }

    return {
      companies: companies.map((c) => ({
        id: `company-${c.id}`,
        category: "companies",
        title: c.name,
        subtitle: c.brand?.name ?? "No brand yet",
        icon: Building2,
        href: projectHrefForCompany(c.id, projects),
      })),
      tasks: tasks.map((t) => ({
        id: `task-${t.id}`,
        category: "tasks",
        title: t.title,
        subtitle: `${t.company.name} · ${TASK_STATUS_SELECT_ITEMS[t.status]}`,
        icon: ListChecks,
        href: `/dashboard/tasks/${t.id}`,
      })),
      workstreams: workstreams.map((w) => ({
        id: `workstream-${w.id}`,
        category: "workstreams",
        title: w.name,
        subtitle: w.company.name,
        icon: Layers,
        href: `/dashboard/workstreams/${w.id}`,
      })),
      reports: reports.map((r) => ({
        id: `report-${r.id}`,
        category: "reports",
        title: r.companyLabel,
        subtitle: r.rangeStart === r.rangeEnd ? `Client report · ${r.rangeStart}` : `Client report · ${r.rangeStart}–${r.rangeEnd}`,
        icon: ClipboardList,
        href: `/dashboard/reports/client/${r.id}`,
      })),
      // No per-person profile page exists yet — the closest existing surface for "see their work"
      // is the team task list, which only ever appears for the same roles this list is non-empty for.
      // Excludes the viewer themselves — same convention `NeedsAttentionStrip` already established
      // ("teammates," not a mirror of your own My Day).
      people: assignableStaff
        .filter((u) => u.id !== user.id)
        .map((u) => ({
          id: `person-${u.id}`,
          category: "people",
          title: u.fullName,
          subtitle: `${ROLE_LABELS[u.role]} · View their tasks`,
          icon: Users,
          href: "/dashboard/tasks",
        })),
      actions,
    };
  }, [user, companies, projects, tasks, workstreams, reports, assignableStaff, hasNewTaskTrigger, onClose]);

  const visibleCategories = useMemo(
    () => PALETTE_CATEGORY_ORDER.filter((cat) => cat === "actions" || resultsByCategory[cat].length > 0),
    [resultsByCategory]
  );

  const groups = useMemo(() => {
    const cats = activeCategory === "all" ? visibleCategories : [activeCategory];
    const trimmedQuery = query.trim();

    return cats
      .map((cat) => {
        const bucket = resultsByCategory[cat];
        let items: PaletteResult[];
        if (!trimmedQuery) {
          // Empty query on "All" only shows Actions (a useful default, not a giant unfiltered dump);
          // a specific category tab browses that category's full list instead.
          items = activeCategory === "all" ? (cat === "actions" ? bucket : []) : bucket;
        } else {
          items = bucket.filter((r) => matchesQuery(r, trimmedQuery));
        }
        if (activeCategory === "all") items = items.slice(0, ALL_TAB_CATEGORY_LIMIT);
        return { category: cat, items };
      })
      .filter((g) => g.items.length > 0);
  }, [activeCategory, visibleCategories, resultsByCategory, query]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Resets the highlight to the top whenever the query/tab changes — adjusted during render (React's
  // recommended pattern for this) rather than in an effect, so it never causes an extra render pass.
  const resultsKey = `${activeCategory} ${query}`;
  const [prevResultsKey, setPrevResultsKey] = useState(resultsKey);
  if (resultsKey !== prevResultsKey) {
    setPrevResultsKey(resultsKey);
    setHighlightedIndex(0);
  }

  // Clamped at read time instead of synced back into state — data finishing its fetch can shrink
  // flatResults without the query/tab changing, and this needs no extra state or effect to stay valid.
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(flatResults.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-result-index="${safeHighlightedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeHighlightedIndex]);

  if (!user) return null;

  function selectResult(result: PaletteResult) {
    if (result.onSelect) {
      result.onSelect();
      return;
    }
    if (result.href) {
      router.push(result.href);
      onClose();
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex(Math.min(safeHighlightedIndex + 1, flatResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex(Math.max(safeHighlightedIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = flatResults[safeHighlightedIndex];
      if (result) selectResult(result);
    }
  }

  const isLoading = companiesLoading || tasksLoading || workstreamsLoading || reportsLoading || staffLoading;
  let runningIndex = 0;

  return (
    <div className="flex flex-col">
      <div className="relative border-b">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search projects, tasks, services, reports, people…"
          aria-label="Search"
          className="h-12 rounded-none border-0 pl-11 text-base focus-visible:ring-0"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button
          size="sm"
          variant={activeCategory === "all" ? "secondary" : "ghost"}
          aria-pressed={activeCategory === "all"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setActiveCategory("all")}
        >
          All
        </Button>
        {visibleCategories.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={activeCategory === cat ? "secondary" : "ghost"}
            aria-pressed={activeCategory === cat}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setActiveCategory(cat)}
          >
            {PALETTE_CATEGORY_LABELS[cat]}
          </Button>
        ))}
      </div>

      <div ref={listRef} className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {isLoading ? "Loading…" : query.trim() ? `No results for "${query.trim()}".` : "Nothing to show yet."}
          </p>
        ) : (
          groups.map((group) => {
            const startIndex = runningIndex;
            runningIndex += group.items.length;
            return (
              <div key={group.category} className="mb-1 last:mb-0">
                {activeCategory === "all" && (
                  <span className="mt-2 mb-1 block px-3 font-mono text-xs tracking-wider text-muted-foreground uppercase first:mt-0">
                    {PALETTE_CATEGORY_LABELS[group.category]}
                  </span>
                )}
                {group.items.map((result, i) => {
                  const index = startIndex + i;
                  const Icon = result.icon;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      data-result-index={index}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectResult(result)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        index === safeHighlightedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
