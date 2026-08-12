"use client";

import { FileText } from "lucide-react";
import { formatMinutes } from "@/lib/format-minutes";
import { sumDepartment } from "@/lib/data/client-report-totals";
import type { ClientReportDepartmentSection } from "@/lib/data/types";

interface ClientReportRailProps {
  departments: ClientReportDepartmentSection[];
}

function scrollToSection(departmentId: string | null) {
  const el = document.getElementById(`section-${departmentId ?? "other"}`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** ACAS's "Report contents" rail, adapted — a quick-jump index of the sections actually in this report. No include/exclude toggle here: unlike ACAS's fixed universe of ~13 possible modules, a section either exists in this draft (because it was worked or added) or it doesn't — "+ Add section" and removing a section together already are the inclusion mechanism. */
export function ClientReportRail({ departments }: ClientReportRailProps) {
  if (departments.length === 0) return null;

  return (
    <aside className="sticky top-4 self-start rounded-xl border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Report contents
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Jump to a department.</p>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {departments.map((dept) => (
          <button
            key={dept.departmentId ?? "other"}
            type="button"
            onClick={() => scrollToSection(dept.departmentId)}
            className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            <span className="min-w-0 truncate">{dept.departmentName}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatMinutes(sumDepartment(dept))}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
