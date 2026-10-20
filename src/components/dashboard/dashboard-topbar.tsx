"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/auth-context";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { getCurrentNavLabel } from "@/components/dashboard/nav-config";

/**
 * Account switching (name/role/log out) lives in the sidebar's own user footer now — keeping an
 * identical second menu here would just be redundant chrome.
 *
 * CD-227 (UI-2) — the compact location label reads from the exact same nav-item list the sidebar
 * highlights from (`nav-config.ts`'s `getCurrentNavLabel`), not an invented breadcrumb or a second
 * route-metadata system. It's intentionally a single word (the matching nav destination's own
 * label), omitted entirely on routes that don't correspond to one (e.g. a Company detail page,
 * which isn't a top-level nav destination) — never a guessed or fabricated label.
 */
export function DashboardTopbar() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const locationLabel = getCurrentNavLabel(pathname, user);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md print:hidden">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      {locationLabel && (
        <span className="truncate text-sm font-medium text-foreground">{locationLabel}</span>
      )}
      <div className="flex flex-1 items-center justify-end gap-2">
        <NotificationsBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
