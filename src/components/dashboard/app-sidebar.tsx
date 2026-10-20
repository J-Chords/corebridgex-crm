"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
  LogOut,
  Search,
  Settings,
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
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";
import { getNavGroups, isNavItemActive, type NavGroup } from "@/components/dashboard/nav-config";
import { cn } from "@/lib/utils";

import { getInitials as initials } from "@/lib/initials";

type SidebarUser = { fullName: string; email: string; role: "employee" | "supervisor" | "superadmin" };

/**
 * Phase 13B structural correction — ONE desktop sidebar component that collapses to icon-only
 * width in place, replacing the earlier split "permanent icon rail + separate wider nav panel"
 * shell (which still read as two side-by-side navigation surfaces even though it was visually one
 * shell). Collapse/expand now toggles the SAME element's width/content — no second panel ever
 * mounts alongside it. Icon-only tooltips only ever show while collapsed (the only state where a
 * label isn't already visible next to its icon); expanded mode shows real text labels and no
 * tooltips at all. Mobile keeps its own single merged Sheet, unchanged.
 *
 * CD-227 (UI-2) — nav-group construction moved to the shared `nav-config.ts` module so
 * `DashboardTopbar`'s current-location label can read the exact same list instead of a second,
 * driftable copy; role-visibility predicates/order are byte-identical to before this extraction.
 */
export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen: setHelpOpen } = useHelpDialog();
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const { isMobile, openMobile, setOpenMobile, state, toggleSidebar } = useSidebar();

  const groups = getNavGroups(user);

  function isActive(href: string) {
    return isNavItemActive(pathname, href);
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
    "relative flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors duration-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
        {/* Icon-only mode has no label text to carry the active signal, so a small dot
           underneath does — same restrained "accent, not a repaint" language as the
           expanded row's left bar below. */}
        {active && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-primary" />}
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
      <span className="px-2.5 pb-1.5 font-mono text-[10px] font-semibold tracking-wider text-sidebar-foreground/45 uppercase">
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
              "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-sidebar-foreground/80 transition-colors duration-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            )}
          >
            {/* Confident-but-restrained active indicator — a thin accent bar, not a repaint of
               the whole row (the tinted background already does that). Same visual language as
               the collapsed icon's active dot below. */}
            {active && (
              <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />
            )}
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
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
 *
 * CD-227 (UI-2) — a small desktop-only inset (margin + rounded corners + a real elevation token,
 * reusing the same `shadow-floating`/`ring-foreground/10` signature as every `Card` in the product)
 * instead of a flush edge-to-edge panel, so the nav panel reads as its own distinct surface against
 * the shell's neutral canvas (see `dashboard/layout.tsx`) rather than just a bordered strip.
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
        "sticky top-2 z-10 ml-2 flex h-[calc(100svh-1rem)] shrink-0 flex-col rounded-xl bg-sidebar py-3 shadow-floating ring-1 ring-foreground/10 transition-[width] duration-200 ease-linear print:hidden",
        collapsed ? "w-14 items-center" : "w-60"
      )}
    >
      {collapsed ? (
        <>
          <Link
            href="/dashboard"
            className="mb-2 flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-label="Corebridge X home"
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
          {/* A distinct "utility zone" — its own tinted panel, not just a divider line — so
             account/settings/help reads as a separate footer region, matching the expanded
             sidebar's own account-area treatment below. */}
          <div className="mt-2 flex w-full flex-col items-center gap-1 rounded-lg bg-sidebar-accent/30 py-2">
            <CollapsedNavButton icon={Settings} label="Settings" active={isActive("/dashboard/settings")} href="/dashboard/settings" />
            <CollapsedNavButton icon={HelpCircle} label="Help" onClick={onOpenHelp} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-lg hover:bg-sidebar-accent"
                    aria-label={`${user.fullName}, account menu`}
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
          <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2" aria-label="Corebridge X home">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <span className="text-[10px] font-bold">CX</span>
              </span>
              <span className="truncate font-heading text-[15px] font-semibold text-sidebar-foreground">Corebridge X</span>
            </Link>
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon-sm" onClick={onToggleCollapse} aria-label="Collapse navigation" />}
              >
                <ChevronsLeft className="size-4" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse</TooltipContent>
            </Tooltip>
          </div>
          {/* The brand row above is its own header cap — a real rule beneath it, not just
             whitespace, so "brand / navigation / account" reads as three distinct zones instead
             of one continuous list. */}
          <div className="border-t border-sidebar-border" />
          <div className="px-3 pt-3 pb-1">
            <SearchTriggerBar variant="compact" placeholder="Search…" />
          </div>
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2.5">
            {groups.map((group) => (
              <NavGroupSection key={group.label} group={group} isActive={isActive} />
            ))}
          </div>
          {/* Account footer — its own tinted panel (not just a divider + plain rows), so it reads
             as a distinct "utility zone" the way the collapsed rail's own footer now does too. */}
          <div className="mx-2 mt-2 flex flex-col gap-0.5 rounded-lg bg-sidebar-accent/30 p-1.5">
            <Link
              href="/dashboard/settings"
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors duration-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive("/dashboard/settings") && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              <Settings className="size-4 shrink-0" aria-hidden="true" />
              <span>Settings</span>
            </Link>
            <button
              type="button"
              onClick={onOpenHelp}
              className="flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-sm text-sidebar-foreground/80 transition-colors duration-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>Help</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex h-11 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors duration-standard hover:bg-sidebar-accent data-open:bg-sidebar-accent"
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

/** Mobile/tablet — one merged Sheet, same grouped items, no permanent split-panel footprint.
 * Desktop's floating inset is a desktop-only affordance (full-bleed Sheet already treats mobile
 * width as precious) — the same brand/nav/account hierarchy carries over without it. */
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
      <div className="flex items-center gap-2 border-b px-3.5 py-3.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <span className="text-xs font-bold">CX</span>
        </span>
        <span className="font-heading text-[15px] font-semibold">Corebridge X</span>
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
      <div
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2.5 pt-3"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("a")) onNavigate();
        }}
      >
        {groups.map((group) => (
          <NavGroupSection key={group.label} group={group} isActive={isActive} />
        ))}
      </div>
      <div className="mx-2 mb-2 flex flex-col gap-0.5 rounded-lg bg-sidebar-accent/30 p-1.5">
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
