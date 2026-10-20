import {
  ClipboardList,
  FolderKanban,
  Home,
  ListChecks,
  ShieldCheck,
  Sun,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { canViewTeamActivityPage, isSuperadmin } from "@/lib/data/permissions";
import type { User } from "@/lib/data/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The one source of truth for authenticated nav destinations/labels/role-visibility — extracted
 * from `AppSidebar` so `DashboardTopbar` can derive a current-location label from the exact same
 * list instead of a second, driftable copy. Role-filtering behavior is byte-identical to before
 * this extraction — same predicates, same conditions, same order.
 */
export function getNavGroups(user: User | null): NavGroup[] {
  const workspaceItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/dashboard/my-day", label: "My Day", icon: Sun },
    { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
    { href: "/dashboard/reports/client", label: "Reports", icon: ClipboardList },
  ];
  const clientWorkItems: NavItem[] = [{ href: "/dashboard/projects", label: "Projects", icon: FolderKanban }];
  const teamItems: NavItem[] = [
    ...(user && canViewTeamActivityPage(user) ? [{ href: "/dashboard/team-activity", label: "Team Activity", icon: Users }] : []),
  ];
  const adminItems: NavItem[] = [
    ...(user && isSuperadmin(user) ? [{ href: "/dashboard/admin/users", label: "Users", icon: UsersRound }] : []),
    ...(user && isSuperadmin(user) ? [{ href: "/dashboard/admin/templates", label: "Templates", icon: ShieldCheck }] : []),
  ];
  return [
    { label: "Workspace", items: workspaceItems },
    { label: "Client work", items: clientWorkItems },
    ...(teamItems.length > 0 ? [{ label: "Team", items: teamItems }] : []),
    ...(adminItems.length > 0 ? [{ label: "Admin", items: adminItems }] : []),
  ];
}

/** Same "is this route active" rule `AppSidebar` already used — kept here so the topbar's derived
 * location label and the sidebar's own highlighted row can never disagree. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

/** The nav item (if any) whose route the current pathname matches — used for the topbar's compact
 * location label. Falls back to "Settings" (shell-owned, not part of any group) since it's the one
 * authenticated destination every role can reach that isn't in the main nav groups. */
export function getCurrentNavLabel(pathname: string, user: User | null): string | null {
  if (isNavItemActive(pathname, "/dashboard/settings")) return "Settings";
  for (const group of getNavGroups(user)) {
    for (const item of group.items) {
      if (isNavItemActive(pathname, item.href)) return item.label;
    }
  }
  return null;
}
