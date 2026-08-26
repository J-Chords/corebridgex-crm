"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronsLeft,
  Clock,
  ClipboardList,
  FolderKanban,
  Home,
  HelpCircle,
  ListChecks,
  LogOut,
  Search,
  Settings,
  Sun,
  Users,
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

/**
 * Phase 12B — split shell (thin icon rail + wider grouped nav panel), replacing the single
 * shadcn `<Sidebar>` tree entirely. Deliberately built from plain flex children rather than the
 * `Sidebar` component's own fixed/gap/offcanvas machinery — since both the rail and the nav panel
 * are meant to sit in the SAME flex row as the page content (not overlay it), plain `sticky`
 * children of `SidebarProvider`'s own `flex` wrapper are simpler and need no extra layout
 * scaffolding. Still reads `useSidebar()` for `isMobile`/`openMobile`/`state` — so the existing
 * `SidebarTrigger` in the topbar and the Cmd/Ctrl+B shortcut keep working unchanged: on desktop,
 * toggling now shows/hides the wider nav panel (the rail always stays visible); on mobile, it
 * opens/closes the one merged navigation Sheet below (Part A/5 — no permanent two-panel footprint
 * on phones).
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
  // team" / "Superadmin = + org admin" principle. Companies is Superadmin-only (existing gate);
  // Team Time/Team Updates keep their existing page-level visibility gates.
  const workspaceItems: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/dashboard/my-day", label: "My Day", icon: Sun },
    { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
    { href: "/dashboard/planner", label: "Planner", icon: CalendarDays },
    { href: "/dashboard/reports/client", label: "Reports", icon: ClipboardList },
  ];
  const clientWorkItems: NavItem[] = [
    ...(user && isSuperadmin(user) ? [{ href: "/dashboard/companies", label: "Companies", icon: Building2 }] : []),
    { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  ];
  const teamItems: NavItem[] = [
    ...(user && canViewTeamTimePage(user) ? [{ href: "/dashboard/team-time", label: "Team Time", icon: Clock }] : []),
    ...(user && canViewTeamUpdatesPage(user) ? [{ href: "/dashboard/team-updates", label: "Team Updates", icon: Users }] : []),
  ];
  const groups: NavGroup[] = [
    { label: "Workspace", items: workspaceItems },
    { label: "Client work", items: clientWorkItems },
    ...(teamItems.length > 0 ? [{ label: "Team", items: teamItems }] : []),
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
    <>
      <IconRail isActive={isActive} onOpenSearch={() => setPaletteOpen(true)} />
      {state === "expanded" && (
        <NavPanel
          groups={groups}
          isActive={isActive}
          user={user}
          onToggle={toggleSidebar}
          onOpenHelp={() => setHelpOpen(true)}
          onLogout={handleLogout}
        />
      )}
    </>
  );
}

const RAIL_SHORTCUTS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/my-day", label: "My Day", icon: Sun },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
  { href: "/dashboard/planner", label: "Planner", icon: CalendarDays },
  { href: "/dashboard/reports/client", label: "Reports", icon: ClipboardList },
];

function RailButton({
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

/** Thin icon rail — Part A/2. Quick global access only; every icon requires a tooltip since it's
 * icon-only. Deliberately does not include Companies/Projects/Team surfaces — those live in the
 * wider nav panel only, matching the reference's own "rail = a short, fixed shortcut list" role. */
function IconRail({
  isActive,
  onOpenSearch,
}: {
  isActive: (href: string) => boolean;
  onOpenSearch: () => void;
}) {
  const railHrefs = new Set(RAIL_SHORTCUTS.map((s) => s.href));
  return (
    <div className="sticky top-0 z-10 flex h-svh w-14 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3 print:hidden">
      <Link
        href="/dashboard"
        className="mb-2 flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
        aria-label="Corebridge X — Home"
      >
        <span className="text-[11px] font-bold">CX</span>
      </Link>
      <RailButton icon={Search} label="Search" onClick={onOpenSearch} />
      <div className="my-1 h-px w-6 bg-sidebar-border" />
      {RAIL_SHORTCUTS.map((item) => (
        <RailButton
          key={item.href}
          icon={item.icon}
          label={item.label}
          active={railHrefs.has(item.href) && isActive(item.href)}
          href={item.href}
        />
      ))}
    </div>
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

/** Wider nav panel — Part A/3. Grouped, compact uppercase section labels, thin rows — deliberately
 * close in density to the reference's own nav list, not the old roomier single-list sidebar. */
function NavPanel({
  groups,
  isActive,
  user,
  onToggle,
  onOpenHelp,
  onLogout,
}: {
  groups: NavGroup[];
  isActive: (href: string) => boolean;
  user: { fullName: string; email: string; role: "employee" | "supervisor" | "superadmin" };
  onToggle: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-svh w-60 shrink-0 flex-col border-r bg-sidebar py-3 print:hidden">
      <div className="flex items-center justify-between gap-2 px-3">
        <span className="truncate text-sm font-semibold text-sidebar-foreground">Corebridge X</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse navigation" />
            }
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
    </div>
  );
}

/** Mobile/tablet — Part A/5: one merged Sheet, same grouped items, no permanent split-panel footprint. */
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
  user: { fullName: string; email: string; role: "employee" | "supervisor" | "superadmin" };
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
