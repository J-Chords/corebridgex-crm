"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  ClipboardList,
  FolderKanban,
  Home,
  HelpCircle,
  ListChecks,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth/auth-context";
import { useHelpDialog } from "@/lib/help-dialog-context";
import { useCommandPalette } from "@/lib/command-palette-context";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { canViewTeamUpdatesPage, canViewTeamTimePage, isSuperadmin } from "@/lib/data/permissions";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

type SidebarUser = { fullName: string; email: string; role: "employee" | "supervisor" | "superadmin" };

/**
 * Phase 13B structural correction — ONE desktop sidebar component that collapses to icon-only
 * width in place, replacing the earlier split "permanent icon rail + separate wider nav panel"
 * shell (which still read as two side-by-side navigation surfaces even though it was visually one
 * shell). Collapse/expand now toggles the SAME element's width/content — no second panel ever
 * mounts alongside it. Icon-only tooltips only ever show while collapsed (the only state where a
 * label isn't already visible next to its icon); expanded mode shows real text labels and no
 * tooltips at all. Mobile keeps its own single merged Sheet, unchanged.
 */
export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen: setHelpOpen } = useHelpDialog();
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const { isMobile, openMobile, setOpenMobile, state, toggleSidebar } = useSidebar();

  // Employee-first: every role gets the same core operational destinations — Supervisor and
  // Superadmin only ever ADD to this, never replace it, per the locked "Supervisor = Employee +
  // team" / "Superadmin = + org admin" principle. Team Time/Team Updates keep their existing
  // page-level visibility gates.
  const workspaceItems: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/dashboard/my-day", label: "My Day", icon: Sun },
    { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
    { href: "/dashboard/planner", label: "Planner", icon: CalendarDays },
    { href: "/dashboard/reports/client", label: "Reports", icon: ClipboardList },
  ];
  // Project Level consolidation — Projects is now the ONE primary client/company workspace
  // destination for every role, including Superadmin; "Companies" is deliberately no longer a
  // top-level nav item (the route/data model/RLS are all untouched — Superadmin still reaches it
  // via a "View full client record" link from a Project's own Overview tab, or its direct URL).
  const clientWorkItems: NavItem[] = [{ href: "/dashboard/projects", label: "Projects", icon: FolderKanban }];
  const teamItems: NavItem[] = [
    ...(user && canViewTeamTimePage(user) ? [{ href: "/dashboard/team-time", label: "Team Time", icon: Clock }] : []),
    ...(user && canViewTeamUpdatesPage(user) ? [{ href: "/dashboard/team-updates", label: "Team Updates", icon: Users }] : []),
  ];
  const adminItems: NavItem[] = [
    ...(user && isSuperadmin(user) ? [{ href: "/dashboard/admin/users", label: "Users", icon: UsersRound }] : []),
    ...(user && isSuperadmin(user) ? [{ href: "/dashboard/admin/services", label: "Services", icon: ShieldCheck }] : []),
  ];
  const groups: NavGroup[] = [
    { label: "Workspace", items: workspaceItems },
    { label: "Client work", items: clientWorkItems },
    ...(teamItems.length > 0 ? [{ label: "Team", items: teamItems }] : []),
    ...(adminItems.length > 0 ? [{ label: "Admin", items: adminItems }] : []),
  ];

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  if (!user) return null;

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Corebridge X navigation.</SheetDescription>
          </SheetHeader>
          <MobileNavPanel
            groups={groups}
            isActive={isActive}
            user={user}
            onNavigate={() => setOpenMobile(false)}
            onOpenSearch={() => {
              setOpenMobile(false);
              setPaletteOpen(true);
            }}
            onOpenHelp={() => {
              setOpenMobile(false);
              setHelpOpen(true);
            }}
            onLogout={handleLogout}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DesktopSidebar
      groups={groups}
      isActive={isActive}
      user={user}
      collapsed={state !== "expanded"}
      onToggleCollapse={toggleSidebar}
      onOpenSearch={() => setPaletteOpen(true)}
      onOpenHelp={() => setHelpOpen(true)}
      onLogout={handleLogout}
    />
  );
}

/** One icon-only row, tooltip-labeled — collapsed mode's equivalent of a labeled `NavGroupSection`
 * row. Tooltips only ever render here (collapsed), never in expanded mode, which shows the same
 * label as real text instead. */
function CollapsedNavButton({
  icon: Icon,
  label,
  active,
  href,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    active && "bg-sidebar-accent text-sidebar-accent-foreground"
  );
  const trigger = href ? (
    <Link href={href} aria-label={label} className={className} />
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={className} />
  );
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavGroupSection({
  group,
  isActive,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
}) {
  if (group.items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
        {group.label}
      </span>
      {group.items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The one desktop sidebar (Phase 13B structural correction — Part F). `collapsed` swaps its own
 * width (w-60 expanded, w-14 collapsed) and content density — never a second panel. Expanded shows
 * real labels/group headers and no tooltips; collapsed shows icon-only rows with tooltips and a
 * thin divider between groups instead of a text header, so every destination (including
 * Projects/Team, which the old rail deliberately left out) stays reachable while collapsed too.
 */
function DesktopSidebar({
  groups,
  isActive,
  user,
  collapsed,
  onToggleCollapse,
  onOpenSearch,
  onOpenHelp,
  onLogout,
}: {
  groups: NavGroup[];
  isActive: (href: string) => boolean;
  user: SidebarUser;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSearch: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex h-svh shrink-0 flex-col border-r bg-sidebar py-3 print:hidden",
        collapsed ? "w-14 items-center" : "w-60"
      )}
    >
      {collapsed ? (
        <>
          <Link
            href="/dashboard"
            className="mb-2 flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-label="Corebridge X — Home"
          >
            <span className="text-[11px] font-bold">CX</span>
          </Link>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} aria-label="Expand navigation" />}
            >
              <ChevronsRight className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right">Expand</TooltipContent>
          </Tooltip>
          <div className="my-2 h-px w-6 bg-sidebar-border" />
          <CollapsedNavButton icon={Search} label="Search" onClick={onOpenSearch} />
          <div className="mt-2 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
            {groups.map((group, i) => (
              <div key={group.label} className="flex flex-col items-center gap-1">
                {i > 0 && <div className="my-1 h-px w-6 bg-sidebar-border" />}
                {group.items.map((item) => (
                  <CollapsedNavButton key={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} href={item.href} />
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center gap-1 border-t pt-2">
            <CollapsedNavButton icon={Settings} label="Settings" active={isActive("/dashboard/settings")} href="/dashboard/settings" />
            <CollapsedNavButton icon={HelpCircle} label="Help" onClick={onOpenHelp} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-lg hover:bg-sidebar-accent"
                    aria-label={`${user.fullName} — account menu`}
                  />
                }
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">{initials(user.fullName)}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right">{user.fullName}</TooltipContent>
            </Tooltip>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-3">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">Corebridge X</span>
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} aria-label="Collapse navigation" />}
              >
                <ChevronsLeft className="size-4" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse</TooltipContent>
            </Tooltip>
          </div>
          <div className="px-3 pt-2 pb-1">
            <SearchTriggerBar variant="compact" placeholder="Search…" />
          </div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2">
            {groups.map((group) => (
              <NavGroupSection key={group.label} group={group} isActive={isActive} />
            ))}
          </div>
          <div className="flex flex-col gap-0.5 border-t px-2 pt-2">
            <Link
              href="/dashboard/settings"
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive("/dashboard/settings") && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              <Settings className="size-4 shrink-0" aria-hidden="true" />
              <span>Settings</span>
            </Link>
            <button
              type="button"
              onClick={onOpenHelp}
              className="flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>Help</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex h-11 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-sidebar-accent data-open:bg-sidebar-accent"
                  />
                }
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">{initials(user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{user.fullName}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">{ROLE_LABELS[user.role]}</span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user.fullName}</span>
                      <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
                  <Settings />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </div>
  );
}

/** Mobile/tablet — one merged Sheet, same grouped items, no permanent split-panel footprint. */
function MobileNavPanel({
  groups,
  isActive,
  user,
  onNavigate,
  onOpenSearch,
  onOpenHelp,
  onLogout,
}: {
  groups: NavGroup[];
  isActive: (href: string) => boolean;
  user: SidebarUser;
  onNavigate: () => void;
  onOpenSearch: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <span className="text-xs font-bold">CX</span>
        </div>
        <span className="text-sm font-semibold">Corebridge X</span>
      </div>
      <div className="px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-8 w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 text-left text-sm text-muted-foreground hover:bg-muted/70"
        >
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">Search…</span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pt-2" onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a")) onNavigate();
      }}>
        {groups.map((group) => (
          <NavGroupSection key={group.label} group={group} isActive={isActive} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5 border-t px-2 py-2">
        <Link
          href="/dashboard/settings"
          onClick={onNavigate}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent",
            isActive("/dashboard/settings") && "bg-sidebar-accent font-medium"
          )}
        >
          <Settings className="size-4 shrink-0" aria-hidden="true" />
          <span>Settings</span>
        </Link>
        <button
          type="button"
          onClick={onOpenHelp}
          className="flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-sidebar-accent"
        >
          <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>Help</span>
        </button>
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{user.fullName}</span>
            <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onLogout} aria-label="Log out">
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
