"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Building2,
  Clock,
  ClipboardList,
  Home,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth/auth-context";
import { useHelpDialog } from "@/lib/help-dialog-context";
import { ROLE_LABELS } from "@/lib/data/role-labels";
import { canManageTasks, canViewTeamUpdatesPage, canViewTeamTimePage } from "@/lib/data/permissions";
import { SearchTriggerBar } from "@/components/dashboard/search-trigger-bar";

import { getInitials as initials } from "@/lib/initials";

export function AppSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen: setHelpOpen } = useHelpDialog();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/my-day", label: "My Day", icon: Sun },
    { href: "/dashboard/companies", label: "Companies", icon: Building2 },
    ...(user && canManageTasks(user)
      ? [{ href: "/dashboard/tasks", label: "Tasks", icon: ListChecks }]
      : []),
    { href: "/dashboard/reports", label: "Reports", icon: ClipboardList },
    ...(user && canViewTeamUpdatesPage(user)
      ? [{ href: "/dashboard/team-updates", label: "Team Updates", icon: Users }]
      : []),
    ...(user && canViewTeamTimePage(user)
      ? [{ href: "/dashboard/team-time", label: "Team Time", icon: Clock }]
      : []),
  ];

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-xs font-bold">CX</span>
          </div>
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Corebridge X
          </span>
        </div>
        <SearchTriggerBar
          variant="compact"
          placeholder="Search…"
          className="group-data-[collapsible=icon]:hidden"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {user ? ROLE_LABELS[user.role] : ""}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton render={<Link href={href} />} isActive={isActive} tooltip={label}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/dashboard" />} isActive={pathname === "/dashboard"} tooltip="Home">
              <Home />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setHelpOpen(true)} tooltip="Help">
              <HelpCircle />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/dashboard/settings" />}
              isActive={pathname.startsWith("/dashboard/settings")}
              tooltip="Settings"
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton size="lg" tooltip={user.fullName} className="data-open:bg-sidebar-accent" />
              }
            >
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initials(user.fullName)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-medium">{user.fullName}</span>
                <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
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
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
