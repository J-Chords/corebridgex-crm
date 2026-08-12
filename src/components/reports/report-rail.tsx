"use client";

import { FileText } from "lucide-react";
import { countActivities, countCompleted } from "@/lib/data/accomplishments-report-totals";
import type { AccomplishmentsReportBrandSection } from "@/lib/data/types";

function scrollToSection(brandId: string) {
  document.getElementById(`section-${brandId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface ReportRailProps {
  sections: AccomplishmentsReportBrandSection[];
}

/** The same "Report contents" quick-jump rail Client Reports uses — one entry per brand section, its completion count standing in for Client Reports' duration total. */
export function ReportRail({ sections }: ReportRailProps) {
  if (sections.length === 0) return null;

  return (
    <aside className="sticky top-4 self-start rounded-xl border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Report contents
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Jump to a brand.</p>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {sections.map((section) => (
          <button
            key={section.brandId}
            type="button"
            onClick={() => scrollToSection(section.brandId)}
            className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            <span className="min-w-0 truncate">{section.brandName}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {countCompleted([section])}/{countActivities([section])}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
