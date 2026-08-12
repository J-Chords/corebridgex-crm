"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/auth-context";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";

/** Account switching (name/role/log out) lives in the sidebar's own user footer now — keeping an identical second menu here would just be redundant chrome. */
export function DashboardTopbar() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 print:hidden">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex flex-1 items-center justify-end gap-2">
        <NotificationsBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
