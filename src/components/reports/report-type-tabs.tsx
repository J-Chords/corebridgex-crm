"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

interface ReportTypeTabsProps {
  active: "accomplishments" | "client";
}

/**
 * Switches between the internal report ("Internal Reports") and the client-facing Client Reports
 * area — two distinct routes/types, presented as one cohesive "Reports" section. Phase 9B: shown
 * to every role now that Employees may generate and view their own Client Report drafts too — each
 * page's own content still scopes correctly per viewer (an Employee only ever sees their own
 * generated reports on the Client Reports page, never a "Team's/All" section).
 */
export function ReportTypeTabs({ active }: ReportTypeTabsProps) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="flex w-fit items-center gap-0.5 rounded-lg border p-0.5">
      <Link
        href="/dashboard/reports"
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          active === "accomplishments" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Internal Reports
      </Link>
      <Link
        href="/dashboard/reports/client"
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          active === "client" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Client Reports
      </Link>
    </div>
  );
}
