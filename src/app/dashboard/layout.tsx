"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import { PageTransition } from "@/components/dashboard/page-transition";
import { KeyboardShortcuts } from "@/components/dashboard/keyboard-shortcuts";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { CommandPaletteProvider } from "@/lib/command-palette-context";
import { HelpDialogProvider } from "@/lib/help-dialog-context";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    } else if (!isLoading && user?.mustChangePassword) {
      // Admin Foundation Part 10 — forced first-login password-change gate. Application-level
      // only, never in src/proxy.ts (which stays a pure session-cookie refresh).
      router.replace("/change-password");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.mustChangePassword) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <CommandPaletteProvider>
      <HelpDialogProvider>
        <ToastProvider>
          <KeyboardShortcuts />
          <CommandPalette />
          <SidebarProvider>
            <AppSidebar />
            <div className="flex min-h-svh min-w-0 flex-1 flex-col">
              <DashboardTopbar />
              <main className="min-w-0 flex-1 bg-muted/20 p-6 print:bg-white print:p-0">
                <PageTransition>{children}</PageTransition>
              </main>
            </div>
          </SidebarProvider>
          <Toaster />
        </ToastProvider>
      </HelpDialogProvider>
    </CommandPaletteProvider>
  );
}
