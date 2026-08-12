"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageClientReports } from "@/lib/data/permissions";
import { cn } from "@/lib/utils";

interface ReportTypeTabsProps {
  active: "accomplishments" | "client";
}

/** Switches between the internal Accomplishments Report and the client-facing Client Reports area — two distinct routes/types, presented as one cohesive "Reports" section. Self-hides for employees, who have no access to Client Reports at all. */
export function ReportTypeTabs({ active }: ReportTypeTabsProps) {
  const { user } = useAuth();
  if (!user || !canManageClientReports(user)) return null;

  return (
    <div className="flex w-fit items-center gap-0.5 rounded-lg border p-0.5">
      <Link
        href="/dashboard/reports"
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          active === "accomplishments" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Accomplishments
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
